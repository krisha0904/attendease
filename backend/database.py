import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./attendease_dev.db")
engine_options = {"pool_pre_ping": True}

if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}
    engine = create_engine(DATABASE_URL, **engine_options)
else:
    try:
        mysql_options = {"pool_pre_ping": True, "connect_args": {"connect_timeout": 2}}
        candidate_engine = create_engine(DATABASE_URL, **mysql_options)
        with candidate_engine.connect():
            pass
        engine = candidate_engine
    except Exception as e:
        print(f"Notice: Primary database ({DATABASE_URL}) unreachable: {e}. Falling back to SQLite.")
        fallback_url = "sqlite:///./attendease.db"
        engine = create_engine(fallback_url, connect_args={"check_same_thread": False}, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
