import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SQLITE_PATH = os.path.join(BASE_DIR, "attendease_dev.db")
DEFAULT_SQLITE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH.replace(os.sep, '/')}"

if os.getenv("ATTENDEASE_TESTING") == "1":
    DATABASE_URL = "sqlite:///:memory:"
else:
    DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)
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
        print(f"Notice: Primary database ({DATABASE_URL}) unreachable: {e}. Falling back to SQLite ({DEFAULT_SQLITE_URL}).")
        engine = create_engine(DEFAULT_SQLITE_URL, connect_args={"check_same_thread": False}, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
