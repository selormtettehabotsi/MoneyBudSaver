"""
Database initialization and default seeding helpers.
"""
from datetime import datetime, timezone
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from app.db.session import engine, Base
from app.db.base import *  # ensure all models are registered
from app.models.category import Category
from app.models.council import CouncilJob
from app.constants import DEFAULT_CATEGORIES


def run_schema_migrations(target_engine=None):
    """
    Safely and idempotently applies missing schema migrations to existing database tables.
    Runs on both SQLite and PostgreSQL without altering or deleting existing data.
    """
    db_engine = target_engine or engine
    inspector = inspect(db_engine)
    table_names = inspector.get_table_names()

    if "transactions" in table_names:
        columns = [c["name"] for c in inspector.get_columns("transactions")]
        if "client_id" not in columns:
            with db_engine.begin() as conn:
                if db_engine.dialect.name == "sqlite":
                    conn.execute(text("ALTER TABLE transactions ADD COLUMN client_id VARCHAR(36)"))
                else:
                    conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_id VARCHAR(36)"))
                
                # Create index on client_id
                try:
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_client_id ON transactions (client_id)"))
                except Exception:
                    pass

    if "council_decisions" in table_names:
        cols = [c["name"] for c in inspector.get_columns("council_decisions")]
        if "status" not in cols:
            with db_engine.begin() as conn:
                if db_engine.dialect.name == "sqlite":
                    conn.execute(text("ALTER TABLE council_decisions ADD COLUMN status VARCHAR(20) DEFAULT 'completed'"))
                else:
                    conn.execute(text("ALTER TABLE council_decisions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed'"))

    if "users" in table_names:
        user_cols = [c["name"] for c in inspector.get_columns("users")]
        if "token_version" not in user_cols:
            with db_engine.begin() as conn:
                if db_engine.dialect.name == "sqlite":
                    conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1"))
                else:
                    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1"))

    # Ensure all tables (including council_jobs) exist
    Base.metadata.create_all(bind=db_engine)


def recover_stale_council_jobs(target_engine=None):
    """
    On server startup, marks any Council jobs left in 'running' or 'pending' state
    as failed so users do not get stuck on dead in-flight tasks after a restart.
    """
    db_engine = target_engine or engine
    try:
        with Session(db_engine) as session:
            stale_jobs = session.query(CouncilJob).filter(
                CouncilJob.status.in_(["pending", "running"])
            ).all()
            for job in stale_jobs:
                job.status = "failed"
                job.error = "Server restarted during deliberation. Please submit your inquiry again."
                job.updated_at = datetime.now(timezone.utc)
            session.commit()
    except Exception:
        pass


def init_db(target_engine=None):
    """Create all database tables, apply pending schema migrations, and recover stale jobs."""
    db_engine = target_engine or engine
    Base.metadata.create_all(bind=db_engine)
    run_schema_migrations(db_engine)
    recover_stale_council_jobs(db_engine)


def seed_default_categories(db: Session, user_id: str):
    """Seed initial income and expense categories for a newly registered user."""
    for item in DEFAULT_CATEGORIES:
        category = Category(
            user_id=user_id,
            name=item["name"],
            type=item["type"],
            icon_name=item["icon_name"],
            color_hex=item["color_hex"],
            is_default=True,
        )
        db.add(category)
    db.commit()
