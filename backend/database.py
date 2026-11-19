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
        test_engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
        # Test connection; if MySQL is not running, fall back gracefully to SQLite
        with test_engine.connect() as conn:
            pass
        engine = test_engine
except Exception as e:
    print(f"Notice: Primary database ({SQLALCHEMY_DATABASE_URL}) unreachable: {e}. Falling back to SQLite.")
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
            ("lat", "FLOAT"),
            ("lng", "FLOAT"),
            ("geofence_verified", "INT"),
            ("face_verified", "INT"),
        ],
        "users": [
            ("face_embedding", "VARCHAR(5000)"),
            ("specialization", "VARCHAR(100)"),
            ("password_hash", "VARCHAR(255)"),
            ("is_active", "INT"),
            ("is_face_enrolled", "INT"),
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

    if "users" in table_columns and "email" in table_columns["users"]:
        dialect = engine.dialect.name
        if dialect == "sqlite":
            with engine.begin() as conn:
                conn.execute(text(
                    "CREATE TRIGGER IF NOT EXISTS users_email_required_insert "
                    "BEFORE INSERT ON users WHEN NEW.email IS NULL OR TRIM(NEW.email) = '' "
                    "BEGIN SELECT RAISE(ABORT, 'users.email is required'); END"
                ))
                conn.execute(text(
                    "CREATE TRIGGER IF NOT EXISTS users_email_required_update "
                    "BEFORE UPDATE OF email ON users WHEN NEW.email IS NULL OR TRIM(NEW.email) = '' "
                    "BEGIN SELECT RAISE(ABORT, 'users.email is required'); END"
                ))
        elif dialect in {"mysql", "mariadb", "postgresql"}:
            email_column = next(
                column for column in inspect(engine).get_columns("users")
                if column["name"] == "email"
            )
            if email_column.get("nullable", True):
                with engine.begin() as conn:
                    missing_email_count = conn.execute(text(
                        "SELECT COUNT(*) FROM users WHERE email IS NULL OR TRIM(email) = ''"
                    )).scalar()
                    if missing_email_count == 0:
                        if dialect in {"mysql", "mariadb"}:
                            conn.execute(text(
                                "ALTER TABLE users MODIFY email VARCHAR(100) NOT NULL"
                            ))
                        else:
                            conn.execute(text(
                                "ALTER TABLE users ALTER COLUMN email SET NOT NULL"
                            ))
                    else:
                        print(
                            "Schema migration warning: users.email remains nullable "
                            f"because {missing_email_count} existing row(s) have no email"
                        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
