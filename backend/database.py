import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Get URL from .env file or default to local SQLite database
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///./attendance.db"

# Configure engine based on DB type
if "sqlite" in SQLALCHEMY_DATABASE_URL:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    try:
        engine = create_engine(SQLALCHEMY_DATABASE_URL)
    except Exception:
        # Fallback to local SQLite if MySQL connection fails
        SQLALCHEMY_DATABASE_URL = "sqlite:///./attendance.db"
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
        )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
