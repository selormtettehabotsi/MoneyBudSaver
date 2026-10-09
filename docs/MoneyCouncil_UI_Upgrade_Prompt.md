# MoneyCouncil: Frontend UI Overhaul

You are working in the MoneyCouncil codebase: a React + Vite PWA frontend served by a FastAPI backend. Redesign and rebuild the **entire frontend UI** so it looks and feels like a polished, trustworthy, modern fintech product, on desktop and on phones.

The backend, the API and the app's behaviour are fine. **This job is the presentation layer**: layout, navigation, visual design, components, responsiveness, empty states, feedback and accessibility. It also covers the frontend bugs listed in section 3.

Read this whole brief before starting, then explore the codebase to map each item to the actual files.

---

## 1. Hard constraints (do not break these)

1. **Do not change the backend or any API contract.** Every `/api/v1/...` request must keep the same method, path, request body and response handling. If you find you need a backend change, stop and list it as a proposal instead.
2. **Keep every feature.** Section 5 lists all of them, page by page. Nothing may disappear, and every button and setting must still work after the redesign. You may move things, regroup them, rename labels for clarity, or put them behind a menu or disclosure.
3. **Keep the core plumbing intact**, but feel free to restyle its UI:
   - Shared fetch wrapper: 3 retries with backoff, plus the "warming" state for Render cold starts
   - CSRF: `mc_csrf` cookie sent as an `X-CSRF-Token` header; cookie-based sessions
   - Offline support: IndexedDB `moneycouncil_offline_db` (stores `user_data`, `outbox`, `security`), the `loadCachedOrFetch` cache-then-network pattern, the offline transaction outbox with `client_id` idempotency, and auto-sync when the device comes back online
   - PIN lock: PBKDF2 hashing on the device, idle auto-lock timer, lock screen
   - Theme persisted in `localStorage.mc_theme`; currency from the user profile
   - The `mc_transaction_added` window event that refreshes the dashboard and transactions
   - PWA service worker and the "Update Available" banner
4. **Keep both themes**: dark (default) and light, toggled anywhere the toggle exists today. Design both properly; neither should be a colour-swap afterthought.
5. **Keep the existing product name, logo (shield icon) and indigo/violet brand accent.** You may refine the palette around it.
6. **Ship it working.** It must build with no errors and no new console errors, and every page must render in both themes at 390px, 768px and 1440px widths.

---

## 2. What the app is (context)

MoneyCouncil is a personal-finance app aimed mainly at Ghana. The default currency is GHS (GH₵), and statements can be imported from MTN, Telecel and M-Pesa mobile money. Users track transactions, budgets, savings goals and debts. Its signature feature is the **AI Council**: several free AI models from different providers vote independently on a financial decision (Approve / Conditional / Reject, each with a confidence level). They can optionally debate in a second round, and their votes combine into a confidence-weighted verdict. The app shows hard "guardrail" warnings when a decision breaks the user's debt or runway limits, and **the user always has the final say**. There is also a weekly rule-based "Smart Review" health score out of 100.

Access is invite-only: the first user becomes the owner. A brand-new user starts with 15 default categories and **no other data**, so empty states are what new users see first and must look great.

---

## 3. Problems observed in the current UI (fix all of these)

These were found by logging in and screenshotting every page at 1440px and 390px in both themes.

### Functional bugs
1. **Plan tabs ignore the sidebar.** Clicking "Savings Goals" or "Debts & Loans" in the desktop sidebar highlights that item but keeps showing the **Budgets** tab. This happens because the `budgets`/`goals`/`debts` cases render the same component, which reads `initialTab` only on mount.
   The reverse is also broken: clicking the Goals or Debts tab inside the page leaves the sidebar highlighting "Budgets".
   Navigation and the active tab must always agree.
2. **Council status chips are wrong.** The status-chip label logic doesn't handle the `working`, `failed`, `slow`, `untested` or `skipped` statuses, so providers the server reports as `working` show **"Not Configured"**. Map every `ProviderStatusItem.status` value correctly: `ready`, `missing_key`, `missing_model_id`, `disabled_in_hosted`, `rate_limited`, `circuit_breaker_tripped`, `working`, `failed`, `untested`, `slow`, `skipped`.
3. **Data & Backups is missing from desktop navigation.** It's reachable only from the mobile "More" menu.
4. **There's no URL routing.** Pages are switched with `useState` plus a global `window.__navigateTo`, so the browser back button, refresh and deep links don't work. Add client-side routing, e.g. react-router with `/dashboard`, `/transactions`, `/plan/budgets`, `/plan/goals`, `/plan/debts`, `/council`, `/council/:decisionId`, `/review`, `/data`, `/settings/...`. The backend already serves the SPA for any path (`GET /{full_path}`). Keep `window.__navigateTo` working as a thin wrapper if anything still uses it.
5. **Smart Review's History tab is nearly invisible.** Its inactive state renders as a near-white pill with light text in dark mode.
6. **Layout classes appear to be undefined.** Several Tailwind-style class names used in JSX don't seem to be defined anywhere, for example `lg:grid-cols-2`, `sm:grid-cols-2`, `lg:col-span-2`, `flex-wrap`, `text-center`, `gap-5`, `items-start`, `justify-end`, `btn-ghost` and `badge-secondary`. That's why intended two-column layouts collapse to one column on desktop (the dashboard's trend and category cards stack instead of sitting side by side). Verify this in the codebase and replace it with a real styling system (section 4).
7. **Native browser dialogs.** Errors and confirmations use `alert()` and `window.confirm()`. Replace them with in-app toasts and confirm dialogs, keeping the same wording and logic (e.g. the destructive-restore warning and the logout-with-unsynced-items warning).
8. **The offline encryption toggle doesn't encrypt anything.** "Encrypt Offline Data (AES-GCM)" in Settings only stores a flag. Nothing in the frontend calls `crypto.subtle.encrypt`, so IndexedDB data stays plaintext. Preferably implement it properly, entirely on the device: derive an AES-GCM key from the PIN with PBKDF2, encrypt `user_data`/`outbox` payloads at rest, and decrypt after unlock. If that's too risky in this pass, hide the toggle and the "encrypts IndexedDB" wording, and leave a TODO. **Never ship UI that claims encryption that isn't happening.**

### Design and UX problems
- **No visual hierarchy.** Every section is the same bordered glass card at the same weight, so headline numbers, secondary info and disclaimers all compete.
- **Wasted and unbalanced space on desktop.** Transactions stacks three full-width summary cards that each hold one number, and the filter panel has a large empty gap with the dropdowns stranded at the bottom. Settings uses only about half the screen width. Empty pages leave most of the screen blank.
- **Banner overload.** The same "Notice: AI Council evaluations… not certified financial advice" banner repeats on the Dashboard, Council and Smart Review, plus a second "Accumulating baseline spending data" banner. On mobile these push the actual content below the fold. Show the disclaimer once, compactly: in the Council results area and a footer or "About" spot. Turn data-sufficiency notices into a slim, dismissible inline hint.
- **Weak empty states.** "No expenses recorded this month yet." and "No category budgets set…" are plain grey text in a big box. The dashboard chart renders an empty grid.
- **Contradictory messaging.** With zero data, Smart Review shows "62 / Moderate – Action Advised" right next to a finding titled "All Financial Indicators Healthy". When `has_sufficient_data` is false, show the score as provisional or "Not enough data yet", without alarming colours.
- **Settings is a long scroll of nine stacked sections** and repeats the whole Data & Backups page (CSV export, CSV import, JSON backup/restore).
- **Unstyled native file inputs** ("Choose file / No file chosen").
- **Mobile issues:**
  - The header title truncates ("Ask the AI Co…") and duplicates the page H1.
  - The Council presets row overflows horizontally (INVESTMENT is clipped).
  - The floating "+" button overlaps content and chart legends.
  - Ten provider status chips take up a whole screen before the actual form.
- **Developer jargon in user-facing text**: "SSRF protected", "TTFT", "circuit breaker", "Zero Render edits required", "HTTP 404", "IndexedDB", "Bcrypt". Keep technical detail available for power users inside the AI Models manager and an advanced section, but use plain language in primary UI.
- **Generic dashboard headline.** The page leads with "Financial Overview / Real-time cash flow, runway, and council analytics" instead of the user's actual position.

---

## 4. Design direction and system

**Feel:** calm, confident, premium fintech; think Monzo, Revolut, Copilot Money and Linear-level polish. Money is stressful, so the UI should reduce anxiety: clear numbers, generous spacing, restrained colour, and colour used only to carry meaning (green = good, amber = caution, red = danger, indigo = brand and action).

**Build a real design system first, then rebuild pages on it.**
- Choose one styling approach and apply it consistently. Either:
  - Tailwind CSS, mapped to the CSS-variable tokens, or
  - CSS Modules or a single well-organised stylesheet driven by tokens.

  Migrate away from the ~960 inline `style={{…}}` objects and the `<style>` blocks embedded in components. No new inline styles except truly dynamic values (e.g. a progress width or a category colour).
- **Tokens** (CSS variables, with light and dark values for each):
  - Colour: background layers (app, surface, raised, overlay), text (primary, secondary, muted, inverse), border, brand (indigo plus a hover state), and semantic success, warning, danger and info, each with background and border variants
  - Chart palette
  - Spacing scale (4px base)
  - Radius scale
  - Shadow and elevation levels
  - z-index layers
  - Motion durations and easing

  Existing tokens like `--bg-primary` and `--accent-primary` live in the global CSS; evolve them rather than starting from nothing.
- **Light theme:** keep it warm (the current cream direction is good), but make sure contrast passes WCAG AA.
- **Dark theme:** deep neutral/navy. Cut back on heavy glassmorphism and borders-on-everything; use elevation and spacing to separate content instead.
- **Typography:** Inter for UI, Outfit (already loaded) for display numbers and headings, or a single family if cleaner. Set a clear type scale. **Every monetary value uses tabular figures** and consistent currency formatting through the existing `formatMoney`.
- **Component library** (accessible, keyboard-navigable, both themes):
  - Button: primary, secondary, ghost, danger; sizes; loading state; icon-only with aria-label
  - IconButton
  - Card
  - StatCard / KPI tile: label, value, delta or status, optional sparkline
  - Badge / StatusPill
  - Tabs / SegmentedControl
  - Form controls: Input, MoneyInput (currency prefix, numeric keypad on mobile), Select, Textarea, Checkbox, Switch, DatePicker (styled native input is fine)
  - Modal on desktop, bottom-sheet on mobile, with focus trap and Esc to close
  - ConfirmDialog
  - Toast system
  - EmptyState: icon or illustration, title, one-line explanation, primary action
  - Skeleton loaders for every data area, replacing the spinner-plus-text pattern
  - ProgressBar / ProgressRing
  - FileDropzone (drag and drop plus click, shows file name, size and type)
  - PageHeader: title, optional subtitle, actions
  - Section header
  - Disclosure / Accordion
  - DataList / Table, responsive: a table on desktop, card rows on mobile
- **Icons:** keep `lucide-react`, at consistent size and stroke.
- **Charts:** keep Recharts, themed with the token chart palette. Design proper empty-chart states.
- **Motion:** subtle 150–250ms transitions; respect `prefers-reduced-motion`.

---

## 5. Information architecture and page-by-page spec

### Navigation
- **Desktop sidebar**, grouped:
  - **Overview**: Dashboard
  - **Money**: Transactions, Budgets, Savings Goals, Debts & Loans
  - **Advice**: Ask the Council (keep it highlighted as the hero), Smart Review
  - **Account**: Data & Backups, Settings
  - Footer: compact user chip (email, currency), theme toggle, Lock App (only when a PIN is set), Sign Out
  - Optionally collapsible to icons only
- **Sync status** (Synced / Syncing… / N Pending / Offline (N)): a small unobtrusive indicator in the sidebar or header. Clicking it still opens the Offline Sync Queue sheet with per-item Retry and Discard, plus Sync All Now.
- **Mobile:**
  - Bottom tab bar with Home, Transactions, Council (centre, emphasised), Plan, More
  - A slim top bar with the page title (no duplicate H1), sync dot and a contextual action
  - Replace the floating "+" with a context-aware primary action that never covers content, or keep the button and add bottom padding so it never overlaps
  - Respect safe-area insets
- **Plan** (Budgets, Goals, Debts) is a single section with a segmented control, synced with the URL and the sidebar (see bug 1).
- **Global "Quick Add Transaction"**: keep it on mobile, add it to the desktop header, and give it a keyboard shortcut (e.g. `N`). Same fields: Expense/Income, Amount, Description/Merchant, Category (optional), Date.

### 5.1 Auth: Sign In, Create Account
- **Sign In:** email, password with show/hide, submit with loading state, and a link to Create Account.
- **Create Account:**
  - Email
  - Password (min 8 characters, max 72 bytes) with a strength hint
  - Default Currency (GHS, USD, EUR, GBP, NGN, KES, ZAR)
  - Invite Code ("optional for the first user")
  - Note: "First account is automatically the owner"
- **Layout:** split screen on desktop (brand panel on one side explaining the Council concept, form on the other); single column on mobile. Show inline field errors instead of a single error line.

### 5.2 PIN Lock screen
- Full-screen lock: logo, "MoneyCouncil Locked", PIN dots, numeric keypad with Clear and Delete, shake animation plus a message on a wrong PIN, and "Forgot PIN? Log Out & Re-sync" (with confirmation).
- Physical keyboard digits must also work.

### 5.3 Dashboard
Lead with what matters: a greeting plus this month's **net cash flow** as the hero number, with In and Out underneath.

- **KPI row**, each tile with a status pill and a one-line plain-language explanation on hover or tap:
  - **Cash Flow**
  - **Runway**: "N mo", "99+ mo" or "Not enough data"; Low <3, Moderate <6, Healthy ≥6, Pending
  - **Savings Rate**: target 20%, On Target or Under
  - **Debt-to-Income**: Safe ≤25%, Caution >25%, Critical >40%; total debt
- **Charts row**, actually side by side on desktop:
  - **Monthly Cash Flow Trends**: 6-month income vs expense, tooltip with Income, Expense and Net
  - **Top Spending Categories**: donut or bar of the current month, with a "Manage Budgets" link
- **Financial Health Guardrails** card:
  - All clear: a calm green state
  - Breach: a prominent red alert listing `guardrail_warnings`, with an "Ask Council" call to action
- Keep the Refresh, Ask Council and New Transaction actions, plus the "Hide/Show charts" preference (remember it).
- **First-run state** (no transactions): replace the empty KPIs and chart grid with an onboarding checklist:
  1. Add your first transaction or import a statement
  2. Set a budget
  3. Create a savings goal
  4. Record any debts
  5. Ask the Council a question

  Show the "2+ weeks of data needed" message here, positively framed.
- **Error state:** "Something went wrong", Reference ID (copyable), Try Again.
- Keep the cached/offline data behaviour.

### 5.4 Transactions
- **Compact summary strip**: Total Income, Total Expenses, Net Balance for the current filter, in one row on desktop.
- **Toolbar on one line**: search, type filter (All / Income / Expense) and category filter as chips or selects, plus an "Add Transaction" button.
- **List grouped by date** (Today, Yesterday, dates), each row showing:
  - Category icon with its colour
  - Description, category name (or "Uncategorized")
  - Signed amount, coloured
  - "Waiting to sync" pill for offline items
  - Row actions: Edit, Delete with confirmation. Both are disabled offline, with a tooltip explaining why.
  - On mobile: swipe or overflow menu
- **New/Edit Transaction** modal or sheet: Expense/Income toggle, Amount (MoneyInput), Description ("e.g. Supermarket Grocery"), Category, Date; "Create Transaction" or "Save Changes". The offline-create path still queues to the outbox.
- **Empty state** with "Add Transaction" and "Import a statement" (links to Data & Backups).

### 5.5 Plan › Budgets ("Budgets & Spending Limits")
- **Month switcher** (Previous / Next) with Budgeted, Spent and Total Used % as a summary bar.
- **Budget cards per category**: icon and colour, progress bar (amber near 80%, red and "Over Budget" past 100%), "NN% Used", Spent vs Limit, remaining amount.
- **Set Budget Limit** modal: Expense Category and Monthly Limit Amount, then "Save Budget Limit". It creates or updates the month's budget.
- **New Category** modal:
  - Name ("e.g. Subscriptions & Software")
  - Type (Expense/Income)
  - Colour swatches
  - Icon picker: Tag, Cart, Home, Briefcase, Trending, Entertainment, Education, Savings, Debt, Bills
- Both actions are disabled offline, with an explanation.
- **Empty state:** "No budgets for {Month Year}" with "Set your first budget", optionally suggesting the user's top expense categories.

### 5.6 Plan › Savings Goals
- **Summary**: Total Saved in Goals and Combined Target.
- **Goal cards**: title, progress ring or bar, "NN% Saved" or a "Goal Achieved" celebration state, Saved vs Target, target date, and Deposit, Withdraw, Edit and Delete (with confirmation).
- **Create/Edit Goal**:
  - Goal Title ("e.g. Emergency Fund (6 Months)")
  - Target Amount
  - Initial Saved Amount
  - Target Completion Date (optional)
  - Notes (optional)
- **Deposit/Withdraw** sheet: shows the target and current balance, takes an amount, then Confirm.
- **Empty state** suggesting an emergency fund goal.

### 5.7 Plan › Debts & Loans
- **Summary**: Total Outstanding Balance and Total Monthly Payments.
- **Debt cards**:
  - Name, "X% APR" pill, "Paid Off" state
  - Remaining Balance, Monthly Payment
  - Paid progress bar
  - Payoff line: "~N months remaining", "Fully amortized", or a clear warning "Payment below interest — this debt will grow"
  - Record Payment, Edit, Delete (with confirmation)
- **Add/Edit Loan**:
  - Debt / Loan Name
  - Total Principal
  - Remaining Balance
  - Annual Interest Rate (% APR)
  - Monthly Minimum Payment
  - Due Day of Month (1–31)
  - Start Date
- **Record Loan Payment** sheet: shows the debt and current balance, takes a Payment Amount, then Confirm.
- **Empty state:** "No debts recorded — clean balance sheet!", designed as a positive state.

### 5.8 Ask the Council (hero feature: make this the most impressive screen)

**Council roster (header area):**
- Replace the wall of ten text chips with a compact visual "council bench": one avatar or tile per voter, coloured status dot, and model family.
- Show a summary such as "5 of 9 voters ready · 4 model families", followed by:
  - **AI Models** (opens the manager)
  - **Test All Providers** (runs probes and opens the Benchmark results)
- Expanding a voter shows its detail: model ID, status, shared rate limit, daily quota, and Retry now when the circuit breaker has tripped.
- Show the "needs fixing → Fix in AI Models" banner and the Model Family Diversity notice (fewer than 4 working families) compactly.

**Ask form:**
- Preset chips that wrap on mobile (no horizontal overflow):
  1. "Should I borrow GHS 2,000 for a laptop upgrade to increase freelance output?" (borrow, 2000.00)
  2. "Should I buy a smartphone for GHS 1,500 cash from my emergency savings?" (purchase, 1500.00)
  3. "Should I invest GHS 3,000 lump sum into government treasury bills?" (investment, 3000.00)
- Question textarea, max 1000 characters, with a counter
- Decision Type:
  - Borrowing / Taking Debt (`borrow`)
  - Major Cash Purchase (`purchase`)
  - Investment / Capital Allocation (`investment`)
  - Expense / Budget Restructuring (`budget_cut`)
  - General Financial Strategy (`general`)
- Proposed Amount (MoneyInput)
- Toggles:
  - "Enable Round 2 Debate", with a short explanation
  - "Local-Only (Ollama)", disabled in hosted mode with an explanation
- **Preview AI Prompt** opens a sheet showing the server-sanitized prompt, with the copy "Names, emails and account numbers are removed before anything reaches the AI models."
- **Convene Council & Vote** as the primary call to action. Disable it offline, with an explanation.

**Active job:**
- If a job is already running, show the "Deliberation in progress" card with its Job ID and **Cancel**.
- Deliberating state: a live, engaging progress view:
  - Each voter's tile animates through waiting → thinking → voted / skipped / failed
  - "Round X of Y"
  - Cancel Deliberation
- Polling every 1.5s via `/council/jobs/{id}` stays as is.

**Results:**
1. **Verdict hero**: one of APPROVE / CONDITIONAL APPROVAL / REJECT / SPLIT TIE / NO QUORUM (needs ≥3 valid votes), with a weighted-score gauge from −1 (Reject) through 0 (Neutral) to +1 (Approve).
2. **Guardrail breach**: a full-width red "Hard guardrail warning" banner above everything else when present.
3. **Notices**:
   - Limited spending history: "runway guardrail skipped; confidence capped at 40%"
   - Family diversity
4. **Key Agreements** and **Dissent & Concerns** as two clear columns.
5. **Vote cards** grouped into "Round 1: Independent Blind Voting" and "Round 2: Peer Debate & Revised Stances". Each card is collapsible and shows:
   - Provider and model, vote pill
   - Confidence bar
   - Latency, plus "Fallback: model" when one was used
   - Explanation
   - Suggested Limit
   - Identified Risks
   - Required Conditions
   - Error pills where relevant: Not Configured, Timeout, Rate Limited, Invalid Key, Model Not Found, Unavailable, Failed
6. **Retry Failed Providers** button.
7. **"Your final say"**: Accept / Modify / Reject. These open "Record Your Final Decision" with a Notes or Modifications field, then save via `/council/decide/{id}`. Disable them when there's no quorum, with an explanation. Show the recorded decision once saved.
   On mobile, keep the sticky bottom action bar ("Your Say: Accept · Modify · Reject").

**Past Deliberations:**
- The last 10: question, date, verdict pill and your decision.
- Clicking one opens the full result (route `/council/:decisionId`, loaded via `/council/decision/{id}`).

**Benchmark sheet**, per provider:
- Catalog OK or Failed
- Chat OK
- Time to first token (label it "Response start time" in plain language)
- Total latency
- Rate-limit retry countdown
- Plus the OpenRouter Privacy Settings link and the "Available Free Models" list

### 5.9 AI Models Manager (modal from the Council page; also a Settings section)
This is a power-user screen. Keep every capability, but organise it much better: a list of voters on the left (or an accordion on mobile) and the selected voter's detail on the right.

**Global controls:**
- **Fix All**
- **Switch Logs**
- **"Auto-switch when a model disappears"** switch

**Per voter:**
- Status pill. Labels: Ready, Working, Test Failed, Slow (>30s), Skipped (Circuit Breaker), Disabled in Hosted Mode, No Model Configured, API Key Missing
- Badges: Free Confirmed, Reasoning Model, "Shares rate limit with X", median response start time
- **Use in Council** switch
- **Active model** with Copy ID and Test
- Fallback model
- Revert history chips (with confirmation)
- **Use Recommended**
- **Choose Model…** picker sheet:
  - Search by name or family
  - "Recommended Models" (Recommended, Confirmed Free) and "Live Chat Catalog" sections
  - Use this model / Select
- **Custom model ID** field (e.g. `meta/muse-glimmer-30b`) plus the required checkbox "I confirmed this is a free endpoint", then **Apply Model** (tests and saves; the server rejects paid models)
- Probe results: HTTP status, in catalog, response start, total time, sequential attempts
- **Advanced settings** (collapsed by default):
  - Temperature (0.5)
  - Top P (0.95)
  - Max Tokens (4096 / 8192)
  - Base URL (HTTPS only)
  - Env var name for API key (e.g. `CUSTOM_API_KEY`)
  - Exclude from Round 2 Debate
  - Save
- **Edit Recommended List**: reorder up/down or drag, remove, add model ID ("no match in catalog" warning), Save

**Auto-Switch Audit Log:** entries showing Auto-Switched or Reverted, from → to, reason, time and "Revert back to X".

### 5.10 Smart Review ("Financial Audit & Smart Insights")
- **Tabs:** Current Audit and History (N), plus **Re-Audit**, disabled offline.
- **Health Score hero**: ring out of 100 with a band label:
  - ≥85 Excellent Financial Resilience
  - ≥70 Healthy & Stable Position
  - ≥50 Moderate – Action Advised
  - <50 Vulnerable – Critical Adjustments Required
  - Plus "Week of {date} · N findings"

  When data is insufficient, show it as provisional (see section 3).
- **Four sub-score bars**, each out of 25: Savings Rate, Runway Buffer, Debt Burden (DTI), Budget Adherence (N exceeded).
- **Findings**: filter chips All, Critical, Warnings, Info (with counts). Each finding card shows a severity icon and colour, category, title, description, an "Action:" step, and **Ask Council**. Ask Council navigates to the Council with the question pre-filled: `Regarding my financial audit finding: "{title}". What steps should I take?`
- **History**: a timeline of past weekly snapshots (week, generated date, findings count, score), ideally with a small score-trend sparkline.
- **Empty states** for no findings and no history.

### 5.11 Data & Backups ("Data & Disaster Recovery")
This is the **single home** for import and export. Remove the duplicate from Settings and link to it instead.

1. **Import CSV statement**
   - FileDropzone accepting MTN, Telecel and M-Pesa mobile money or bank CSVs
   - Explain the column matching and duplicate skipping in plain language
   - Toggle: "Automatically create categories found in the CSV"
   - Upload & Parse
   - Result card: Imported N transactions · Skipped duplicates N · Categories created N, plus any row notes
2. **Export CSV**: Transactions, Budgets and Debts buttons, as a tidy row.
3. **Full backup (JSON)**: Download Backup (.json).
4. **Restore from backup**
   - FileDropzone
   - Merge vs **Overwrite** (an explicit radio choice; Overwrite is styled as dangerous)
   - Confirm dialog with the existing warning text
   - Result card with the restored counts: categories, transactions, budgets, goals, debts, council decisions
5. All actions are disabled offline, with an explanation.

### 5.12 Settings
Split into sub-sections with a left sub-nav on desktop and a list → detail flow on mobile, instead of one giant scroll.

- **General**
  - Active Currency, all 10: GHS (default), USD, EUR, GBP, NGN, KES, ZAR, CAD, AUD, INR
  - Appearance (Dark / Light)
- **Financial Guardrails**
  - Max Debt-to-Income % (default 40, recommended 35–40%)
  - Minimum Safe Runway in months (default 3, recommended 3–6)
  - Explanation of the red guardrail warning
  - Save Preferences
- **Security**
  - **PIN Lock**: set a 4–8 digit PIN plus confirmation; Auto-Lock Idle Timeout of 1, 2, 5 (default), 15 or 30 minutes; offline encryption (see bug 8); Lock App Now; Change PIN or Auto-Lock; Disable PIN Lock (with confirmation). Keep the note that the PIN never leaves the device.
  - **Change Password**: current, new (min 12 characters), confirm, with a strength meter. Note that this signs out other sessions.
- **AI Models**: embeds the AI Models Manager (section 5.9).
- **Data & Backups**: a link card to `/data`.
- **System Status**
  - Backend health: Operational & Connected / Waking up (attempt n/3) / Connection issue
  - Latency, last checked, Check Health
  - Cold-start troubleshooting text, Retry, Dismiss

### 5.13 More (mobile only)
- Account card (email, currency)
- Links to Smart Review, Data & Backups and Settings
- Appearance toggle
- Log Out (danger style; keep the unsynced-items warning)

### 5.14 Global feedback states
- **Server waking up**: a slim top banner ("Waking up the server… this can take up to 50 seconds") instead of silent waits.
- **Offline**: a persistent subtle indicator. Every network-only action is disabled with a tooltip or helper text explaining why.
- **PWA "Update Available"** toast: Reload / Dismiss.
- **Toasts** for every success and failure (replacing `alert()`).

---

## 6. Quality bar and acceptance criteria

- **Accessibility:** WCAG 2.1 AA contrast in both themes; visible focus rings; full keyboard navigation; labelled inputs; aria-labels on icon buttons; 44×44px minimum touch targets; modals trap focus and return it on close; status is never conveyed by colour alone.
- **Responsive:** looks intentional at 360, 390, 768, 1024, 1440 and 1920px. No horizontal scroll on mobile. Tables become cards on small screens.
- **Performance:** no noticeable regressions; code-split heavy routes (Council, AI Models Manager, charts) with `React.lazy`.
- **Consistency:** every page is built from the shared components and tokens; no one-off colours or spacing.
- **Behaviour parity:** walk through every feature in section 5 and confirm it still works against the real API. Specifically test:
  - Add, edit and delete a transaction
  - Add a transaction offline, then sync it
  - Set a budget and change months
  - Create a goal, then deposit and withdraw
  - Add a debt and record a payment
  - Run a Council deliberation through to a recorded decision
  - Re-audit in Smart Review
  - CSV export and import
  - JSON backup and restore (merge)
  - Set and remove a PIN, lock and unlock
  - Theme toggle, currency change, password change validation
- **Bugs 1–8 in section 3 are fixed.**

## 7. How to work
1. Explore the codebase and summarise its structure and the current styling approach before changing anything.
2. Propose the token set and component list briefly, then build the design system and app shell (layout, navigation, routing) first.
3. Migrate pages one at a time in this order: Auth and Lock → Dashboard → Transactions → Plan (Budgets, Goals, Debts) → Council → AI Models Manager → Smart Review → Data & Backups → Settings → More. Keep the app building after each page.
4. After each page, check it in both themes at mobile and desktop widths (run the dev server and screenshot if you can).
5. At the end, report:
   - What changed
   - Any feature you couldn't preserve and why (there should be none)
   - Any backend change you'd recommend but didn't make
