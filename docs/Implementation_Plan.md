# MoneyCouncil Frontend UI Overhaul — Implementation Plan

Related: [[index]] | [[MoneyCouncil_UI_Upgrade_Prompt]] | [[Bug_Tracker]] | [[Design_System]]

## Codebase Summary

- **Stack:** React 18 + Vite + TypeScript, client-side routing with `react-router-dom`, Lucide React icons, Recharts for financial analytics.
- **Styling:** Design token-driven CSS architecture (`index.css`) with light & dark themes, eliminating ~960 inline styles and undefined classes.
- **State Management:** 6 React Context Providers:
  - `AuthContext`: session, user profile, login, logout, register
  - `CurrencyContext`: active currency symbol & formatter
  - `PinLockContext`: device-level PBKDF2 PIN lock & auto-idle timer
  - `ServerStatusContext`: cold-start retry & health check banner
  - `SyncContext`: offline outbox, IndexedDB sync status, network state
  - `ThemeContext`: light (warm cream) & dark (deep navy) themes
- **Pages:** 13 pages, structured components, and 11 API client modules.

---

## Phased Execution Roadmap

### Phase 1: Foundation (Design System, Router, Shared Shell)
1. Install client routing (`react-router-dom`) and charting (`recharts`).
2. Rebuild `index.css` with comprehensive CSS custom property tokens, utility classes, and reset.
3. Configure `BrowserRouter` with routes:
   - `/login`, `/register`
   - `/dashboard`
   - `/transactions`
   - `/plan/budgets`, `/plan/goals`, `/plan/debts`
   - `/council`, `/council/:decisionId`
   - `/review`
   - `/data`
   - `/settings`, `/settings/:section`
4. Build shared UI component library:
   - `Button`, `IconButton`, `Card`, `StatCard`, `Badge`
   - `Tabs`, `SegmentedControl`, `Modal`, `ConfirmDialog`, `Toast`
   - `EmptyState`, `Skeleton`, `FileDropzone`, `PageHeader`, `MoneyInput`
5. Fix navigation bugs:
   - **Bug #1:** Plan tabs sync between URL, sidebar, and in-page tabs.
   - **Bug #3:** Add Data & Backups to desktop sidebar.
   - **Bug #4:** Full client-side routing with history support.
   - **Bug #7:** In-app toast notifications and modal confirm dialogs.

### Phase 2: Authentication & Lock Screen
- Rebuild `LoginPage` with desktop split-screen brand hero + responsive form.
- Rebuild `RegisterPage` with currency selector, password strength, invite code hint.
- Rebuild `PinLockScreen` with interactive keypad, physical keyboard support, shake animation on error, and logout confirmation.

### Phase 3: Dashboard
- Rebuild `DashboardPage` with greeting, hero monthly cash flow, and KPI grid.
- KPI tiles: Cash Flow, Runway, Savings Rate, Debt-to-Income.
- Responsive charts side-by-side on desktop (`MonthlyCashFlowTrends` + `TopSpendingCategories`).
- First-run empty state onboarding checklist.
- Calm/breach Financial Health Guardrails indicator.

### Phase 4: Transactions
- Rebuild `TransactionsPage` with compact summary strip, one-line filter toolbar, grouped date list.
- In-page Quick Add modal with keyboard shortcut (`N`).
- Offline outbox pills and disabled action tooltips.

### Phase 5: Plan (Budgets, Goals, Debts)
- Segmented control navigation synced with route (`/plan/budgets`, `/plan/goals`, `/plan/debts`).
- `BudgetsPage`: Month switcher, category progress bars (amber at 80%, red over 100%), budget limit modal, category modal with icon & color swatch picker.
- `GoalsPage`: Target progress rings/bars, deposit/withdraw sheet, emergency fund suggestion empty state.
- `DebtsPage`: APR badges, payoff schedule calculation, payoff payment sheet, positive clean-slate empty state.

### Phase 6: Ask the Council
- Council bench roster header showing model family count and status dots.
- Preset decision chips, question textarea with character counter.
- Fix **Bug #2**: provider status chips mapping (`working`, `failed`, `slow`, `untested`, `skipped`, etc.).
- Animated deliberation polling view with voter progress tiles.
- Verdict hero gauge, key agreements vs dissents columns, collapsible vote cards for Round 1 and Round 2.
- Sticky "Your final say" decision bar with Accept / Modify / Reject.
- Full deliberation history view (`/council/:decisionId`).
- Provider benchmark sheet.

### Phase 7: AI Models Manager
- Voter sidebar/tabs on the left, selected voter configuration on the right.
- Fix All, Auto-Switch switch, catalog search, recommended models list, custom model ID with free endpoint checkbox.
- Probes and advanced sampling parameter controls.

### Phase 8: Smart Review (Financial Audit)
- Rebuild `SuggestionsPage`: Health Score ring (0-100), four sub-score bars (Savings, Runway, Debt, Budgets).
- Findings filter chips with one-click "Ask Council" question pre-filling.
- Fix **Bug #5**: History tab styling contrast in dark mode.
- Timeline of past weekly snapshots.

### Phase 9: Data & Backups
- Single home for CSV statement import (MTN, Telecel, M-Pesa, bank).
- Drag-and-drop `FileDropzone` with duplicate skipping and auto-category creation.
- CSV export buttons (Transactions, Budgets, Debts).
- JSON backup export and restore with safe Overwrite confirm dialog.

### Phase 10: Settings & Global Shell
- Settings sub-navigation (General, Guardrails, Security, AI Models, Data link, System Status).
- Fix **Bug #8**: Device-side AES-GCM IndexedDB encryption or clear transparent state.
- Mobile bottom navigation tab bar + clean top bar with sync indicator.

---

## Completion & Verification Status

- [x] **Phase 1: Foundation (Design System, Router, Shared Shell)** — Completed & Verified
- [x] **Phase 2: Authentication & Lock Screen (`LoginPage`, `RegisterPage`, `PinLockScreen`)** — Completed & Verified
- [x] **Phase 3: Dashboard (`DashboardPage`, `MetricCards`, `CashFlowChart`, `BudgetProgress`, `DebtTimeline`)** — Completed & Verified
- [x] **Phase 4: Transactions (`TransactionsPage`)** — Completed & Verified
- [x] **Phase 5: Plan (`PlanPage`, `BudgetsPage`, `GoalsPage`, `DebtsPage`)** — Completed & Verified
- [x] **Phase 6: Ask the Council (`CouncilPage`, `CouncilTallyPanel`, `CouncilVoteCard`)** — Completed & Verified
- [x] **Phase 7: AI Models Manager (`AIModelsManager`)** — Completed & Verified
- [x] **Phase 8: Smart Review (`SuggestionsPage`)** — Completed & Verified
- [x] **Phase 9: Data & Backups (`DataPage`)** — Completed & Verified
- [x] **Phase 10: Settings & Mobile More (`SettingsPage`, `MorePage`)** — Completed & Verified
- [x] **Bug Resolutions (1 through 8)** — All 8 bugs resolved without breaking API contracts
- [x] **TypeScript Check** — `npx tsc --noEmit` passes with 0 errors
- [x] **Production Build** — `npm run build` succeeds with PWA service worker generation
