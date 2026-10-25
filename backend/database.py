import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Prefer database connection from .env, but keep SQLite as a fallback for local testing.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///./attendance.db"

try:
    if "sqlite" in SQLALCHEMY_DATABASE_URL:
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args={"check_same_thread": False}
        )
    else:
        engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
except Exception:
    # Fallback to SQLite if the configured DB is unavailable.
    SQLALCHEMY_DATABASE_URL = "sqlite:///./attendance.db"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False}
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_database_schema():
    inspector = inspect(engine)
    table_columns = {}

    for table_name in inspector.get_table_names():
        table_columns[table_name] = {col["name"] for col in inspector.get_columns(table_name)}

    migration_steps = {
        "attendance": [
            ("date", "DATETIME"),
            ("out_of_range_reason", "VARCHAR(100)"),
            ("out_of_range_remarks", "VARCHAR(500)"),
        ],
        "users": [
            ("face_embedding", "VARCHAR(5000)"),
        ],
        "breaks": [
            ("duration_seconds", "INT"),
        ],
    }

    for table_name, columns in migration_steps.items():
        if table_name not in table_columns:
            continue
        for col_name, col_type in columns:
            if col_name not in table_columns[table_name]:
                try:
                    with engine.begin() as conn:
                        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))
                except Exception as exc:
                    print(f"Schema migration warning for {table_name}.{col_name}: {exc}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
