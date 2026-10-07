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
    runway_months: Optional[float] = None
    has_sufficient_data: bool = True
    runway_display: str = "Not enough data"
    data_notice: Optional[str] = None
    category_breakdown: List[CategoryExpenseBreakdown]
    monthly_trend: List[MonthlyTrendPoint]
    guardrail_warnings: List[str]


class RunwayAnalyticsOut(BaseModel):
    currency: str
    total_liquid_savings: Decimal
    avg_monthly_expense_90d: Decimal
    runway_months: Optional[float] = None
    has_sufficient_data: bool = True
    runway_display: str = "Not enough data"
    data_notice: Optional[str] = None
    min_runway_threshold: float = 3.0
    guardrail_warnings: List[str] = []


class CashflowAnalyticsOut(BaseModel):
    currency: str
    total_income_current_month: Decimal
    total_expense_current_month: Decimal
    net_cashflow_current_month: Decimal
    savings_rate_percentage: float
    category_breakdown: List[CategoryExpenseBreakdown]
    monthly_trend: List[MonthlyTrendPoint]
