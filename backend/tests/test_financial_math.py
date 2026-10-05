"""
Unit tests for deterministic financial math calculations:
- Loan payoff amortization formula
- Runway calculation (with zero expense and zero savings edge cases)
- Debt-to-Income (DTI) ratio (with zero income and zero debt edge cases)
- Guardrail breach detection
"""
from decimal import Decimal
from app.services.financial_math import (
    calculate_loan_payoff_months,
    calculate_dti_ratio,
    calculate_runway_months,
    round_decimal,
)


def test_zero_interest_loan_payoff():
    # Balance: 1000, Interest: 0%, Payment: 100 -> 10 months
    months, warning = calculate_loan_payoff_months(
        remaining_balance=Decimal("1000.00"),
        annual_interest_rate_pct=Decimal("0.000"),
        monthly_payment=Decimal("100.00"),
    )
    assert months == 10
    assert warning is None


def test_compound_interest_loan_payoff():
    # Balance: 5000, Interest: 12% APR, Payment: 200 -> ~29 months
    months, warning = calculate_loan_payoff_months(
        remaining_balance=Decimal("5000.00"),
        annual_interest_rate_pct=Decimal("12.000"),
        monthly_payment=Decimal("200.00"),
    )
    assert months is not None
    assert 28 <= months <= 30
    assert warning is None


def test_unpayable_loan_detection():
    # Balance: 10000, Interest: 24% APR (monthly interest = 200), Payment: 150
    # Payment does not cover monthly interest, loan will never amortize
    months, warning = calculate_loan_payoff_months(
        remaining_balance=Decimal("10000.00"),
        annual_interest_rate_pct=Decimal("24.000"),
        monthly_payment=Decimal("150.00"),
    )
    assert months is None
    assert "unpayable" in warning


def test_zero_balance_loan():
    months, warning = calculate_loan_payoff_months(
        remaining_balance=Decimal("0.00"),
        annual_interest_rate_pct=Decimal("15.000"),
        monthly_payment=Decimal("200.00"),
    )
    assert months == 0
    assert warning is None


def test_dti_ratio_calculations():
    # Normal case: Debt 400, Income 2000 -> 20.00%
    dti = calculate_dti_ratio(Decimal("400.00"), Decimal("2000.00"))
    assert dti == Decimal("20.00")

    # Edge case 1: Zero debt -> 0.00%
    assert calculate_dti_ratio(Decimal("0.00"), Decimal("2000.00")) == Decimal("0.00")

    # Edge case 2: Zero income with debt -> 100.00%
    assert calculate_dti_ratio(Decimal("500.00"), Decimal("0.00")) == Decimal("100.00")

    # Edge case 3: Zero income and zero debt -> 0.00%
    assert calculate_dti_ratio(Decimal("0.00"), Decimal("0.00")) == Decimal("0.00")


def test_runway_calculations():
    # Normal case: Savings 6000, Monthly expenses 2000 -> 3.0 months
    runway = calculate_runway_months(Decimal("6000.00"), Decimal("2000.00"))
    assert runway == Decimal("3.0")

    # Edge case 1: Zero expenses -> 999.0 months cap
    assert calculate_runway_months(Decimal("5000.00"), Decimal("0.00")) == Decimal("999.0")

    # Edge case 2: Zero savings -> 0.0 months
    assert calculate_runway_months(Decimal("0.00"), Decimal("2000.00")) == Decimal("0.0")


def test_round_decimal_precision():
    val = Decimal("123.4567")
    rounded = round_decimal(val, 2)
    assert rounded == Decimal("123.46")
