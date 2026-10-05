"""
Database initialization and default seeding helpers.
"""
from sqlalchemy.orm import Session
from app.db.session import engine, Base
from app.db.base import *  # ensure all models are registered
from app.models.category import Category
from app.constants import DEFAULT_CATEGORIES


def init_db():
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)


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
