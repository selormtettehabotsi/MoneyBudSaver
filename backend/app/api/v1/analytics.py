"""
Financial Analytics and Snapshot API Endpoints.
"""
from datetime import date
from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from app.core.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.transaction import Transaction
from app.schemas.analytics import (
    DashboardAnalyticsOut,
    MonthlyTrendPoint,
    CategoryExpenseBreakdown,
    RunwayAnalyticsOut,
    CashflowAnalyticsOut,
)
from app.services.financial_math import calculate_user_financial_snapshot

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/dashboard", response_model=DashboardAnalyticsOut)
async def get_dashboard_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns complete dashboard metrics: net cash flow, savings rate, runway,
    DTI ratio, category breakdown, monthly 6-month trend, and hard guardrail warnings.
    """
    settings_dict = current_user.settings or {}
    max_dti = float(settings_dict.get("max_dti_ratio", 40.0))
    min_runway = float(settings_dict.get("min_runway_months", 3.0))

    snapshot = calculate_user_financial_snapshot(
        db=db,
        user_id=current_user.id,
        as_of_date=date.today(),
        max_dti_threshold=max_dti,
        min_runway_threshold=min_runway,
    )

    # 6-Month Trend Points
    today = date.today()
    trend_points: List[MonthlyTrendPoint] = []

    for i in range(5, -1, -1):
        # Calculate target month/year
        month_offset = today.month - i
        year_offset = today.year
        while month_offset <= 0:
            month_offset += 12
            year_offset -= 1

        month_txs = (
            db.query(Transaction.type, func.sum(Transaction.amount).label("total"))
            .filter(
                Transaction.user_id == current_user.id,
                extract("year", Transaction.date) == year_offset,
                extract("month", Transaction.date) == month_offset,
            )
            .group_by(Transaction.type)
            .all()
        )

        m_income = Decimal("0.00")
        m_expense = Decimal("0.00")
        for t_type, total in month_txs:
            if t_type == "income" and total:
                m_income = Decimal(str(total))
            elif t_type == "expense" and total:
                m_expense = Decimal(str(total))

        trend_points.append(
            MonthlyTrendPoint(
                month_str=f"{year_offset:04d}-{month_offset:02d}",
                income=m_income,
                expense=m_expense,
                net_savings=m_income - m_expense,
            )
        )

    cat_breakdown = [
        CategoryExpenseBreakdown(
            category_id=None,
            category_name=c["category_name"],
            color_hex=c["color_hex"],
            icon_name=c["icon_name"],
            total_amount=Decimal(str(c["total_amount"])),
            percentage_of_total=c["percentage"],
        )
        for c in snapshot["category_breakdown"]
    ]

    return DashboardAnalyticsOut(
        currency=current_user.currency,
        total_income_current_month=Decimal(str(snapshot["monthly_income"])),
        total_expense_current_month=Decimal(str(snapshot["monthly_expense"])),
        net_cashflow_current_month=Decimal(str(snapshot["net_cashflow"])),
        savings_rate_percentage=snapshot["savings_rate_pct"],
        total_liquid_savings=Decimal(str(snapshot["total_liquid_savings"])),
        total_debt_balance=Decimal(str(snapshot["total_debt_balance"])),
        debt_to_income_ratio=snapshot["current_dti_pct"],
        runway_months=snapshot["current_runway_months"],
        has_sufficient_data=snapshot["has_sufficient_data"],
        runway_display=snapshot["current_runway_display"],
        data_notice=snapshot["data_notice"],
        category_breakdown=cat_breakdown,
        monthly_trend=trend_points,
        guardrail_warnings=snapshot["guardrail_violations"],
    )


@router.get("/runway", response_model=RunwayAnalyticsOut)
async def get_runway_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns runway metrics, liquid savings, 90-day average expenses,
    data sufficiency status, and safety guardrail warnings.
    """
    settings_dict = current_user.settings or {}
    max_dti = float(settings_dict.get("max_dti_ratio", 40.0))
    min_runway = float(settings_dict.get("min_runway_months", 3.0))

    snapshot = calculate_user_financial_snapshot(
        db=db,
        user_id=current_user.id,
        as_of_date=date.today(),
        max_dti_threshold=max_dti,
        min_runway_threshold=min_runway,
    )

    return RunwayAnalyticsOut(
        currency=current_user.currency,
        total_liquid_savings=Decimal(str(snapshot["total_liquid_savings"])),
        avg_monthly_expense_90d=Decimal(str(snapshot["avg_monthly_expense_90d"])),
        runway_months=snapshot["current_runway_months"],
        has_sufficient_data=snapshot["has_sufficient_data"],
        runway_display=snapshot["current_runway_display"],
        data_notice=snapshot["data_notice"],
        min_runway_threshold=min_runway,
        guardrail_warnings=[w for w in snapshot["guardrail_violations"] if "runway" in w.lower()],
    )


@router.get("/cashflow", response_model=CashflowAnalyticsOut)
async def get_cashflow_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns monthly cash flow, savings rate, category breakdown,
    and 6-month historical trend.
    """
    settings_dict = current_user.settings or {}
    max_dti = float(settings_dict.get("max_dti_ratio", 40.0))
    min_runway = float(settings_dict.get("min_runway_months", 3.0))

    snapshot = calculate_user_financial_snapshot(
        db=db,
        user_id=current_user.id,
        as_of_date=date.today(),
        max_dti_threshold=max_dti,
        min_runway_threshold=min_runway,
    )

    today = date.today()
    trend_points: List[MonthlyTrendPoint] = []

    for i in range(5, -1, -1):
        month_offset = today.month - i
        year_offset = today.year
        while month_offset <= 0:
            month_offset += 12
            year_offset -= 1

        month_txs = (
            db.query(Transaction.type, func.sum(Transaction.amount).label("total"))
            .filter(
                Transaction.user_id == current_user.id,
                extract("year", Transaction.date) == year_offset,
                extract("month", Transaction.date) == month_offset,
            )
            .group_by(Transaction.type)
            .all()
        )

        m_income = Decimal("0.00")
        m_expense = Decimal("0.00")
        for t_type, total in month_txs:
            if t_type == "income" and total:
                m_income = Decimal(str(total))
            elif t_type == "expense" and total:
                m_expense = Decimal(str(total))

        trend_points.append(
            MonthlyTrendPoint(
                month_str=f"{year_offset:04d}-{month_offset:02d}",
                income=m_income,
                expense=m_expense,
                net_savings=m_income - m_expense,
            )
        )

    cat_breakdown = [
        CategoryExpenseBreakdown(
            category_id=None,
            category_name=c["category_name"],
            color_hex=c["color_hex"],
            icon_name=c["icon_name"],
            total_amount=Decimal(str(c["total_amount"])),
            percentage_of_total=c["percentage"],
        )
        for c in snapshot["category_breakdown"]
    ]

    return CashflowAnalyticsOut(
        currency=current_user.currency,
        total_income_current_month=Decimal(str(snapshot["monthly_income"])),
        total_expense_current_month=Decimal(str(snapshot["monthly_expense"])),
        net_cashflow_current_month=Decimal(str(snapshot["net_cashflow"])),
        savings_rate_percentage=snapshot["savings_rate_pct"],
        category_breakdown=cat_breakdown,
        monthly_trend=trend_points,
    )
