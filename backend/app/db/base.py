"""
Imports Base and all models so that Alembic or Base.metadata.create_all includes all entities.
"""
from app.db.session import Base
from app.models import (
    User,
    Category,
    Transaction,
    Budget,
    SavingsGoal,
    Debt,
    CouncilDecision,
    ProviderQuota,
    CouncilCache,
    CouncilJob,
    ProviderSetting,
    RecommendedModel,
    FreeTierAllowlist,
    ModelSwitchLog,
    CouncilAppSetting,
    SuggestionLog,
)

__all__ = ["Base"]
