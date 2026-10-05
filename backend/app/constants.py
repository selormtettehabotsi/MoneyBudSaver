"""
Application-wide constants, default presets, and vote score definitions.
"""

# Council Vote Scoring Mapping
VOTE_SCORES = {
    "approve": 1.0,
    "approve_with_conditions": 0.5,
    "reject": -1.0,
}

# Tally Verdict Thresholds
TALLY_APPROVE_THRESHOLD = 0.33
TALLY_REJECT_THRESHOLD = -0.33

# Default Categories to seed for every new user
DEFAULT_CATEGORIES = [
    # Income
    {"name": "Salary & Wages", "type": "income", "icon_name": "briefcase", "color_hex": "#10b981"},
    {"name": "Business & Side Hustle", "type": "income", "icon_name": "trending-up", "color_hex": "#06b6d4"},
    {"name": "Investments & Dividends", "type": "income", "icon_name": "pie-chart", "color_hex": "#3b82f6"},
    {"name": "Gifts & Allowances", "type": "income", "icon_name": "gift", "color_hex": "#8b5cf6"},
    {"name": "Other Income", "type": "income", "icon_name": "plus-circle", "color_hex": "#6b7280"},

    # Expense
    {"name": "Housing & Rent", "type": "expense", "icon_name": "home", "color_hex": "#f43f5e"},
    {"name": "Food & Groceries", "type": "expense", "icon_name": "shopping-cart", "color_hex": "#f97316"},
    {"name": "Utilities & Bills", "type": "expense", "icon_name": "zap", "color_hex": "#eab308"},
    {"name": "Transportation & Fuel", "type": "expense", "icon_name": "truck", "color_hex": "#14b8a6"},
    {"name": "Healthcare & Medical", "type": "expense", "icon_name": "activity", "color_hex": "#ec4899"},
    {"name": "Debt & Loan Repayment", "type": "expense", "icon_name": "credit-card", "color_hex": "#dc2626"},
    {"name": "Savings & Investments", "type": "expense", "icon_name": "shield", "color_hex": "#6366f1"},
    {"name": "Education & Learning", "type": "expense", "icon_name": "book-open", "color_hex": "#84cc16"},
    {"name": "Personal & Entertainment", "type": "expense", "icon_name": "film", "color_hex": "#a855f7"},
    {"name": "Miscellaneous", "type": "expense", "icon_name": "help-circle", "color_hex": "#64748b"},
]

# Supported Currencies
SUPPORTED_CURRENCIES = [
    {"code": "GHS", "symbol": "GH₵", "name": "Ghana Cedi"},
    {"code": "USD", "symbol": "$", "name": "US Dollar"},
    {"code": "EUR", "symbol": "€", "name": "Euro"},
    {"code": "GBP", "symbol": "£", "name": "British Pound"},
    {"code": "NGN", "symbol": "₦", "name": "Nigerian Naira"},
    {"code": "KES", "symbol": "KSh", "name": "Kenyan Shilling"},
    {"code": "ZAR", "symbol": "R", "name": "South African Rand"},
    {"code": "CAD", "symbol": "CA$", "name": "Canadian Dollar"},
    {"code": "AUD", "symbol": "A$", "name": "Australian Dollar"},
    {"code": "INR", "symbol": "₹", "name": "Indian Rupee"},
]
