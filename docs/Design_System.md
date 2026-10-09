# MoneyCouncil Design System

Related: [[index]] | [[Implementation_Plan]] | [[MoneyCouncil_UI_Upgrade_Prompt]]

The MoneyCouncil Design System is inspired by modern, premium fintech interfaces (Monzo, Revolut, Linear). It utilizes a tokenized CSS architecture supporting seamless light (warm linen/cream) and dark (deep navy) modes.

---

## 🎨 Color Palette & Tokens

### Background Layers
| Token | Light Theme | Dark Theme | Purpose |
| :--- | :--- | :--- | :--- |
| `--bg-app` | `#FAF8F5` (Warm Cream) | `#0B0F17` (Deep Midnight) | Base canvas background |
| `--surface-card` | `#FFFFFF` | `#131B2A` | Primary cards, panels, modals |
| `--surface-raised` | `#F3EFEA` | `#1A2438` | Hover states, secondary sections |
| `--surface-overlay` | `rgba(255,255,255,0.85)` | `rgba(19,27,42,0.85)` | Sticky headers, backdrops |

### Text Colors
| Token | Light Theme | Dark Theme | Purpose |
| :--- | :--- | :--- | :--- |
| `--text-primary` | `#1A1D23` | `#F1F5F9` | Headings, primary copy |
| `--text-secondary` | `#4A5568` | `#94A3B8` | Subtitles, labels, metadata |
| `--text-muted` | `#718096` | `#64748B` | Placeholders, inactive tabs |
| `--text-inverse` | `#FFFFFF` | `#0B0F17` | Text on inverted surfaces |

### Brand & Semantic Colors
- **Brand Accent:** Indigo `#6366F1` (Hover: `#4F46E5`, Active: `#4338CA`)
- **Success:** Emerald `#10B981` (Surface: `rgba(16,185,129,0.12)`) — Income, healthy guardrails, approved council votes
- **Warning:** Amber `#F59E0B` (Surface: `rgba(245,158,11,0.12)`) — Conditional votes, 80%+ budget utilization, caution runway
- **Danger:** Rose `#EF4444` (Surface: `rgba(239,68,68,0.12)`) — Expense, council rejections, over-budget, guardrail breach
- **Info / Cold:** Sky `#0EA5E9` (Surface: `rgba(14,165,233,0.12)`)

---

## 🔤 Typography & Numbers

- **Font Family:** `Inter`, system-ui, -apple-system, sans-serif
- **Headings & Numbers:** `Outfit`, sans-serif
- **Tabular Numerals:** All currency amounts, percentages, and metrics must use `font-variant-numeric: tabular-nums` to ensure exact column alignment.
- **Scale:**
  - Display Hero: `2.25rem (36px)` / `bold`
  - H1 Page Title: `1.75rem (28px)` / `semi-bold`
  - H2 Section Title: `1.25rem (20px)` / `semi-bold`
  - Body: `0.9375rem (15px)` / `regular`
  - Small / Caption: `0.8125rem (13px)` / `medium`

---

## 📐 Layout & Breakpoints

- **Mobile:** `< 768px` — Bottom tab bar, sticky top bar, 1-column cards.
- **Tablet:** `768px – 1023px` — Collapsed or slim sidebar, 2-column grids.
- **Desktop:** `≥ 1024px` — Grouped persistent sidebar, multi-column dashboard and council grids.
- **Wide Desktop:** `≥ 1440px` — Max-width containers (`1280px` / `1440px`), generous breathing room.

---

## 🧩 Shared Component Library

1. **`Button`**: Variants (`primary`, `secondary`, `ghost`, `danger`), Sizes (`sm`, `md`, `lg`), `loading` spinner state, accessible touch target.
2. **`StatCard` / `KPICard`**: Label, formatted tabular value, delta badge, optional icon and sparkline.
3. **`Badge` / `StatusPill`**: Variants (`success`, `warning`, `danger`, `neutral`, `brand`).
4. **`Tabs` / `SegmentedControl`**: Pill-style accessible segmented control.
5. **`Modal` & `Sheet`**: Desktop modal dialog, mobile bottom sheet, accessible focus trap and `Esc` key handler.
6. **`ConfirmDialog`**: In-app replacement for `window.confirm()`.
7. **`Toast`**: Context-driven non-intrusive notification toasts with auto-dismiss.
8. **`MoneyInput`**: Form input with integrated currency symbol prefix and mobile numeric keyboard (`inputMode="decimal"`).
9. **`EmptyState`**: Curated illustrations/icons, clear friendly title, explanatory sentence, and call-to-action button.
10. **`Skeleton`**: Subtle animated shimmer loader for async data loading.
