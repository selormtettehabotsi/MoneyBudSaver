# MoneyCouncil Backend API Reference

Related: [[index]] | [[Architecture]]

All API routes are served under `/api/v1` with JSON request and response payloads, protected by session cookies and double-submit CSRF headers.

---

## 🔐 Authentication & Session
- `POST /api/v1/auth/login`: Authenticate email + password. Returns user object, sets `HttpOnly` session cookie and `mc_csrf` cookie.
- `POST /api/v1/auth/register`: Register new account with email, password, default currency, and optional invite code.
- `POST /api/v1/auth/logout`: Invalidate session cookie.
- `GET /api/v1/auth/me`: Fetch authenticated user profile.
- `PUT /api/v1/auth/password`: Update user password (requires current password).
- `PUT /api/v1/auth/preferences`: Update currency or financial guardrails (DTI limit, runway threshold).

---

## 💳 Transactions
- `GET /api/v1/transactions`: Fetch transactions with optional date range and pagination query parameters.
- `POST /api/v1/transactions`: Create transaction (`amount`, `type`, `description`, `category_id`, `date`, `client_id`).
- `PUT /api/v1/transactions/{id}`: Update an existing transaction.
- `DELETE /api/v1/transactions/{id}`: Delete a transaction.
- `GET /api/v1/categories`: List income and expense categories.
- `POST /api/v1/categories`: Create new category (`name`, `type`, `color`, `icon`).

---

## 📊 Budgets, Goals & Debts
- `GET /api/v1/budgets?month=YYYY-MM`: Fetch category budgets and spending progress for given month.
- `POST /api/v1/budgets`: Set monthly budget limit for category.
- `GET /api/v1/goals`: List savings goals.
- `POST /api/v1/goals`: Create savings goal.
- `POST /api/v1/goals/{id}/deposit`: Deposit funds into goal.
- `POST /api/v1/goals/{id}/withdraw`: Withdraw funds from goal.
- `DELETE /api/v1/goals/{id}`: Delete goal.
- `GET /api/v1/debts`: List debts and loans with APR, remaining balance, and minimum payments.
- `POST /api/v1/debts`: Add loan or credit balance.
- `POST /api/v1/debts/{id}/payment`: Record a debt payment.
- `DELETE /api/v1/debts/{id}`: Delete debt.

---

## 🏛️ AI Council Deliberation
- `GET /api/v1/council/providers`: Get AI model status chips and connection state.
- `POST /api/v1/council/probe-all`: Run probe benchmark across all configured AI providers.
- `POST /api/v1/council/jobs`: Dispatch deliberation job (`question`, `decision_type`, `amount`, `round2_enabled`, `local_only`).
- `GET /api/v1/council/jobs/{job_id}`: Poll deliberation status and intermediate/final votes.
- `POST /api/v1/council/jobs/{job_id}/cancel`: Cancel deliberation in progress.
- `GET /api/v1/council/decisions`: List past 10 deliberation history summaries.
- `GET /api/v1/council/decision/{id}`: Fetch complete deliberation details, transcripts, and votes.
- `POST /api/v1/council/decide/{id}`: Record user's final decision (`verdict`, `user_notes`).
- `GET /api/v1/council/models`: Manage AI model configurations, parameters, and fallbacks.
- `PUT /api/v1/council/models/{provider}`: Update model ID, temperature, top_p, or recommended settings.

---

## 🩺 Smart Review & Health Scores
- `GET /api/v1/review/current`: Fetch current 0-100 financial health audit score and category breakdown.
- `POST /api/v1/review/run`: Trigger immediate on-demand re-audit.
- `GET /api/v1/review/history`: Fetch historical weekly health audits.

---

## 📦 Data Import & Export
- `POST /api/v1/data/import-csv`: Upload bank or mobile money CSV statement with auto-categorization.
- `GET /api/v1/data/export-csv/{resource}`: Download CSV of transactions, budgets, or debts.
- `GET /api/v1/data/export-json`: Download complete portable database JSON backup.
- `POST /api/v1/data/restore-json`: Restore database from JSON backup (`merge` or `overwrite`).

---

## ⚡ System Health
- `GET /api/v1/health`: Cold-start probe and ping response.
