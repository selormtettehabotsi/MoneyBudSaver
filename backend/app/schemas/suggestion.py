"""
Pydantic schemas for automated weekly suggestion audits and reviews.
"""
from datetime import date, datetime
from typing import List, Dict, Any
from pydantic import BaseModel, ConfigDict


class SuggestionItem(BaseModel):
    category: str  # 'overspending', 'savings_opportunity', 'debt_alert', 'general'
    severity: str  # 'info', 'warning', 'critical'
    title: str
    description: str
    actionable_step: str


class WeeklyReviewResult(BaseModel):
    week_start_date: date
    generated_at: datetime
    health_score: int  # 0 to 100
    suggestions: List[SuggestionItem]
    metrics_summary: Dict[str, Any]


class SuggestionLogOut(BaseModel):
    id: str
    user_id: str
    week_start_date: date
    findings: Dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
