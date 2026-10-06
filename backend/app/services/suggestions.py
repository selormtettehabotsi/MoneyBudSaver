"""
Rule-Based Deterministic Financial Audit & Suggestion Engine.
Computes multi-dimensional 0-100 Financial Health Score and generates
prioritized actionable recommendations without LLM hallucinations.
"""
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.user import User
from app.models.transaction import Transaction
from app.models.budget import Budget
from app.models.savings_goal import SavingsGoal
from app.models.debt import Debt
from app.models.category import Category
from app.models.suggestion import SuggestionLog
from app.schemas.suggestion import SuggestionItem, WeeklyReviewResult
from app.services.financial_math import (
    calculate_user_financial_snapshot,
    calculate_dti_ratio,
    calculate_runway_months,
    calculate_loan_payoff_months,
    round_decimal,
)


def compute_financial_health_score(
    monthly_income: Decimal,
    monthly_expenses: Decimal,
    monthly_debt_service: Decimal,
    liquid_savings: Decimal,
    budgets_exceeded: int,
    total_budgets: int,
) -> Dict[str, Any]:
    """
    Computes a deterministic 0-100 Financial Health Score across 4 pillars (25 pts each):
    1. Savings Rate (25 pts)
    2. Emergency Runway (25 pts)
    3. Debt-to-Income / Debt Burden (25 pts)
    4. Budget Adherence (25 pts)
    """
    # Pillar 1: Savings Rate (Income - Expenses) / Income
    savings_rate_score = 0
    savings_rate_pct = 0.0
    if monthly_income > 0:
        net_surplus = monthly_income - monthly_expenses
        savings_rate_pct = float(round_decimal((net_surplus / monthly_income) * Decimal("100.0")))
        if savings_rate_pct >= 25.0:
            savings_rate_score = 25
        elif savings_rate_pct >= 15.0:
            savings_rate_score = 20
        elif savings_rate_pct >= 5.0:
            savings_rate_score = 12
        elif savings_rate_pct >= 0.0:
            savings_rate_score = 5
        else:
            savings_rate_score = 0
    else:
        savings_rate_score = 5 if monthly_expenses == 0 else 0

    # Pillar 2: Emergency Runway (Liquid Savings / Monthly Expenses)
    runway_months = float(calculate_runway_months(liquid_savings, monthly_expenses))
    if runway_months >= 6.0:
        runway_score = 25
    elif runway_months >= 3.0:
        runway_score = 20
    elif runway_months >= 1.5:
        runway_score = 12
    elif runway_months >= 0.5:
        runway_score = 5
    else:
        runway_score = 0

    # Pillar 3: Debt Burden / DTI
    dti_ratio = float(calculate_dti_ratio(monthly_debt_service, monthly_income))
    if monthly_debt_service == 0:
        debt_score = 25  # Debt-free bonus
    elif dti_ratio <= 15.0:
        debt_score = 25
    elif dti_ratio <= 28.0:
        debt_score = 20
    elif dti_ratio <= 36.0:
        debt_score = 14
    elif dti_ratio <= 45.0:
        debt_score = 6
    else:
        debt_score = 0

    # Pillar 4: Budget Discipline
    if total_budgets == 0:
        budget_score = 20 if monthly_income >= monthly_expenses else 10
    else:
        if budgets_exceeded == 0:
            budget_score = 25
        elif budgets_exceeded == 1:
            budget_score = 15
        elif budgets_exceeded == 2:
            budget_score = 8
        else:
            budget_score = 0

    total_score = max(0, min(100, savings_rate_score + runway_score + debt_score + budget_score))

    return {
        "total_score": total_score,
        "pillars": {
            "savings_rate": {"score": savings_rate_score, "max": 25, "value_pct": savings_rate_pct},
            "runway": {"score": runway_score, "max": 25, "runway_months": runway_months},
            "debt_burden": {"score": debt_score, "max": 25, "dti_pct": dti_ratio},
            "budget_adherence": {
                "score": budget_score,
                "max": 25,
                "exceeded": budgets_exceeded,
                "total": total_budgets,
            },
        },
    }


def generate_audit_suggestions(
    db: Session,
    user: User,
) -> WeeklyReviewResult:
    """
    Executes a comprehensive, rule-based financial audit for the given user.
    """
    now = datetime.now(timezone.utc)
    today = now.date()
    # Week start date (Monday of current week)
    week_start = today - timedelta(days=today.weekday())

    user_settings = user.settings or {}
    max_dti_setting = Decimal(str(user_settings.get("max_dti_ratio", 40.0)))
    min_runway_setting = Decimal(str(user_settings.get("min_runway_months", 3.0)))

    # 1. Compute Financial Snapshot (Income, Expense, Debts, Savings)
    snapshot = calculate_user_financial_snapshot(
        db=db,
        user_id=user.id,
        as_of_date=today,
        max_dti_threshold=float(max_dti_setting),
        min_runway_threshold=float(min_runway_setting),
    )
    monthly_income = Decimal(str(snapshot.get("monthly_income", 0.0)))
    monthly_expenses = Decimal(str(snapshot.get("monthly_expense", 0.0)))
    monthly_debt_service = Decimal(str(snapshot.get("total_monthly_debt_obligations", 0.0)))
    liquid_savings = Decimal(str(snapshot.get("total_liquid_savings", 0.0)))
    dti_ratio = Decimal(str(snapshot.get("current_dti_pct", 0.0)))
    has_sufficient = snapshot.get("has_sufficient_data", True)
    raw_runway = snapshot.get("current_runway_months")
    runway_months = Decimal(str(raw_runway)) if (has_sufficient and raw_runway is not None) else None
    currency_code = user.currency or "GHS"

    suggestions: List[SuggestionItem] = []

    # 2. Audit Active Budgets & Overspending
    first_of_month = date(today.year, today.month, 1)
    budgets = (
        db.query(Budget, Category.name)
        .join(Category, Budget.category_id == Category.id)
        .filter(
            Budget.user_id == user.id,
            Budget.month == today.month,
            Budget.year == today.year,
        )
        .all()
    )

    budgets_exceeded_count = 0
    total_budgets_count = len(budgets)

    for b, cat_name in budgets:
        # Sum transactions in this category for the current month
        spent_sum = (
            db.query(func.coalesce(func.sum(Transaction.amount), Decimal("0.00")))
            .filter(
                Transaction.user_id == user.id,
                Transaction.category_id == b.category_id,
                Transaction.type == "expense",
                Transaction.date >= first_of_month,
                Transaction.date <= today,
            )
            .scalar()
        )
        spent = Decimal(str(spent_sum or 0))
        limit = b.amount_limit

        if limit > 0:
            spent_pct = (spent / limit) * Decimal("100.0")
            if spent > limit:
                budgets_exceeded_count += 1
                over_amount = round_decimal(spent - limit)
                suggestions.append(
                    SuggestionItem(
                        category="overspending",
                        severity="critical",
                        title=f"Budget Exceeded: {cat_name}",
                        description=f"You have spent {currency_code} {spent:,.2f} of your {currency_code} {limit:,.2f} limit ({spent_pct:.1f}% spent), exceeding by {currency_code} {over_amount:,.2f}.",
                        actionable_step=f"Pause discretionary expenses in '{cat_name}' for the remainder of {today.strftime('%B')} to avoid eroding your cash reserve.",
                    )
                )
            elif spent_pct >= Decimal("80.0") and today.day <= 20:
                suggestions.append(
                    SuggestionItem(
                        category="overspending",
                        severity="warning",
                        title=f"Budget Warning: {cat_name} at {spent_pct:.0f}%",
                        description=f"You have used {spent_pct:.0f}% ({currency_code} {spent:,.2f} / {currency_code} {limit:,.2f}) with {30 - today.day} days left in the month.",
                        actionable_step=f"Limit daily spending in '{cat_name}' to approximately {currency_code} {round_decimal((limit - spent) / max(1, 30 - today.day)):,.2f}/day.",
                    )
                )

    # 3. Audit Cash Flow & Runway Reserves
    net_cashflow = monthly_income - monthly_expenses
    if net_cashflow < 0:
        deficit = abs(net_cashflow)
        suggestions.append(
            SuggestionItem(
                category="savings_opportunity",
                severity="critical",
                title="Negative Monthly Cash Flow",
                description=f"Your expenses ({currency_code} {monthly_expenses:,.2f}) exceed your income ({currency_code} {monthly_income:,.2f}) by {currency_code} {deficit:,.2f}/month.",
                actionable_step="Identify non-essential recurring expenses or subscription leaks to return cash flow to positive territory.",
            )
        )

    if has_sufficient and runway_months is not None:
        if runway_months < Decimal("1.0"):
            suggestions.append(
                SuggestionItem(
                    category="savings_opportunity",
                    severity="critical",
                    title="Critically Low Emergency Runway",
                    description=f"Your liquid reserves ({currency_code} {liquid_savings:,.2f}) cover only {runway_months:.1f} months of expenses (minimum safe buffer is {min_runway_setting} months).",
                    actionable_step=f"Prioritize building an immediate 1-month emergency fund of {currency_code} {monthly_expenses:,.2f} before allocating funds elsewhere.",
                )
            )
        elif runway_months < min_runway_setting:
            target_buffer = round_decimal(monthly_expenses * min_runway_setting)
            shortfall = round_decimal(target_buffer - liquid_savings)
            suggestions.append(
                SuggestionItem(
                    category="savings_opportunity",
                    severity="warning",
                    title="Emergency Runway Below Target",
                    description=f"Current runway is {runway_months:.1f} months vs your configured target of {min_runway_setting:.0f} months.",
                    actionable_step=f"Deposit {currency_code} {shortfall:,.2f} across the next 3 months to reach full target buffer.",
                )
            )
        elif runway_months >= Decimal("6.0"):
            suggestions.append(
                SuggestionItem(
                    category="general",
                    severity="info",
                    title="Strong Emergency Reserve (6+ Months)",
                    description=f"Your runway of {runway_months:.1f} months ({currency_code} {liquid_savings:,.2f}) provides excellent financial security against income shocks.",
                    actionable_step="Surplus cash above 6 months can be redirected to high-interest debt acceleration or long-term growth.",
                )
            )

    # 4. Audit Debts & Loans
    debts = db.query(Debt).filter(Debt.user_id == user.id, Debt.remaining_balance > 0).all()
    if debts:
        # Check DTI limit
        if dti_ratio > max_dti_setting:
            suggestions.append(
                SuggestionItem(
                    category="debt_alert",
                    severity="critical",
                    title=f"High Debt-to-Income (DTI: {dti_ratio:.1f}%)",
                    description=f"Your monthly debt payments consume {dti_ratio:.1f}% of gross income (safety threshold is {max_dti_setting:.0f}%).",
                    actionable_step="Avoid taking on any new loans or credit lines until DTI drops below 36%.",
                )
            )

        # Find highest APR debt for Avalanche Strategy
        sorted_debts = sorted(debts, key=lambda d: d.interest_rate, reverse=True)
        highest_apr_debt = sorted_debts[0]
        if highest_apr_debt.interest_rate >= Decimal("18.0"):
            months_to_pay, warning = calculate_loan_payoff_months(
                highest_apr_debt.remaining_balance,
                highest_apr_debt.interest_rate,
                highest_apr_debt.minimum_payment,
            )
            if months_to_pay is None:
                suggestions.append(
                    SuggestionItem(
                        category="debt_alert",
                        severity="critical",
                        title=f"Unpayable Debt: {highest_apr_debt.name}",
                        description=f"Minimum payment of {currency_code} {highest_apr_debt.minimum_payment:,.2f} does not cover monthly interest on {highest_apr_debt.name} ({highest_apr_debt.interest_rate}% APR).",
                        actionable_step=f"Increase monthly payment to at least {currency_code} {round_decimal(highest_apr_debt.remaining_balance * highest_apr_debt.interest_rate / Decimal('1200.0') + Decimal('50.0')):,.2f} to begin reducing principal.",
                    )
                )
            else:
                total_est_payment = highest_apr_debt.minimum_payment * Decimal(str(months_to_pay))
                est_interest = max(Decimal("0.00"), total_est_payment - highest_apr_debt.remaining_balance)
                suggestions.append(
                    SuggestionItem(
                        category="debt_alert",
                        severity="warning",
                        title=f"High Interest Debt: {highest_apr_debt.name} ({highest_apr_debt.interest_rate}% APR)",
                        description=f"Balance of {currency_code} {highest_apr_debt.remaining_balance:,.2f} will cost approximately {currency_code} {est_interest:,.2f} in interest if paid only at minimums.",
                        actionable_step=f"Target {highest_apr_debt.name} with all extra monthly surplus (Debt Avalanche Strategy) to eliminate it in {months_to_pay} months.",
                    )
                )

    # 5. Audit Savings Goals Momentum
    savings_goals = db.query(SavingsGoal).filter(SavingsGoal.user_id == user.id, SavingsGoal.is_completed == False).all()
    for g in savings_goals:
        if g.target_amount > 0:
            progress_pct = (g.current_amount / g.target_amount) * Decimal("100.0")
            if progress_pct >= Decimal("90.0"):
                remaining = g.target_amount - g.current_amount
                suggestions.append(
                    SuggestionItem(
                        category="savings_opportunity",
                        severity="info",
                        title=f"Goal Almost Complete: {g.name} ({progress_pct:.0f}%)",
                        description=f"You are only {currency_code} {remaining:,.2f} away from reaching your target of {currency_code} {g.target_amount:,.2f}.",
                        actionable_step=f"Make one final deposit of {currency_code} {remaining:,.2f} to complete this milestone!",
                    )
                )
            elif g.target_date and g.target_date <= today + timedelta(days=60) and progress_pct < Decimal("50.0"):
                suggestions.append(
                    SuggestionItem(
                        category="savings_opportunity",
                        severity="warning",
                        title=f"Savings Goal Behind Schedule: {g.name}",
                        description=f"Target date is {g.target_date.strftime('%b %d, %Y')}, but current progress is only {progress_pct:.0f}%.",
                        actionable_step="Adjust target date or increase weekly contribution to stay on track.",
                    )
                )

    # 6. Default Encouragement if all is healthy
    if not suggestions:
        runway_desc = f"runway is strong ({float(runway_months):.1f} months)" if runway_months is not None else "runway data is accumulating"
        suggestions.append(
            SuggestionItem(
                category="general",
                severity="info",
                title="All Financial Indicators Healthy",
                description=f"Budgets are within limits, {runway_desc}, and debt payments are under control.",
                actionable_step="Maintain current habits and consider increasing allocations to long-term savings goals.",
            )
        )

    # 7. Compute Financial Health Score (0-100)
    health_metrics = compute_financial_health_score(
        monthly_income=monthly_income,
        monthly_expenses=monthly_expenses,
        monthly_debt_service=monthly_debt_service,
        liquid_savings=liquid_savings,
        budgets_exceeded=budgets_exceeded_count,
        total_budgets=total_budgets_count,
    )

    metrics_summary = {
        "monthly_income": float(monthly_income),
        "monthly_expenses": float(monthly_expenses),
        "net_cashflow": float(net_cashflow),
        "liquid_savings": float(liquid_savings),
        "dti_ratio": float(dti_ratio),
        "runway_months": float(runway_months) if runway_months is not None else 0.0,
        "runway_display": snapshot.get("current_runway_display", "0.0 months"),
        "health_score": health_metrics["total_score"],
        "pillars": health_metrics["pillars"],
        "budgets_tracked": total_budgets_count,
        "budgets_exceeded": budgets_exceeded_count,
        "active_debts": len(debts),
        "active_goals": len(savings_goals),
    }

    return WeeklyReviewResult(
        week_start_date=week_start,
        generated_at=now,
        health_score=health_metrics["total_score"],
        suggestions=suggestions,
        metrics_summary=metrics_summary,
    )


def record_weekly_review(db: Session, user: User) -> SuggestionLog:
    """
    Runs the deterministic financial audit and upserts a SuggestionLog record for the week.
    """
    review = generate_audit_suggestions(db, user)

    # Check for existing review this week
    existing = (
        db.query(SuggestionLog)
        .filter(
            SuggestionLog.user_id == user.id,
            SuggestionLog.week_start_date == review.week_start_date,
        )
        .first()
    )

    findings_payload = {
        "health_score": review.health_score,
        "suggestions": [s.model_dump() for s in review.suggestions],
        "metrics_summary": review.metrics_summary,
        "generated_at": review.generated_at.isoformat(),
    }

    if existing:
        existing.findings = findings_payload
        db.commit()
        db.refresh(existing)
        return existing

    new_log = SuggestionLog(
        user_id=user.id,
        week_start_date=review.week_start_date,
        findings=findings_payload,
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    return new_log
