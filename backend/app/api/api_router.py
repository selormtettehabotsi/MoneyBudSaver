"""
Main API Router configuration connecting all v1 sub-routers.
"""
from fastapi import APIRouter
from app.api.v1 import (
    auth,
    health,
    internal,
    categories,
    transactions,
    budgets,
    savings_goals,
    debts,
    analytics,
    council,
    suggestions,
    data,
)

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth.router)
api_v1_router.include_router(health.router)
api_v1_router.include_router(categories.router)
api_v1_router.include_router(transactions.router)
api_v1_router.include_router(budgets.router)
api_v1_router.include_router(savings_goals.router)
api_v1_router.include_router(debts.router)
api_v1_router.include_router(analytics.router)
api_v1_router.include_router(council.router)
api_v1_router.include_router(suggestions.router)
api_v1_router.include_router(data.router)

__all__ = ["api_v1_router", "health", "internal"]
