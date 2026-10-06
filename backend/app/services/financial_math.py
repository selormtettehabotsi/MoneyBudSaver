"""
Deterministic Financial Mathematics Engine.
Computes all financial ratios, runway, DTI, loan payoffs, and guardrails using exact Decimal arithmetic.
AIs reason about these deterministic outputs; they never calculate them.
"""
import math
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from app.models.transaction import Transaction
from app.models.savings_goal import SavingsGoal
from app.models.debt import Debt
from app.models.category import Category

ZERO = Decimal("0.00")
ONE_HUNDRED = Decimal("100.00")
TWELVE = Decimal("12.00")
MAX_RUNWAY_CAP = Decimal("999.00")


def round_decimal(value: Decimal, places: int = 2) -> Decimal:
    """Helper to round Decimal to specified decimal places."""
    q = Decimal(10) ** -places
    return value.quantize(q, rounding=ROUND_HALF_UP)


def calculate_dti_ratio(monthly_debt_obligations: Decimal, monthly_income: Decimal) -> Decimal:
    """
    Computes Debt-to-Income (DTI) ratio percentage.
    Edge cases:
    - Zero debt: 0.00%
    - Zero income with existing debt: 100.00%
    """
    if monthly_debt_obligations <= ZERO:
        return ZERO
    if monthly_income <= ZERO:
        return ONE_HUNDRED
    return round_decimal((monthly_debt_obligations / monthly_income) * ONE_HUNDRED, 2)


def calculate_runway_months(liquid_savings: Decimal, avg_monthly_expense: Decimal) -> Decimal:
    """
    Computes Runway in months (Liquid Savings / Average Monthly Expenses).
    Edge cases:
    - Zero expenses: 999.00 months
    - Zero/negative savings: 0.00 months
    """
    if liquid_savings <= ZERO:
        return ZERO
    if avg_monthly_expense <= ZERO:
        return MAX_RUNWAY_CAP
    return round_decimal(liquid_savings / avg_monthly_expense, 1)


def calculate_loan_payoff_months(
    remaining_balance: Decimal,
    annual_interest_rate_pct: Decimal,
    monthly_payment: Decimal
) -> Tuple[Optional[int], Optional[str]]:
    """
    Calculates number of months to payoff a loan.
    Returns (months_count, warning_message).
    """
    if remaining_balance <= ZERO:
        return 0, None
    if monthly_payment <= ZERO:
        return None, "Monthly payment must be greater than zero."

    # Zero interest case
    if annual_interest_rate_pct <= Decimal("0.000"):
        months = math.ceil(float(remaining_balance / monthly_payment))
        return months, None

    # Compound interest case
    monthly_rate = float((annual_interest_rate_pct / ONE_HUNDRED) / TWELVE)
    balance_float = float(remaining_balance)
    payment_float = float(monthly_payment)

    monthly_interest = balance_float * monthly_rate
    if payment_float <= monthly_interest:
        return None, "Monthly payment does not exceed monthly interest accrued (unpayable)."

    try:
        months_float = -math.log(1 - (monthly_rate * balance_float) / payment_float) / math.log(1 + monthly_rate)
        return math.ceil(months_float), None
    except (ValueError, ZeroDivisionError):
        return None, "Calculation error in loan payoff amortization."


def calculate_user_financial_snapshot(
    db: Session,
    user_id: str,
    as_of_date: Optional[date] = None,
    candidate_amount: Optional[Decimal] = None,
    decision_type: str = "general",
    max_dti_threshold: float = 40.0,
    min_runway_threshold: float = 3.0,
) -> Dict[str, Any]:
    """
    Computes a deterministic, PII-free snapshot of the user's financial standing.
    Includes baseline metrics and hypothetical post-decision impact using exact Decimal arithmetic.
    """
    if as_of_date is None:
        as_of_date = date.today()

    current_year = as_of_date.year
    current_month = as_of_date.month

    # 1. Current Month Income and Expenses (strictly filtered by user_id)
    current_month_txs = (
        db.query(Transaction.type, func.sum(Transaction.amount).label("total"))
        .filter(
            Transaction.user_id == user_id,
            extract("year", Transaction.date) == current_year,
            extract("month", Transaction.date) == current_month,
        )
        .group_by(Transaction.type)
        .all()
    )

    current_month_income = ZERO
    current_month_expense = ZERO
    for t_type, total in current_month_txs:
        if t_type == "income" and total:
            current_month_income = Decimal(str(total))
        elif t_type == "expense" and total:
            current_month_expense = Decimal(str(total))

    net_cashflow = current_month_income - current_month_expense
    savings_rate = ZERO
    if current_month_income > ZERO:
        savings_rate = round_decimal((net_cashflow / current_month_income) * ONE_HUNDRED, 1)

    # 2. 90-Day Average Monthly Expenses (3 months baseline)
    ninety_days_ago = as_of_date - timedelta(days=90)
    past_90d_expense_total = (
        db.query(func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            Transaction.date >= ninety_days_ago,
            Transaction.date <= as_of_date,
        )
        .scalar()
    ) or ZERO
    avg_monthly_expense = Decimal(str(past_90d_expense_total)) / Decimal("3.0")
    if avg_monthly_expense <= ZERO:
        avg_monthly_expense = current_month_expense if current_month_expense > ZERO else ZERO

    # 3. Total Liquid Savings
    total_savings = (
        db.query(func.sum(SavingsGoal.current_amount))
        .filter(SavingsGoal.user_id == user_id)
        .scalar()
    ) or ZERO
    total_liquid_savings = Decimal(str(total_savings))

    # 4. Total Debt Obligations & Monthly Debt Payments
    debts = db.query(Debt).filter(Debt.user_id == user_id).all()
    total_debt_balance = sum((d.remaining_balance for d in debts), ZERO)
    total_monthly_debt_payments = sum((d.minimum_payment for d in debts), ZERO)

    # 5. Check Sufficient Transaction History (at least 14 days and >= 3 transactions)
    oldest_tx = db.query(func.min(Transaction.date)).filter(Transaction.user_id == user_id).scalar()
    total_tx_count = db.query(func.count(Transaction.id)).filter(Transaction.user_id == user_id).scalar() or 0
    days_span = (as_of_date - oldest_tx).days if oldest_tx else 0
    has_sufficient_data = bool(oldest_tx and days_span >= 14 and total_tx_count >= 3)
    data_notice = None if has_sufficient_data else "Add at least 2 weeks of spending for reliable advice."

    # 6. Ratios
    current_dti = calculate_dti_ratio(total_monthly_debt_payments, current_month_income)
    current_runway = calculate_runway_months(total_liquid_savings, avg_monthly_expense)

    # 7. Category Expense Breakdown for Current Month
    category_rows = (
        db.query(
            Category.name,
            Category.icon_name,
            Category.color_hex,
            func.sum(Transaction.amount).label("category_total"),
        )
        .join(Transaction, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            extract("year", Transaction.date) == current_year,
            extract("month", Transaction.date) == current_month,
        )
        .group_by(Category.id, Category.name, Category.icon_name, Category.color_hex)
        .all()
    )

    category_breakdown = []
    for cat_name, icon, color, cat_total in category_rows:
        total_dec = Decimal(str(cat_total or "0.00"))
        pct = float(round_decimal((total_dec / current_month_expense) * ONE_HUNDRED, 1)) if current_month_expense > ZERO else 0.0
        category_breakdown.append({
            "category_name": cat_name,
            "icon_name": icon,
            "color_hex": color,
            "total_amount": float(total_dec),
            "percentage": pct,
        })

    # 8. Hypothetical Post-Decision Projection & Guardrails
    post_dti = current_dti
    post_runway = current_runway
    guardrail_violations = []

    if candidate_amount and candidate_amount > ZERO:
        if decision_type == "borrow":
            # Conservative standard 12-month loan at 18% annual APR
            est_monthly_payment = (candidate_amount * Decimal("1.18")) / TWELVE
            new_total_debt_payments = total_monthly_debt_payments + est_monthly_payment
            post_dti = calculate_dti_ratio(new_total_debt_payments, current_month_income)
        elif decision_type in ("purchase", "investment"):
            new_liquid_savings = max(ZERO, total_liquid_savings - candidate_amount)
            post_runway = calculate_runway_months(new_liquid_savings, avg_monthly_expense)

    # Evaluate Hard Guardrails
    max_dti_dec = Decimal(str(max_dti_threshold))
    min_runway_dec = Decimal(str(min_runway_threshold))

    if current_dti > max_dti_dec:
        guardrail_violations.append(
            f"Current Debt-to-Income ({current_dti:.1f}%) exceeds maximum safe threshold of {max_dti_threshold:.1f}%."
        )
    if post_dti > max_dti_dec and post_dti != current_dti:
        guardrail_violations.append(
            f"Projected Debt-to-Income after loan ({post_dti:.1f}%) exceeds maximum safe threshold of {max_dti_threshold:.1f}%."
        )

    # Only evaluate runway guardrails if sufficient historical spending data exists
    if has_sufficient_data:
        if current_runway < min_runway_dec:
            guardrail_violations.append(
                f"Current runway ({current_runway:.1f} months) is below safe emergency threshold of {min_runway_threshold:.1f} months."
            )
        if post_runway < min_runway_dec and post_runway != current_runway:
            guardrail_violations.append(
                f"Projected runway after expenditure ({post_runway:.1f} months) falls below minimum {min_runway_threshold:.1f} months."
            )

    return {
        "as_of_date": as_of_date.isoformat(),
        "has_sufficient_data": has_sufficient_data,
        "data_notice": data_notice,
        "monthly_income": float(current_month_income),
        "monthly_expense": float(current_month_expense),
        "net_cashflow": float(net_cashflow),
        "savings_rate_pct": float(savings_rate),
        "avg_monthly_expense_90d": float(round_decimal(avg_monthly_expense, 2)),
        "total_liquid_savings": float(total_liquid_savings),
        "total_debt_balance": float(total_debt_balance),
        "total_monthly_debt_obligations": float(total_monthly_debt_payments),
        "current_dti_pct": float(current_dti),
        "current_runway_months": float(current_runway) if has_sufficient_data else None,
        "current_runway_display": f"{float(current_runway):.1f} months" if has_sufficient_data else "Not enough data",
        "post_decision_dti_pct": float(post_dti),
        "post_decision_runway_months": float(post_runway) if has_sufficient_data else None,
        "post_decision_runway_display": f"{float(post_runway):.1f} months" if has_sufficient_data else "Not enough data",
        "category_breakdown": category_breakdown,
        "guardrail_breached": len(guardrail_violations) > 0,
        "guardrail_violations": guardrail_violations,
        "thresholds": {
            "max_dti_pct": max_dti_threshold,
            "min_runway_months": min_runway_threshold,
        },
    }
