"""
Pydantic schemas for Dashboard Analytics, Cashflow, and Runway.
"""
from decimal import Decimal
from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class CategoryExpenseBreakdown(BaseModel):
    category_id: Optional[str]
    category_name: str
    color_hex: str
    icon_name: str
    total_amount: Decimal
    percentage_of_total: float


class MonthlyTrendPoint(BaseModel):
    month_str: str  # "YYYY-MM"
    income: Decimal
    expense: Decimal
    net_savings: Decimal


class DashboardAnalyticsOut(BaseModel):
    currency: str
    total_income_current_month: Decimal
    total_expense_current_month: Decimal
    net_cashflow_current_month: Decimal
    savings_rate_percentage: float
    total_liquid_savings: Decimal
    total_debt_balance: Decimal
    debt_to_income_ratio: float
    runway_months: float
    category_breakdown: List[CategoryExpenseBreakdown]
    monthly_trend: List[MonthlyTrendPoint]
    guardrail_warnings: List[str]
