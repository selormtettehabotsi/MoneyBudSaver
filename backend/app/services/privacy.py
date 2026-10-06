"""
Privacy and Context Anonymization Scrubber.
Strips personal identifiers, card/account numbers, names, and merchant names
before sending financial context to AI providers.
"""
import re
from typing import Dict, Any, List


# Regex patterns for sensitive data
EMAIL_REGEX = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
PHONE_REGEX = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")
CARD_REGEX = re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b")
ACCOUNT_REGEX = re.compile(r"\b(?:acc|account|acct|iban|bban|sort)[\s:#]*[a-zA-Z0-9-]{6,34}\b", re.IGNORECASE)


def scrub_pii_from_text(text: str) -> str:
    """Removes emails, phone numbers, credit card numbers, and bank account strings from free text."""
    if not text:
        return ""
    sanitized = EMAIL_REGEX.sub("[EMAIL_REDACTED]", text)
    sanitized = PHONE_REGEX.sub("[PHONE_REDACTED]", sanitized)
    sanitized = CARD_REGEX.sub("[CARD_REDACTED]", sanitized)
    sanitized = ACCOUNT_REGEX.sub("[ACCOUNT_REDACTED]", sanitized)
    return sanitized.strip()


def build_anonymized_council_context(
    financial_snapshot: Dict[str, Any],
    user_currency: str = "GHS"
) -> str:
    """
    Constructs a strictly structured, PII-free financial fact sheet for LLMs.
    Contains only deterministic numbers, ratios, and category percentages.
    """
    has_sufficient = financial_snapshot.get("has_sufficient_data", True)
    runway_val = financial_snapshot.get("current_runway_months")
    data_notice = financial_snapshot.get("data_notice") or "Add at least 2 weeks of spending for reliable advice."
    runway_str = f"{runway_val:.1f} months of living expenses" if (has_sufficient and runway_val is not None) else f"Not enough data ({data_notice})"

    lines = [
        f"FINANCIAL FACTS & RATIOS (All arithmetic pre-computed deterministically in {user_currency}):",
        f"- Monthly Net Cash Flow: {user_currency} {financial_snapshot.get('net_cashflow', 0.0):,.2f}",
        f"  (Total Monthly Income: {user_currency} {financial_snapshot.get('monthly_income', 0.0):,.2f} | Total Monthly Expenses: {user_currency} {financial_snapshot.get('monthly_expense', 0.0):,.2f})",
        f"- 90-Day Average Monthly Expenses: {user_currency} {financial_snapshot.get('avg_monthly_expense_90d', 0.0):,.2f}",
        f"- Current Liquid Savings: {user_currency} {financial_snapshot.get('total_liquid_savings', 0.0):,.2f}",
        f"- Current Runway: {runway_str}",
        f"- Total Existing Debt Balance: {user_currency} {financial_snapshot.get('total_debt_balance', 0.0):,.2f}",
        f"- Total Monthly Debt Obligations: {user_currency} {financial_snapshot.get('total_monthly_debt_obligations', 0.0):,.2f}",
        f"- Current Debt-to-Income (DTI) Ratio: {financial_snapshot.get('current_dti_pct', 0.0):.1f}%",
        f"- Current Savings Rate: {financial_snapshot.get('savings_rate_pct', 0.0):.1f}%",
    ]

    if not has_sufficient:
        lines.append("- DATA QUALITY: INSUFFICIENT_HISTORY (fewer than 14 days of spending history)")
        lines.append(f"- DATA NOTICE: {data_notice}")
        lines.append("- INSTRUCTIONS FOR INSUFFICIENT DATA: Spending history is limited (< 14 days), so safety checks and runway cannot be fully verified. You MUST state in your reasoning that advice is low-confidence due to limited history, and you MUST cap your confidence rating at a maximum of 40%.")

    # Post-decision projection if candidate amount was provided
    if financial_snapshot.get("post_decision_dti_pct") != financial_snapshot.get("current_dti_pct"):
        lines.append(f"- Projected Post-Decision DTI: {financial_snapshot.get('post_decision_dti_pct', 0.0):.1f}%")
    if has_sufficient and financial_snapshot.get("post_decision_runway_months") is not None and financial_snapshot.get("post_decision_runway_months") != financial_snapshot.get("current_runway_months"):
        lines.append(f"- Projected Post-Decision Runway: {financial_snapshot.get('post_decision_runway_months', 0.0):.1f} months")

    # Guardrails
    thresholds = financial_snapshot.get("thresholds", {})
    lines.append(f"- Safety Thresholds: Max DTI = {thresholds.get('max_dti_pct', 40.0):.1f}% | Min Runway = {thresholds.get('min_runway_months', 3.0):.1f} months")

    if financial_snapshot.get("guardrail_breached"):
        lines.append("- GUARDRAIL WARNINGS:")
        for v in financial_snapshot.get("guardrail_violations", []):
            lines.append(f"  * {v}")

    # Top spending categories
    categories: List[Dict[str, Any]] = financial_snapshot.get("category_breakdown", [])
    if categories:
        lines.append("- Current Spending Breakdown:")
        for c in categories[:5]:
            lines.append(f"  * {c.get('category_name')}: {c.get('percentage', 0.0):.1f}% ({user_currency} {c.get('total_amount', 0.0):,.2f})")

    return "\n".join(lines)
