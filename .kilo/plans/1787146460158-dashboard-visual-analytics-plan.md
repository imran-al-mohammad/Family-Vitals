# Dashboard Visual Analytics Plan

## Goal
Upgrade the Family Vitals Dashboard from mostly summary cards/text into a clearer visual analytics view for Blood Pressure, Pulse, Blood Sugar, and medicine alerts — while preserving the calm dark nocturnal design.

## Acceptance Criteria
- Dashboard shows visual trend lines for BP, pulse, and blood sugar
- User can switch between 7 / 30 / 90 day views
- Latest summary cards remain visible and clear
- Charts work with real Supabase data
- Empty/no-data states are handled
- Mobile layout remains usable
- Dark theme and overall product feel are preserved

---

## Design Context (from design.md)
- Calm, dark, high-contrast health interface
- White for primary text/key metrics/metadata
- Forest-black backgrounds
- Muted white for secondary labels/timestamps
- Soft success/warning/danger tints only for reading status
- Metric values large, sparse, instantly scannable
- Mobile-first PWA layout
- No loud multi-color medical dashboards
- Status chips: minimal, muted, text-forward

---

## Affected Files
1. `css/style.css` — add chart container styles, range control styles, sparkline styles
2. `js/features/dashboard/dashboard.js` — main dashboard rendering, chart integration, range controls
3. `js/shared/insights.js` — add trend data fetching with range support (optional; reuse existing functions)
4. `js/shared/format.js` — may add helper functions for chart data shaping

---

## Implementation Overview

### 1. Chart Approach (lightweight, no external libraries)
- Use simple SVG sparklines — a single `<path>` element per chart drawing a line through data points
- Color system uses existing design tokens: success (#A7F3D0), warning (#FDE68A), danger (#FECACA) as subtle line tints
- Chart containers have semi-transparent dark backgrounds to match the theme
- Mobile-respecting dimensions (height ~80px on mobile, ~120px on desktop)
- Hover value display showing the nearest data point value and date

### 2. Data Flow
- Existing `fetchReadingsForUsers()` gets all readings ordered by `created_at DESC`
- New helper: `readingsInRange(readings, startMs, endMs)` — filters readings by date window (reuses existing `filterSince` pattern from insights.js)
- Trend data shaped per type:
  - **BP**: systolic and diastolic arrays over time; plot diastolic as secondary line or combine into composite
  - **Pulse**: bpm values over time
  - **Blood Sugar**: mg/dL values over time
- Range toggle filters the window: last 7/30/90 days from `Date.now()`

### 3. UI Components

#### Range Control
- Three toggle buttons: 7d / 30d / 90d
- Styled as subtle outline buttons matching the dark theme
- Active button has filled background using existing color tokens
- On click, re-fetches/trend data and re-renders charts

#### Trend Chart Container
```
<div class="chart-container">
  <div class="chart-range">
    <button class="range-btn active" data-range="7">7d</button>
    <button class="range-btn" data-range="30">30d</button>
    <button class="range-btn" data-range="90">90d</button>
  </div>
  <svg class="sparkline" viewBox="0 0 100 80">
    <!-- path drawn by renderSparkline() -->
  </svg>
  <div class="chart-tooltip hidden">Value · Date</div>
</div>
```

#### Summary Metric Cards (kept/refined)
- Latest BP / Pulse / Blood Sugar cards remain at top
- Each shows latest value with status chip
- Below the value, a small sparkline spark representing trend (compact, inline)

#### Trend Direction Markers
- Small arrow chip above/near each chart: ↑ Rising, ↓ Falling, → Steady
- Uses existing status chip styles (success/warning/danger adapted)
- Computed from existing `trendForType()` or new range-aware version

#### Family Snapshot (compact visual section)
- Below the trend charts, a compact section showing latest reading status per family member
- Small value + status chip per person
- Attention markers for out-of-stock or abnormal readings
- Does not overload — 1-2 line height

---

## Data Functions to Add/Modify

### In `js/shared/insights.js`
- `readingsInRange(readings, startMs, endMs)` — filter readings by date window (thin wrapper around existing `filterSince` pattern)
- `trendForTypeRange(readings, type, startMs, endMs)` — compute trend for a specific range (instead of fixed 7-day windows)
- Keep existing `averageForType`, `trendForType` for backward compatibility

### In `js/features/dashboard/dashboard.js`
- State: `selectedRange` (starts at '30' for 30 days, or '7' per UX preference)
- `renderRangeControls()` — generates the 7/30/90 toggle buttons
- `renderSparklineSVG(type, readings, range)` — draws SVG path for the sparkline
- `renderChartTooltip(e, type, readings)` — shows nearest value on hover
- Update `renderDashboard()` to insert chart containers alongside existing metric grid
- Keep existing metric cards rendering but add inline mini-sparkline below each

### In `css/style.css`
- `.chart-container` — relative position, max-width 100%, margin around
- `.range-btn` — outline button style, active state with var(--color-success) tint
- `.sparkline` — SVG styling, line color using var(--color-primary) with low opacity, path transition
- `.chart-tooltip` — absolute position, white text, black bg semi-transparent, hidden by default
- Responsive: chart height 80px max-width 100%, grid adjusts on mobile

---

## Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Charts become too clinical/noisy | Keep sparklines minimal: 1 line, 1 color, no grid labels, tiny tooltip only |
| Mobile charts unreadable | Set max-height, ensure touch-friendly range buttons, hide tooltip on tap |
| Performance with many data points | Cap readings at ~20-30 points per chart; use simple linear interpolation for path |
| Dark theme clash | All colors derive from existing design tokens; test against the :root variables |
| Range toggle breaks existing data flow | Range control only filters existing readings array; no new DB queries needed beyond what's already fetched |

---

## Validation Steps
- Dashboard loads with trend charts rendering real Supabase data
- Range toggle switches between 7/30/90 day views correctly
- Latest summary cards remain visible and uncluttered
- Empty state shows "No readings yet" when no history exists
- Mobile viewport: charts resize, range buttons stack vertically
- Dark theme: no unintended bright colors, contrast meets minimums
- Trend direction markers show correct state (↑/↓/→) based on data trend

---

## Open Questions (to resolve before implementation)
1. **Chart data granularity**: Should we show all available readings or cap at a max number for performance? *Recommended: cap at ~30 points, showing denser on 90d and sparser on 7d*
2. **BP: systolic vs diastolic**: Two lines or one composite? *Recommended: two thin lines (different opacity) in same chart, or show systolic primary with diastolic as subtle overlay*
3. **Family snapshot detail level**: Show all family members or just the signed-in user? *Recommended: show signed-in user's trend, family snapshot with mini-chips per member*
4. **Tooltip behavior**: hover on desktop, tap on mobile? *Recommended: hover on desktop, tap reveals tooltip on mobile*

---