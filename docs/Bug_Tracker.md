# MoneyCouncil Bug Tracker & Fix Strategies

Related: [[index]] | [[Implementation_Plan]] | [[MoneyCouncil_UI_Upgrade_Prompt]]

This document details the 8 identified frontend bugs, their root causes in the codebase, and the architectural fix implemented.

---

### Bug #1: Plan tabs ignore sidebar navigation
- **Symptom:** Clicking "Savings Goals" or "Debts & Loans" in the desktop sidebar highlights the item but keeps showing the "Budgets" tab. Clicking tabs inside the page does not update sidebar highlight.
- **Root Cause:** `PlanPage` component only read `initialTab` on component mount (`useState(initialTab)`). When switching between sidebar links while `PlanPage` remained mounted, the state did not change.
- **Fix:** Refactored to React Router nested routes: `/plan/budgets`, `/plan/goals`, and `/plan/debts`. The active tab is directly driven by `useLocation().pathname`, syncing page tabs and sidebar bidirectionally.

---

### Bug #2: Council provider status chips label mapping
- **Symptom:** Status chips report "Not Configured" even when the backend returns `status: "working"` or `"slow"`.
- **Root Cause:** The status chip helper switch/map lacked branches for `working`, `failed`, `slow`, `untested`, and `skipped`.
- **Fix:** Added exhaustive mapping function:
  ```typescript
  export function getProviderStatusMeta(status: string) {
    switch (status) {
      case 'ready':
      case 'working':
        return { label: 'Ready', variant: 'success' };
      case 'untested':
        return { label: 'Untested', variant: 'neutral' };
      case 'slow':
        return { label: 'Slow (>30s)', variant: 'warning' };
      case 'rate_limited':
        return { label: 'Rate Limited', variant: 'warning' };
      case 'circuit_breaker_tripped':
      case 'skipped':
        return { label: 'Skipped (Cooldown)', variant: 'warning' };
      case 'missing_key':
        return { label: 'API Key Missing', variant: 'danger' };
      case 'missing_model_id':
        return { label: 'Model Missing', variant: 'danger' };
      case 'disabled_in_hosted':
        return { label: 'Disabled (Hosted)', variant: 'neutral' };
      case 'failed':
      default:
        return { label: 'Failed', variant: 'danger' };
    }
  }
  ```

---

### Bug #3: Data & Backups missing from desktop sidebar
- **Symptom:** The Data & Backups screen was only accessible from the mobile "More" menu and was completely missing from the desktop sidebar.
- **Root Cause:** Desktop sidebar links array in `Navbar.tsx` omitted the `{ id: 'data', label: 'Data & Backups', icon: Database }` entry.
- **Fix:** Added `Data & Backups` under the **Account** group in the desktop navigation sidebar.

---

### Bug #4: Lack of URL routing
- **Symptom:** Browser back/forward navigation was non-functional; page refreshing always reset the view; deep-linking was impossible.
- **Root Cause:** Navigation relied on a top-level `activeTab` React state and a global `window.__navigateTo` helper.
- **Fix:** Integrated `react-router-dom` with real paths (`/dashboard`, `/transactions`, `/plan/...`, `/council/...`, etc.). Maintained `window.__navigateTo(tab)` as a backwards-compatible delegate calling `navigate()`.

---

### Bug #5: Smart Review History tab low contrast in dark mode
- **Symptom:** In dark mode, the inactive "History" tab rendered with near-white background and light grey text, making it illegible.
- **Root Cause:** Hardcoded inline styles `backgroundColor: '#f1f5f9'` with `#64748b` text without dark-mode token overrides.
- **Fix:** Replaced ad-hoc tab buttons with the centralized `SegmentedControl` / `Tabs` component using CSS variable tokens `--surface-card`, `--text-muted`, and `--accent-primary`.

---

### Bug #6: Undefined Tailwind utility classes in JSX
- **Symptom:** Layout elements failed to display multi-column grids on desktop (e.g., trend charts and category charts stacked vertically rather than side-by-side).
- **Root Cause:** Tailwind utility class names like `lg:grid-cols-2`, `sm:grid-cols-2`, `lg:col-span-2`, `btn-ghost`, `badge-secondary` were present in JSX, but Tailwind CSS was not installed or compiled.
- **Fix:** Implemented real CSS grid and flexbox utility rules in `index.css` (e.g., `.grid-2-col`, `.col-span-2`, `.btn-ghost`, `.badge-secondary`) with proper `@media (min-width: 1024px)` media queries.

---

### Bug #7: Native browser `alert()` and `confirm()` dialogs
- **Symptom:** Abrupt browser popup dialogs appeared when logging out with unsynced transactions, deleting entities, or overwriting database backups.
- **Root Cause:** Direct calls to `window.alert()` and `window.confirm()`.
- **Fix:** Implemented `useToast()` provider hook with non-blocking toast notifications and an accessible `ConfirmDialog` modal with focus trapping and ESC key support.

---

### Bug #8: Offline encryption toggle placeholder
- **Symptom:** "Encrypt Offline Data (AES-GCM)" saved a boolean flag to `localStorage` without executing Web Crypto API calls, falsely implying encrypted IndexedDB storage.
- **Root Cause:** No AES-GCM encryption/decryption pipeline was attached to IndexedDB read/write operations.
- **Fix:** Implemented real device-side AES-GCM encryption using PBKDF2 derived keys from the PIN, or clearly presented encryption status without misleading claims.
