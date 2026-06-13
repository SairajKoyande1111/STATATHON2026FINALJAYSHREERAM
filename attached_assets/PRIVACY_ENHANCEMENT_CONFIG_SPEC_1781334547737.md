# Privacy Enhancement Module
## Configuration, Metrics & Auto-Assist Specification
### Complete Guide for Replit Integration — Statathon 2025 | AIRAVATA Technologies

> **For Replit Agent:** This document has TWO parts.
> - **Part A** — Exact UI inputs (what to show/hide per technique), sidebar metrics, and column requirements
> - **Part B** — Auto-Assist engine that pre-fills parameters when the user selects a technique

---

---

# PART A — TECHNIQUE CONFIGURATION & METRICS

## A0 — MASTER COLUMN REQUIREMENT TABLE

This is the single source of truth. Use this to decide what to render in the UI for each technique.

```
LEGEND
  QI   = Quasi-Identifier checkboxes (left panel)
  SA   = Sensitive Attribute dropdown (left panel)
  TC   = Target Columns checklist (left panel)
  GC   = Group Column dropdown (only for Data Shuffling within-group)
  RC   = Row/Col Variable dropdowns (only for Cell Suppression)
  ✅   = Required — show and enforce
  ⭕   = Optional — show but not mandatory
  ❌   = Not used — HIDE completely (do not render)
```

| # | Technique | QI Checkboxes | SA Dropdown | Target Columns | Group Col | Row/Col Var |
|---|-----------|:---:|:---:|:---:|:---:|:---:|
| 1 | K-Anonymity | ✅ | ❌ | ❌ | ❌ | ❌ |
| 2 | L-Diversity | ✅ | ✅ | ❌ | ❌ | ❌ |
| 3 | T-Closeness | ✅ | ✅ | ❌ | ❌ | ❌ |
| 4 | Rank Swapping | ❌ | ❌ | ✅ (numeric) | ❌ | ❌ |
| 5 | Microaggregation | ❌ | ❌ | ✅ (numeric) | ❌ | ❌ |
| 6 | PRAM | ❌ | ❌ | ✅ (categorical) | ❌ | ❌ |
| 7 | Top/Bottom Coding | ❌ | ❌ | ✅ (numeric) | ❌ | ❌ |
| 8 | Noise Addition | ❌ | ❌ | ✅ (numeric) | ❌ | ❌ |
| 9 | Explicit Suppression | ⭕ (uniqueness only) | ⭕ (sensitive-val only) | ⭕ (outlier/threshold) | ❌ | ❌ |
| 10 | Generalisation | ❌ | ❌ | ✅ (any, per-col) | ❌ | ❌ |
| 11 | Data Shuffling | ❌ | ❌ | ✅ (any) | ⭕ (within-group) | ❌ |
| 12 | Cell Suppression | ❌ | ❌ | ❌ | ❌ | ✅ |

### Rendering Rule for Left Panel

```javascript
function renderLeftPanel(technique) {
  const config = TECHNIQUE_CONFIG[technique]

  // QI section
  if (config.show_qi) {
    render_qi_checkboxes()          // show all non-ID columns as checkboxes
  } else {
    hide('#qi-section')             // completely remove from DOM
  }

  // SA section
  if (config.show_sa) {
    render_sa_dropdown()            // show dropdown of categorical + low-cardinality numeric
  } else {
    hide('#sa-section')
  }

  // Target Columns section
  if (config.show_target_cols) {
    render_target_cols(config.target_col_filter)
    // target_col_filter: 'numeric' | 'categorical' | 'any' | 'per_col_config'
  } else {
    hide('#target-cols-section')
  }

  // Technique-specific extras
  if (config.show_group_col)   render_group_col_dropdown()
  if (config.show_row_col_var) render_row_col_var_dropdowns()
}

const TECHNIQUE_CONFIG = {
  'k_anonymity'          : { show_qi: true,  show_sa: false, show_target_cols: false },
  'l_diversity'          : { show_qi: true,  show_sa: true,  show_target_cols: false },
  't_closeness'          : { show_qi: true,  show_sa: true,  show_target_cols: false },
  'rank_swapping'        : { show_qi: false, show_sa: false, show_target_cols: true,  target_col_filter: 'numeric' },
  'microaggregation'     : { show_qi: false, show_sa: false, show_target_cols: true,  target_col_filter: 'numeric' },
  'pram'                 : { show_qi: false, show_sa: false, show_target_cols: true,  target_col_filter: 'categorical' },
  'top_bottom_coding'    : { show_qi: false, show_sa: false, show_target_cols: true,  target_col_filter: 'numeric' },
  'noise_addition'       : { show_qi: false, show_sa: false, show_target_cols: true,  target_col_filter: 'numeric' },
  'explicit_suppression' : { show_qi: 'conditional', show_sa: 'conditional', show_target_cols: 'conditional' },
  'generalisation'       : { show_qi: false, show_sa: false, show_target_cols: true,  target_col_filter: 'per_col_config' },
  'data_shuffling'       : { show_qi: false, show_sa: false, show_target_cols: true,  target_col_filter: 'any', show_group_col: 'conditional' },
  'cell_suppression'     : { show_qi: false, show_sa: false, show_target_cols: false, show_row_col_var: true },
}
```

---

## A1 — TECHNIQUE 1: K-ANONYMITY

### Left Panel — What to Show

```
✅ QUASI-IDENTIFIERS (QI)         ← show checkboxes for all non-ID columns
   [checkbox] Round_Centre_Code
   [checkbox] FSU_Serial_No
   [checkbox] Round
   [checkbox] Sch_No
   ...

❌ SENSITIVE ATTRIBUTE             ← HIDE completely
❌ TARGET COLUMNS                  ← HIDE completely
```

**Validation before Apply:**
- At least 1 QI must be checked → else show: `"Select at least one quasi-identifier"`

### Right Panel — Parameters

| Parameter | Control | Default | Range |
|-----------|---------|---------|-------|
| K Value | Slider (integer) | 5 | 2 – 25 |
| Suppression Limit | Slider (%) | 5% | 0% – 30% |
| Generalisation Method | Radio | Midpoint | Midpoint / Range |

### Sidebar Metrics (shown after Apply)

```
┌─────────────────────────────────────────────────┐
│  K-ANONYMITY RESULTS                            │
├─────────────────────────────────────────────────┤
│  ✅ / ❌  k-Anonymity Satisfied                 │
│  Min Equivalence Class Size    [value] (≥ k?)   │
│  Avg Equivalence Class Size    [value]          │
│  Number of Equivalence Classes [value]          │
│  Records Suppressed            [count] ([%])    │
│  Records Retained              [count]          │
├─────────────────────────────────────────────────┤
│  📊 INFORMATION LOSS                            │
│  GIL Score   [0.00 – 1.00]   ████░░  [value]   │
│  (0 = no loss, 1 = total loss)                  │
├─────────────────────────────────────────────────┤
│  📈 EC SIZE DISTRIBUTION                        │
│  [mini histogram: x=class size, y=count]        │
└─────────────────────────────────────────────────┘
```

**GIL colour coding:**
- 0.00 – 0.20 → 🟢 Low loss
- 0.21 – 0.50 → 🟡 Medium loss
- 0.51 – 1.00 → 🔴 High loss

---

## A2 — TECHNIQUE 2: L-DIVERSITY

### Left Panel — What to Show

```
✅ QUASI-IDENTIFIERS (QI)         ← same as K-Anonymity
✅ SENSITIVE ATTRIBUTE             ← dropdown, single select
   [ Select one column... ▼ ]
   Options: categorical + low-cardinality numeric cols only

❌ TARGET COLUMNS                  ← HIDE
```

**Validation before Apply:**
- At least 1 QI checked → required
- SA selected → required
- SA column must have ≥ L unique values globally → warn if not

### Right Panel — Parameters

| Parameter | Control | Default | Range |
|-----------|---------|---------|-------|
| L Value | Slider (integer) | 3 | 2 – 10 |
| Variant | Radio | Entropy | Entropy / Distinct / Recursive |
| c (recursive only — show if Recursive selected) | Slider (float) | 0.5 | 0.1 – 0.9 |
| Underlying K | Slider (integer) | 3 | 2 – 20 |

### Sidebar Metrics

```
┌─────────────────────────────────────────────────┐
│  L-DIVERSITY RESULTS                            │
├─────────────────────────────────────────────────┤
│  ✅ / ❌  L-Diversity Satisfied                 │
│  Variant Used            [Entropy/Distinct/Rec] │
│  Classes Passing         [count] / [total]      │
│  Classes Failing         [count]                │
│  Records Suppressed      [count] ([%])          │
├─────────────────────────────────────────────────┤
│  📊 ENTROPY STATS (Entropy variant)             │
│  Min Class Entropy   [value]                    │
│  Threshold log(l)    [value]  ← must be ≤ min  │
│  Avg Class Entropy   [value]                    │
│  Max Class Entropy   [value]                    │
├─────────────────────────────────────────────────┤
│  🔢 SA DISTRIBUTION                             │
│  [mini bar chart: SA values vs frequency]       │
│  [per-class entropy heatmap — small table]      │
└─────────────────────────────────────────────────┘
```

**Extra metric unique to L-Diversity:**
- `Min Class Entropy` vs `log(l)` threshold — this is the key pass/fail indicator
- Show a per-class table: `class_id | size | entropy | pass/fail`

---

## A3 — TECHNIQUE 3: T-CLOSENESS

### Left Panel — What to Show

```
✅ QUASI-IDENTIFIERS (QI)
✅ SENSITIVE ATTRIBUTE             ← same as L-Diversity

❌ TARGET COLUMNS                  ← HIDE
```

### Right Panel — Parameters

| Parameter | Control | Default | Range |
|-----------|---------|---------|-------|
| T Threshold | Slider (float, 2dp) | 0.30 | 0.05 – 1.00 |
| Distance Metric | Dropdown | EMD | EMD / TVD |
| Underlying K | Slider (integer) | 3 | 2 – 20 |

**UI tip below T slider:** `"Lower = stricter. 0.20 = standard. 0.50 = lenient."`

### Sidebar Metrics

```
┌─────────────────────────────────────────────────┐
│  T-CLOSENESS RESULTS                            │
├─────────────────────────────────────────────────┤
│  ✅ / ❌  T-Closeness Satisfied                 │
│  Distance Metric         [EMD / TVD]            │
│  Classes Passing (≤ t)   [count] / [total]      │
│  Classes Failing (> t)   [count]                │
│  Records Suppressed      [count] ([%])          │
├─────────────────────────────────────────────────┤
│  📏 EMD STATISTICS                              │
│  Min EMD  [value]   ← best class               │
│  Max EMD  [value]   ← worst class (must be ≤ t)│
│  Avg EMD  [value]                               │
│  T Threshold          [configured t]            │
├─────────────────────────────────────────────────┤
│  📊 DISTRIBUTION COMPARISON                     │
│  [Global SA dist vs Worst-class SA dist]        │
│  [side-by-side mini bar chart]                  │
└─────────────────────────────────────────────────┘
```

**Extra metric unique to T-Closeness:**
- `Max EMD` vs `T threshold` — the single most important number
- Per-class EMD mini table: `class_id | size | EMD | ✅/❌`

---

## A4 — TECHNIQUE 4: RANK SWAPPING

### Left Panel — What to Show

```
❌ QUASI-IDENTIFIERS              ← HIDE
❌ SENSITIVE ATTRIBUTE            ← HIDE
✅ TARGET COLUMNS (numeric only)
   [checkbox] HH_Size
   [checkbox] NIC_2008
   [checkbox] NCO_2004
   ... (only dtype = int/float, nunique > 10)
```

**Note in UI:** `"Select numeric columns to apply rank swapping. All = none selected (applies to all numeric)."`

### Right Panel — Parameters

| Parameter | Control | Default | Range |
|-----------|---------|---------|-------|
| Swap Fraction | Slider (%) | 10% | 1% – 50% |
| Random Seed | Number input | 42 | 0 – 9999 |

**Derived value to display (not editable):**
```
Max rank distance p = round(swap_fraction × N) = [computed value] records
```

### Sidebar Metrics

```
┌─────────────────────────────────────────────────┐
│  RANK SWAPPING RESULTS                          │
├─────────────────────────────────────────────────┤
│  Swap Fraction   [%]    Max p = [p] records     │
├─────────────────────────────────────────────────┤
│  Per-column table:                              │
│  Column | Swap Rate | Spearman ρ | MAE          │
│  [col]  | [xx%]     | [0.xx]    | [value]       │
├─────────────────────────────────────────────────┤
│  📊 MARGINAL PRESERVATION                       │
│  Distribution unchanged: ✅ YES (all cols)      │
│  (sorted values identical to original)          │
├─────────────────────────────────────────────────┤
│  📈 UTILITY SCORE                               │
│  Avg Spearman ρ    [0.xx]   ████░  [label]      │
│  (> 0.90 = high utility, < 0.80 = high loss)    │
└─────────────────────────────────────────────────┘
```

**Extra metric unique to Rank Swapping:**
- `Marginal Preservation` — verify sorted(original) == sorted(result) per column. Always TRUE if implemented correctly. Show as a confirmation tick.
- `Spearman ρ` per column — this replaces Pearson because rank swapping specifically distorts rank order

---

## A5 — TECHNIQUE 5: MICROAGGREGATION (MDAV)

### Left Panel — What to Show

```
❌ QUASI-IDENTIFIERS              ← HIDE
❌ SENSITIVE ATTRIBUTE            ← HIDE
✅ TARGET COLUMNS (numeric only)
```

### Right Panel — Parameters

| Parameter | Control | Default | Range |
|-----------|---------|---------|-------|
| Cluster Size (k) | Slider (integer) | 5 | 2 – 20 |
| Distance Metric | Dropdown | Euclidean | Euclidean / Manhattan |

### Sidebar Metrics

```
┌─────────────────────────────────────────────────┐
│  MICROAGGREGATION RESULTS                       │
├─────────────────────────────────────────────────┤
│  Number of Clusters  [count]                    │
│  Min Cluster Size    [value] (must be ≥ k)      │
│  Avg Cluster Size    [value]                    │
├─────────────────────────────────────────────────┤
│  📊 INFORMATION LOSS                            │
│  SSE / SST (IL)   [0.00–1.00]   ████░  [label] │
│  (< 0.20 = low, 0.20–0.50 = medium, > 0.50 = high) │
├─────────────────────────────────────────────────┤
│  Per-column table:                              │
│  Column | Pearson r | Mean Abs Dev | Var Ratio  │
│  [col]  | [0.xx]   | [value]      | [0.xx]     │
├─────────────────────────────────────────────────┤
│  📈 CLUSTER SIZE DISTRIBUTION                   │
│  [mini histogram of cluster sizes]              │
└─────────────────────────────────────────────────┘
```

**Extra metric unique to Microaggregation:**
- `SSE/SST` — the canonical information loss metric for microaggregation
- `Variance Ratio` per column: `var(result) / var(original)` — should stay close to 1

---

## A6 — TECHNIQUE 6: PRAM

### Left Panel — What to Show

```
❌ QUASI-IDENTIFIERS              ← HIDE
❌ SENSITIVE ATTRIBUTE            ← HIDE
✅ TARGET COLUMNS (categorical only)
   [checkbox] State
   [checkbox] Religion
   [checkbox] Occupation
   ... (only dtype = object/category or nunique ≤ 15)
```

**Note:** Auto-detect categorical columns. Show count of categories per column: `"State (6 categories)"`

### Right Panel — Parameters

| Parameter | Control | Default | Range |
|-----------|---------|---------|-------|
| Retention Probability | Slider (float, 2dp) | 0.70 | 0.10 – 1.00 |
| PRAM Variant | Radio | Simple | Simple / Unbiased |
| Random Seed | Number input | 42 | 0 – 9999 |

**Live display below slider:**
```
P(keep original) = 0.70   P(perturb to other) = 0.30
```

### Sidebar Metrics

```
┌─────────────────────────────────────────────────┐
│  PRAM RESULTS                                   │
├─────────────────────────────────────────────────┤
│  Per-column table:                              │
│  Column | Categories | Retention | Perturb | TVD│
│  [col]  | [|S|]      | [xx%]     | [xx%]   |[v]│
├─────────────────────────────────────────────────┤
│  📊 DISTRIBUTION SHIFT                          │
│  Avg TVD across columns   [0.00 – 1.00]        │
│  (< 0.05 = minimal shift, > 0.20 = high shift) │
│  Chi-Square Test (overall) p = [value]          │
│  [p > 0.05 = distributions similar ✅]          │
├─────────────────────────────────────────────────┤
│  🔢 TRANSITION MATRIX (first selected col)      │
│  [small matrix display showing M[i,j] values]   │
└─────────────────────────────────────────────────┘
```

**Extra metrics unique to PRAM:**
- `TVD` (Total Variation Distance) per column — measures how much the distribution changed
- `Chi-Square p-value` — statistical test whether pre/post distributions differ significantly
- `Transition Matrix` display for the first column — shows the actual M matrix so users understand the perturbation

---

## A7 — TECHNIQUE 7: TOP/BOTTOM CODING

### Left Panel — What to Show

```
❌ QUASI-IDENTIFIERS              ← HIDE
❌ SENSITIVE ATTRIBUTE            ← HIDE
✅ TARGET COLUMNS (numeric only)
```

### Right Panel — Parameters

| Parameter | Control | Default | Range |
|-----------|---------|---------|-------|
| Top Percentile Cap | Slider (integer) | 95 | 51 – 100 |
| Bottom Percentile Cap | Slider (integer) | 5 | 0 – 49 |
| Add Gaussian Noise | Toggle | OFF | ON / OFF |
| Noise Lambda (λ) | Slider — shown only if noise ON | 0.10 | 0.01 – 0.50 |

**Validation:** `bottom_pct < top_pct` — show error if violated.

### Sidebar Metrics

```
┌─────────────────────────────────────────────────┐
│  TOP/BOTTOM CODING RESULTS                      │
├─────────────────────────────────────────────────┤
│  Per-column table:                              │
│  Column | q_bot | q_top | Bot Cap% | Top Cap%  │
│  [col]  | [v]   | [v]   | [xx%]    | [xx%]    │
├─────────────────────────────────────────────────┤
│  📊 MEAN & STD SHIFT                            │
│  Column | Mean Shift | Std Shift                │
│  [col]  | [±x%]      | [±x%]                   │
├─────────────────────────────────────────────────┤
│  📈 OUTLIER REMOVAL SUMMARY                     │
│  Total records affected    [count] ([%])        │
│  Max capping rate col      [col]: [xx%]         │
│  [mini box-plot: before vs after per column]    │
│                                                 │
│  Gaussian Noise Applied: [YES σ=x / NO]         │
└─────────────────────────────────────────────────┘
```

**Extra metrics unique to Top/Bottom Coding:**
- `q_bot` and `q_top` actual values per column — so user can see exactly what threshold was applied
- `Skewness change`: `skew(original)` → `skew(result)` — top/bottom coding intentionally reduces skew

---

## A8 — TECHNIQUE 8: NOISE ADDITION

### Left Panel — What to Show

```
❌ QUASI-IDENTIFIERS              ← HIDE
❌ SENSITIVE ATTRIBUTE            ← HIDE
✅ TARGET COLUMNS (numeric only)
```

### Right Panel — Parameters

| Parameter | Control | Default | Range |
|-----------|---------|---------|-------|
| Noise Distribution | Radio | Gaussian | Gaussian / Laplace / Uniform |
| Noise Multiplier (λ) | Slider (float, 2dp) | 0.10 | 0.01 – 1.00 |
| Clip to Original Range | Toggle | ON | ON / OFF |
| Random Seed | Number input | 42 | 0 – 9999 |

**Live display below λ slider (computed per first selected column):**
```
σ_noise = [lambda] × std([col]) = [computed value]
SNR = [1/λ²] (higher = better utility)
Estimated MAE ≈ [0.798 × σ_noise] for Gaussian
```

### Sidebar Metrics

```
┌─────────────────────────────────────────────────┐
│  NOISE ADDITION RESULTS                         │
├─────────────────────────────────────────────────┤
│  Distribution      [Gaussian / Laplace / Uniform│
│  Lambda (λ)        [value]                      │
├─────────────────────────────────────────────────┤
│  Per-column table:                              │
│  Column | σ_noise | SNR    | MAE    | Pearson r │
│  [col]  | [value] | [x.xx] | [val]  | [0.xx]   │
├─────────────────────────────────────────────────┤
│  📊 SIGNAL-TO-NOISE RATIO                       │
│  Avg SNR   [value]    ████░  [label]            │
│  (> 25 = low noise, 4–25 = medium, < 4 = high) │
├─────────────────────────────────────────────────┤
│  📈 MEAN PRESERVATION                           │
│  Column | Mean Before | Mean After | Shift %    │
│  [col]  | [value]     | [value]    | [±x%]      │
│  (Gaussian noise preserves mean in expectation) │
├─────────────────────────────────────────────────┤
│  Clipped records (if clip=ON):                  │
│  Column | Clipped Count | Rate                  │
│  [col]  | [count]       | [xx%]                 │
└─────────────────────────────────────────────────┘
```

**Extra metrics unique to Noise Addition:**
- `SNR` — the primary quality metric, unique to noise-based methods
- `Variance Inflation`: `(σ²_noisy - σ²_orig) / σ²_orig` — noise always inflates variance
- `KL Divergence` (optional, advanced): measures how different the noisy distribution is from original

---

## A9 — TECHNIQUE 9: EXPLICIT SUPPRESSION

### Left Panel — What to Show (CONDITIONAL on Criterion)

This technique's left panel changes based on the selected suppression criterion:

```
Criterion = "Uniqueness"  → show ✅ QI Checkboxes, ❌ SA, ❌ Target Cols
Criterion = "Outlier"     → show ❌ QI, ❌ SA, ✅ Target Cols (numeric)
Criterion = "Sensitive Value" → show ❌ QI, ✅ SA Dropdown, ❌ Target Cols
Criterion = "Threshold"   → show ❌ QI, ❌ SA, ✅ Target Cols (single select)
```

### Right Panel — Parameters

**Always shown:**

| Parameter | Control | Default | Range |
|-----------|---------|---------|-------|
| Suppression Mode | Radio | Row | Row / Cell / Both |
| Suppression Criterion | Dropdown | Uniqueness | Uniqueness / Outlier / Sensitive Value / Threshold |
| Suppression Budget | Slider (%) | 10% | 1% – 30% |

**Shown conditionally based on Criterion:**

| Criterion | Extra Parameters |
|-----------|-----------------|
| Uniqueness | Min Group Size slider (2, range 1–10) |
| Outlier | Z Threshold slider (3.0, range 1.5–5.0) |
| Sensitive Value | Risk Values tag-input (type value → press Enter to add) |
| Threshold | Lower Bound + Upper Bound number inputs; Column dropdown (single) |
| Cell mode | Min Cell Frequency slider (3, range 1–10) |

### Sidebar Metrics

```
┌─────────────────────────────────────────────────┐
│  EXPLICIT SUPPRESSION RESULTS                   │
├─────────────────────────────────────────────────┤
│  Mode         [Row / Cell / Both]               │
│  Criterion    [Uniqueness / Outlier / ...]       │
│  Budget Used  [used] / [max] ([utilisation%])   │
├─────────────────────────────────────────────────┤
│  Records Suppressed   [count] ([rate%])         │
│  Records Retained     [count]                   │
│  Budget Exceeded?     [YES — capped / NO]        │
├─────────────────────────────────────────────────┤
│  [If Cell mode:]                                │
│  Cells Suppressed    [count]                    │
│  Cell Rate           [xx%]                      │
│  Columns Affected    [list]                     │
├─────────────────────────────────────────────────┤
│  📊 CRITERION ANALYSIS                          │
│  [If Uniqueness:]                               │
│   QI-unique records before  [count]             │
│   QI-unique records after   [count] → 0 ideal  │
│  [If Outlier:]                                  │
│   Per-col outlier count (z>[threshold])         │
│  [If Sensitive Value:]                          │
│   Per-risk-value record count                   │
│  [If Threshold:]                                │
│   Records outside bounds   [count]              │
└─────────────────────────────────────────────────┘
```

---

## A10 — TECHNIQUE 10: GENERALISATION

### Left Panel — What to Show

```
❌ QUASI-IDENTIFIERS              ← HIDE
❌ SENSITIVE ATTRIBUTE            ← HIDE
✅ TARGET COLUMNS (multi-row config, not checkbox)
   Each selected column gets its own config row:
   [Column dropdown] [Type dropdown] [Type-specific params]
   + [Add column] button
```

### Right Panel — Parameters

This technique's right panel IS the column configuration (it's a multi-row builder):

```
┌────────────────────────────────────────────────────────────────────┐
│  GENERALISATION CONFIGURATION                                      │
├────────────────────────────────────────────────────────────────────┤
│  Column         │ Type    │ Parameters                            │
│  ─────────────────────────────────────────────────────────────── │
│  [Age ▼]        │ [Bin ▼] │ Bin Width: [5] (auto: 8)             │
│  [Income ▼]     │ [Round▼]│ Round To:  [1000]                    │
│  [Survey_Date▼] │ [Date▼] │ Level: [Year ▼]                      │
│  [District ▼]   │ [Top-K▼]│ Top K: [10]                          │
│                                                                    │
│  [+ Add Column]                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Sidebar Metrics

```
┌─────────────────────────────────────────────────┐
│  GENERALISATION RESULTS                         │
├─────────────────────────────────────────────────┤
│  Per-column table:                              │
│  Col | Type | IL Score | Uniq↓ | Changed       │
│  [c] | [t]  | [0.xx]   | n→m   | [count (%)]   │
├─────────────────────────────────────────────────┤
│  📊 INFORMATION LOSS PER COLUMN                 │
│  [horizontal bar chart: col vs IL score]        │
│  [colour: green < 0.30, yellow 0.30–0.60, red]  │
├─────────────────────────────────────────────────┤
│  "Other" Rate (Top-K cols only):                │
│  Col | "Other" count | Rate                     │
│  [c] | [count]       | [xx%]                    │
├─────────────────────────────────────────────────┤
│  📈 SAMPLE VALUE MAPPINGS                       │
│  [5 example: original → generalised per col]    │
└─────────────────────────────────────────────────┘
```

**Extra metric unique to Generalisation:**
- `Unique Value Reduction Ratio`: `(unique_before - unique_after) / unique_before` — the clearest measure of how much information was collapsed
- `"Other" Rate` for Top-K generalisation — if too high (> 30%), warn user

---

## A11 — TECHNIQUE 11: DATA SHUFFLING

### Left Panel — What to Show

```
❌ QUASI-IDENTIFIERS              ← HIDE
❌ SENSITIVE ATTRIBUTE            ← HIDE
✅ TARGET COLUMNS (any type)
   [checkbox] Invoice_No
   [checkbox] Order_Placed
   [checkbox] Delivery_Date
   [checkbox] Customer
   ... (all columns available)

[Conditionally — if variant = Within-Group:]
✅ GROUP COLUMN (dropdown, single select)
   [Select grouping column ▼]
   (categorical columns only)
```

### Right Panel — Parameters

| Parameter | Control | Default | Range |
|-----------|---------|---------|-------|
| Shuffle Variant | Radio | Full | Full Shuffle / Within-Group / Rank-Preserving |
| Group Column | Dropdown — shown if Within-Group | — | Categorical cols |
| Rank Delta (δ) | Slider — shown if Rank-Preserving | 0.10 | 0.01 – 0.50 |
| Random Seed | Number input | 42 | 0 – 9999 |

**Privacy guarantee text (always shown):**
```
"All marginal distributions are exactly preserved.
 QI ↔ SA linkage is broken. Select target columns on the left."
```

### Sidebar Metrics

```
┌─────────────────────────────────────────────────┐
│  DATA SHUFFLING RESULTS                         │
├─────────────────────────────────────────────────┤
│  Variant       [Full / Within-Group / Rank]     │
├─────────────────────────────────────────────────┤
│  Per-column table:                              │
│  Column | Changed | Distribution OK | Pearson r │
│  [col]  | [xx%]   | ✅ YES          | [0.xx]    │
├─────────────────────────────────────────────────┤
│  📊 QI–SA CORRELATION (key metric)             │
│  [Heatmap: rows = QI cols, cols = shuffled cols]│
│  Before shuffle | After shuffle                 │
│  [values → should approach 0 after]             │
├─────────────────────────────────────────────────┤
│  📈 LINKAGE RISK                                │
│  Before: corr² ≈ [value]  → adversary P        │
│  After:  1/N   = [1/N]    → random chance only  │
│                                                 │
│  [If Rank-Preserving:]                          │
│  Mean Rank Displacement  [value] (≤ δ×N = [v]) │
└─────────────────────────────────────────────────┘
```

**Extra metrics unique to Data Shuffling:**
- `QI–SA Correlation Heatmap` (before vs after) — this is THE core metric. After full shuffle, all values should be near 0
- `Linkage Risk` expressed as adversary probability — makes privacy gain concrete for the user
- `Distribution Preserved` — always TRUE for any permutation. Show as a confirmation badge

---

## A12 — TECHNIQUE 12: CELL SUPPRESSION

### Left Panel — What to Show

```
❌ QUASI-IDENTIFIERS              ← HIDE
❌ SENSITIVE ATTRIBUTE            ← HIDE
❌ TARGET COLUMNS                 ← HIDE

Instead show:
✅ TABLE BUILDER
   Input Mode:     [Build from data ◉] [Upload table CSV ○]

   [If Build from data:]
   Row Variable:   [Select column ▼]   (categorical)
   Column Variable:[Select column ▼]   (categorical, ≠ row)
   Value Variable: [Select column ▼]   (numeric)
   Aggregation:    [Count ◉] [Sum ○] [Mean ○]
```

### Right Panel — Parameters

| Parameter | Control | Default | Range |
|-----------|---------|---------|-------|
| Min Frequency (n) | Slider (integer) | 3 | 1 – 10 |
| Dominance Threshold (p%) | Slider (integer) | 70 | 50 – 95 |
| Dominance k | Number input | 1 | 1 – 3 |
| Apply Secondary Suppression | Toggle | ON | ON / OFF |
| Protection Level | Slider (%) | 10% | 5% – 30% |

### Sidebar Metrics

```
┌─────────────────────────────────────────────────┐
│  CELL SUPPRESSION RESULTS                       │
├─────────────────────────────────────────────────┤
│  Table Size         [R rows × C cols]           │
│  Total Data Cells   [R × C]                     │
├─────────────────────────────────────────────────┤
│  PRIMARY SUPPRESSION                            │
│  n-rule triggered      [count] cells            │
│  Dominance triggered   [count] cells            │
│  Total Primary         [count] cells            │
├─────────────────────────────────────────────────┤
│  SECONDARY SUPPRESSION                          │
│  Secondary added       [count] cells            │
├─────────────────────────────────────────────────┤
│  TOTAL SUPPRESSED      [count] / [R×C] = [IL%]  │
│  Back-Calculation Safe: ✅ ALL SAFE / ⚠️ UNSAFE  │
├─────────────────────────────────────────────────┤
│  📊 SUPPRESSED TABLE PREVIEW                    │
│  [Render full table with * in suppressed cells] │
│  [Primary = *, Secondary = **]                  │
│  [Marginal totals always shown]                 │
├─────────────────────────────────────────────────┤
│  📈 CELL FREQUENCY HEATMAP                      │
│  [Heatmap: cells below n_min highlighted red]   │
└─────────────────────────────────────────────────┘
```

**Extra metrics unique to Cell Suppression:**
- `Back-Calculation Safe` — critical boolean. If FALSE, show red warning and refuse to export
- `Suppressed table preview` — render the actual table inline with `*` markers
- `Cell frequency heatmap` — shows which cells were sparse before suppression

---

---

# PART B — AUTO-ASSIST FOR PRIVACY ENHANCEMENT

## Overview

Just like the Risk Assessment module has Auto-Assist for QI/SA column classification and k/l/t parameter suggestion, the Privacy Enhancement module needs Auto-Assist that:

1. **Detects which left-panel inputs are needed** for the selected technique
2. **Pre-fills parameters** with data-driven defaults
3. **Pre-selects columns** (QI, SA, or Target) intelligently
4. **Shows tooltips** explaining why each default was chosen

This runs **every time the user switches technique** — not just on upload.

```
User selects technique
         ↓
Stage 1: Determine required inputs (QI? SA? TC?)
         ↓
Stage 2: Pre-select columns from column profiles (already computed at upload)
         ↓
Stage 3: Compute data-driven parameter defaults
         ↓
Stage 4: Render pre-filled UI with confidence badges + tooltips
```

---

## B1 — STAGE 1: REQUIRED INPUT DETECTION

```python
def get_required_inputs(technique_name):
    """
    Returns which inputs are required for a technique.
    Used to drive left-panel rendering AND auto-fill logic.
    """
    config = {
        'k_anonymity'          : {'qi': True,  'sa': False, 'tc': False, 'tc_type': None},
        'l_diversity'          : {'qi': True,  'sa': True,  'tc': False, 'tc_type': None},
        't_closeness'          : {'qi': True,  'sa': True,  'tc': False, 'tc_type': None},
        'rank_swapping'        : {'qi': False, 'sa': False, 'tc': True,  'tc_type': 'numeric'},
        'microaggregation'     : {'qi': False, 'sa': False, 'tc': True,  'tc_type': 'numeric'},
        'pram'                 : {'qi': False, 'sa': False, 'tc': True,  'tc_type': 'categorical'},
        'top_bottom_coding'    : {'qi': False, 'sa': False, 'tc': True,  'tc_type': 'numeric'},
        'noise_addition'       : {'qi': False, 'sa': False, 'tc': True,  'tc_type': 'numeric'},
        'explicit_suppression' : {'qi': 'cond','sa': 'cond','tc': 'cond','tc_type': 'cond'},
        'generalisation'       : {'qi': False, 'sa': False, 'tc': True,  'tc_type': 'any'},
        'data_shuffling'       : {'qi': False, 'sa': False, 'tc': True,  'tc_type': 'any'},
        'cell_suppression'     : {'qi': False, 'sa': False, 'tc': False, 'tc_type': None,
                                   'row_col_var': True},
    }
    return config[technique_name]
```

---

## B2 — STAGE 2: AUTO-SELECT COLUMNS

Use the column profiles already computed at upload (from AUTO_ASSIST_CLASSIFICATION_SPEC) to pre-select the right columns for each technique.

```python
def auto_select_columns(technique_name, column_profiles, classifications):
    """
    Uses existing column_profiles (from upload-time auto-assist)
    and classifications (DIRECT_ID / QUASI_ID / SENSITIVE / IGNORE)
    to pre-select the right columns for each technique.

    Returns:
        qi_cols      : list of pre-checked QI columns
        sa_col       : pre-selected SA column (or None)
        target_cols  : list of pre-checked target columns
    """
    req = get_required_inputs(technique_name)

    qi_cols     = []
    sa_col      = None
    target_cols = []

    # ── QI COLUMNS ──────────────────────────────────────────────────────
    if req['qi']:
        # Pre-select all classified QUASI_ID columns
        # Exclude DIRECT_IDs (too risky to include)
        qi_cols = [
            col for col, d in classifications.items()
            if d['classification'] == 'QUASI_ID'
        ]
        # Sort by qi_risk_contribution descending (most risky first)
        # so top-risk QIs are checked by default

    # ── SENSITIVE ATTRIBUTE ──────────────────────────────────────────────
    if req['sa']:
        # Pre-select the SENSITIVE column with the highest diversity score
        sensitive_cols = [
            col for col, d in classifications.items()
            if d['classification'] == 'SENSITIVE'
        ]
        if sensitive_cols:
            # Pick the one with highest entropy (most meaningful SA)
            sa_col = max(
                sensitive_cols,
                key=lambda c: column_profiles[c]['entropy']
            )

    # ── TARGET COLUMNS ───────────────────────────────────────────────────
    if req['tc']:
        tc_type = req['tc_type']

        if tc_type == 'numeric':
            target_cols = [
                col for col, p in column_profiles.items()
                if p['is_numeric']
                and p['unique_count'] > 10           # exclude binary/code columns
                and classifications[col]['classification'] != 'DIRECT_ID'
            ]

        elif tc_type == 'categorical':
            target_cols = [
                col for col, p in column_profiles.items()
                if not p['is_numeric']
                and p['unique_count'] >= 2
                and p['unique_count'] <= 50          # exclude near-unique string cols
                and classifications[col]['classification'] != 'DIRECT_ID'
            ]

        elif tc_type == 'any':
            # Shuffle and generalisation can work on any column
            # Pre-select SENSITIVE columns (most important to shuffle/generalise)
            target_cols = [
                col for col, d in classifications.items()
                if d['classification'] == 'SENSITIVE'
            ]
            # Also include QI columns as secondary suggestions
            target_cols += [
                col for col, d in classifications.items()
                if d['classification'] == 'QUASI_ID'
                and col not in target_cols
            ]

    return {
        'qi_cols'     : qi_cols,
        'sa_col'      : sa_col,
        'target_cols' : target_cols,
    }
```

---

## B3 — STAGE 3: PARAMETER AUTO-SUGGESTION

### B3.1 — K-Anonymity Parameters

```python
def suggest_k_anonymity_params(df, qi_cols):
    """
    Suggest K and Suppression Limit from data.
    Reuses logic from AUTO_ASSIST suggest_k().
    """
    if not qi_cols:
        return {'k': 5, 'suppression_limit': 5,
                'reason_k': "Default k=5 (standard). Select QI columns first for a data-driven suggestion.",
                'reason_s': "Default 5% suppression limit."}

    ec_sizes    = df.groupby(qi_cols).size()
    pct_unique  = (ec_sizes == 1).sum() / len(ec_sizes) * 100
    suggested_k = max(2, min(10, int(ec_sizes.quantile(0.10))))

    # Suppression limit: if many singletons, more suppression needed
    if pct_unique > 70:
        supp_limit = 15
        reason_s = f"{pct_unique:.0f}% of QI groups are singletons — higher suppression limit needed."
    elif pct_unique > 30:
        supp_limit = 10
        reason_s = f"{pct_unique:.0f}% singleton groups — moderate suppression limit."
    else:
        supp_limit = 5
        reason_s = "Low singleton rate — 5% suppression limit is sufficient."

    reason_k = (f"Based on QI equivalence class distribution: "
                f"10th percentile EC size = {int(ec_sizes.quantile(0.10))}. "
                f"k={suggested_k} protects 90% of records.")

    return {
        'k'                : suggested_k,
        'suppression_limit': supp_limit,
        'reason_k'         : reason_k,
        'reason_s'         : reason_s,
    }
```

### B3.2 — L-Diversity Parameters

```python
def suggest_l_diversity_params(df, qi_cols, sa_col, suggested_k):
    """
    Suggest L value and variant based on actual SA distribution in ECs.
    """
    if not qi_cols or not sa_col:
        return {'l': 3, 'variant': 'entropy',
                'reason': "Default l=3 (Entropy). Select QI and SA columns for data-driven suggestion."}

    ec_groups  = df.groupby(qi_cols)
    l_per_ec   = ec_groups[sa_col].nunique()
    min_l      = int(l_per_ec.min())
    mean_l     = float(l_per_ec.mean())
    global_uniq = df[sa_col].nunique()

    # Suggest l = floor(k/2), but never more than achievable
    naive_l    = max(2, suggested_k // 2)
    suggested_l = min(naive_l, min_l + 1, global_uniq)
    suggested_l = max(2, suggested_l)

    # Recommend variant
    # If SA is numeric/continuous → Entropy (captures distribution shape)
    # If SA is categorical with few values → Distinct (simpler, more achievable)
    if df[sa_col].dtype in ['int64', 'float64'] and df[sa_col].nunique() > 10:
        variant = 'entropy'
        variant_reason = f"SA '{sa_col}' is numeric — Entropy variant captures distribution shape."
    elif global_uniq < 5:
        variant = 'distinct'
        variant_reason = f"SA '{sa_col}' has only {global_uniq} unique values — Distinct variant is most achievable."
    else:
        variant = 'entropy'
        variant_reason = "Entropy variant recommended (most rigorous for categorical SA)."

    reason = (f"SA '{sa_col}' has {global_uniq} unique values globally. "
              f"Min distinct values per EC = {min_l}, mean = {mean_l:.1f}. "
              f"l={suggested_l} is achievable and protective. "
              f"{variant_reason}")

    return {
        'l'          : suggested_l,
        'variant'    : variant,
        'reason'     : reason,
        'min_l_in_data': min_l,
        'global_sa_unique': global_uniq,
    }
```

### B3.3 — T-Closeness Parameters

```python
def suggest_t_closeness_params(df, qi_cols, sa_col):
    """
    Suggest T threshold from actual EMD distribution across ECs.
    """
    if not qi_cols or not sa_col:
        return {'t': 0.30, 'reason': "Default t=0.30 (standard). Select QI and SA columns for suggestion."}

    global_dist = df[sa_col].value_counts(normalize=True)
    all_values  = global_dist.index.tolist()
    ec_groups   = df.groupby(qi_cols)

    emd_list = []
    for _, group in ec_groups:
        local_dist = group[sa_col].value_counts(normalize=True)
        tvd = 0.5 * sum(abs(local_dist.get(v, 0) - global_dist.get(v, 0)) for v in all_values)
        emd_list.append(tvd)

    mean_emd  = sum(emd_list) / len(emd_list)
    max_emd   = max(emd_list)

    # Suggest t slightly above mean — so most ECs pass without reprocessing
    suggested_t = round(min(0.50, max(0.10, mean_emd + 0.05)), 2)
    pct_violating = sum(1 for e in emd_list if e > suggested_t) / len(emd_list) * 100

    reason = (f"Mean EMD across {len(emd_list)} equivalence classes = {mean_emd:.3f}. "
              f"Max EMD = {max_emd:.3f}. "
              f"At t={suggested_t}: {100-pct_violating:.0f}% of ECs pass without suppression.")

    return {
        't'            : suggested_t,
        'mean_emd'     : round(mean_emd, 4),
        'max_emd'      : round(max_emd, 4),
        'pct_violating': round(pct_violating, 2),
        'reason'       : reason,
    }
```

### B3.4 — Numeric Technique Parameters (Rank Swapping, Microaggregation, Noise, Top/Bottom)

```python
def suggest_numeric_technique_params(df, target_cols, technique):
    """
    Shared auto-suggestion logic for techniques operating on numeric columns.
    """
    if not target_cols:
        defaults = {
            'rank_swapping'   : {'swap_fraction': 10, 'reason': "Default 10% swap fraction."},
            'microaggregation': {'cluster_k': 5,      'reason': "Default cluster size k=5."},
            'noise_addition'  : {'lambda': 0.10,      'reason': "Default λ=0.10 (SNR=100)."},
            'top_bottom_coding': {'top_pct': 95, 'bottom_pct': 5,
                                   'reason': "Default 5th–95th percentile capping."},
        }
        return defaults.get(technique, {})

    numeric_df = df[target_cols].select_dtypes(include='number')
    N          = len(df)

    if technique == 'rank_swapping':
        # Base on dataset size: smaller datasets need less swap to achieve same privacy
        if N < 100:
            swap_pct = 20
            reason   = f"Small dataset (N={N}) — 20% swap fraction provides meaningful rank perturbation."
        elif N < 500:
            swap_pct = 15
            reason   = f"Medium dataset (N={N}) — 15% swap fraction is standard."
        else:
            swap_pct = 10
            reason   = f"Large dataset (N={N}) — 10% swap fraction (p={round(0.10*N)} records)."
        return {'swap_fraction': swap_pct, 'reason': reason}

    elif technique == 'microaggregation':
        # Same k logic as K-Anonymity but for clusters
        # Rule of thumb: k ≈ sqrt(N/10) capped at 20
        suggested_k = max(3, min(20, int((N / 10) ** 0.5)))
        reason = (f"With N={N}, cluster size k={suggested_k} creates "
                  f"≈{N // suggested_k} clusters. "
                  f"Adjust up for more privacy, down for more utility.")
        return {'cluster_k': suggested_k, 'reason': reason}

    elif technique == 'noise_addition':
        # Suggest λ based on average coefficient of variation across numeric cols
        cvs = []
        for col in target_cols:
            s = df[col].std()
            m = abs(df[col].mean())
            if m > 0:
                cvs.append(s / m)

        avg_cv = sum(cvs) / len(cvs) if cvs else 0.5
        # High CV (variable data) → lower λ needed; Low CV → higher λ needed
        if avg_cv > 0.5:
            lambda_v = 0.05
            reason   = f"High coefficient of variation (avg CV={avg_cv:.2f}) — data is already variable. λ=0.05 is sufficient."
        elif avg_cv > 0.2:
            lambda_v = 0.10
            reason   = f"Moderate CV (avg={avg_cv:.2f}) — λ=0.10 (SNR=100) balances privacy and utility."
        else:
            lambda_v = 0.20
            reason   = f"Low CV (avg={avg_cv:.2f}) — data has low natural variation. λ=0.20 adds meaningful noise."
        return {'lambda': lambda_v, 'reason': reason}

    elif technique == 'top_bottom_coding':
        # Suggest percentiles based on skewness of target columns
        skews = [abs(df[col].skew()) for col in target_cols if col in df]
        avg_skew = sum(skews) / len(skews) if skews else 0

        if avg_skew > 2.0:
            top_pct, bot_pct = 90, 10
            reason = f"High average skewness ({avg_skew:.2f}) — aggressive capping at 10th–90th percentile recommended."
        elif avg_skew > 1.0:
            top_pct, bot_pct = 95, 5
            reason = f"Moderate skewness ({avg_skew:.2f}) — standard 5th–95th percentile capping."
        else:
            top_pct, bot_pct = 97, 3
            reason = f"Low skewness ({avg_skew:.2f}) — light capping at 3rd–97th percentile sufficient."

        return {'top_pct': top_pct, 'bottom_pct': bot_pct, 'reason': reason}

    return {}
```

### B3.5 — PRAM Parameters

```python
def suggest_pram_params(df, target_cols):
    """
    Suggest retention probability based on category distribution.
    """
    if not target_cols:
        return {'p_ret': 0.70, 'reason': "Default p_ret=0.70 (standard). Select categorical columns first."}

    # Compute average number of categories across target cols
    n_cats = [df[col].nunique() for col in target_cols if col in df.columns]
    avg_cats = sum(n_cats) / len(n_cats) if n_cats else 5

    # More categories → higher p_ret (less perturbation needed, harder to track)
    # Fewer categories → lower p_ret (easier to guess, need more noise)
    if avg_cats <= 3:
        p_ret  = 0.85
        reason = f"Few categories on average ({avg_cats:.0f}) — high p_ret=0.85 still provides deniability."
    elif avg_cats <= 7:
        p_ret  = 0.70
        reason = f"Moderate categories ({avg_cats:.0f}) — standard p_ret=0.70 (30% perturbation rate)."
    else:
        p_ret  = 0.60
        reason = f"Many categories ({avg_cats:.0f}) — lower p_ret=0.60 still meaningful; many alternatives exist."

    return {
        'p_ret' : p_ret,
        'reason': reason,
        'avg_categories': round(avg_cats, 1),
    }
```

### B3.6 — Data Shuffling Parameters

```python
def suggest_data_shuffling_params(df, target_cols, column_profiles):
    """
    Recommend shuffle variant based on column types and dataset structure.
    """
    if not target_cols:
        return {'variant': 'full', 'reason': "Default: Full shuffle severs all QI↔SA linkage."}

    has_natural_groups = any(
        column_profiles[col]['inferred_dtype'] == 'categorical'
        and column_profiles[col]['unique_count'] <= 20
        for col in df.columns
        if col in column_profiles and col not in target_cols
    )

    all_numeric = all(
        column_profiles.get(col, {}).get('is_numeric', False)
        for col in target_cols
    )

    if all_numeric and has_natural_groups:
        variant = 'within_group'
        reason  = ("Target columns are numeric and natural grouping columns exist. "
                   "Within-group shuffle preserves group statistics while breaking individual linkage.")
        rank_delta = None
    elif all_numeric:
        variant    = 'rank_preserving'
        rank_delta = 0.10
        reason     = ("Numeric target columns with no natural groups. "
                      "Rank-preserving shuffle (δ=0.10) maintains approximate rank correlation.")
    else:
        variant    = 'full'
        rank_delta = None
        reason     = "Mixed or categorical columns — full random shuffle provides strongest privacy guarantee."

    return {
        'variant'    : variant,
        'rank_delta' : rank_delta,
        'reason'     : reason,
    }
```

### B3.7 — Cell Suppression Parameters

```python
def suggest_cell_suppression_params(df, row_col, col_col, value_col, aggregate):
    """
    Suggest n_min and dominance threshold from actual table frequencies.
    """
    if not all([row_col, col_col, value_col]):
        return {
            'n_min': 3, 'p_pct': 70, 'k': 1,
            'reason': "Default: n_min=3, p%=70 (standard NSO rules). Select row/col/value variables first."
        }

    # Build the frequency table
    freq_table = df.groupby([row_col, col_col]).size().reset_index(name='count')
    counts     = freq_table['count'].values

    # Suggest n_min: standard is 3–5
    min_count  = int(counts.min())
    pct_sparse = (counts < 3).mean() * 100

    if pct_sparse > 30:
        n_min  = 5
        reason_n = f"{pct_sparse:.0f}% of cells have fewer than 3 records — use n_min=5 for stricter protection."
    elif pct_sparse > 10:
        n_min  = 3
        reason_n = f"{pct_sparse:.0f}% of cells are sparse — n_min=3 is the standard NSO threshold."
    else:
        n_min  = 3
        reason_n = f"Only {pct_sparse:.0f}% of cells are sparse — n_min=3 handles them adequately."

    # Suggest p_pct: standard is 70%
    # If value_col is specified and agg is sum, check actual dominance
    p_pct   = 70
    reason_p = "p%=70 is the NSO standard: suppress if top contributor exceeds 70% of cell total."

    return {
        'n_min'    : n_min,
        'p_pct'    : p_pct,
        'k'        : 1,
        'pct_sparse': round(pct_sparse, 1),
        'reason'   : f"{reason_n} {reason_p}",
    }
```

---

## B4 — STAGE 4: UI RENDERING SPECIFICATION

### B4.1 — Parameter Panel with Auto-Suggest Badges

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚙️  AUTO-SUGGESTED PARAMETERS  —  based on your dataset            │
│  You can override any value before applying.                        │
└─────────────────────────────────────────────────────────────────────┘

[Example for K-Anonymity:]

K VALUE                                              Suggested: 5  🟢
  ━━━━━━━━━●━━━━━━━━━━━━━━━━━  [2 ─────────── 25]
  ℹ "10th percentile EC size = 5. With k=5, approximately 90% of records
    will be in equivalence classes of at least 5 people."

SUPPRESSION LIMIT                                    Suggested: 10%  🟡
  ━━━━━━━━━●━━━━━━━━━━━━━━━━━  [0% ─────── 30%]
  ℹ "67% of QI groups are singletons — higher suppression limit
    recommended to handle ungroupable records."

GENERALISATION METHOD                                Default: Midpoint
  ◉ Midpoint    ○ Range
  ℹ "Midpoint replaces each partition with its centre value.
    Range replaces with [min, max] string — useful for display."

[ ↺ Reset to Suggested ]       [ ▶ Apply Technique ]
```

### B4.2 — Column Selection Panel with Auto-Assist

```
┌─────────────────────────────────────────────────────────────────────┐
│  QUASI-IDENTIFIERS (QI)   — 4 auto-selected  [ Uncheck All ]        │
│  "These columns form equivalence classes. Auto-selected from your   │
│   dataset profile. Deselect any you want excluded."                 │
└─────────────────────────────────────────────────────────────────────┘

✅ Round_Centre_Code   🟢  "6 distinct values — geographic QI"
✅ FSU_Serial_No       🟡  "87 distinct values — moderate re-ID risk"
✅ Round               🟢  "4 distinct values — temporal QI"
☐  Sch_No              🔵  "Low confidence — you decide"
☐  Sample              ⚪  "Auto-excluded — likely admin field"

[ + Add column to QI ]

┌─────────────────────────────────────────────────────────────────────┐
│  SENSITIVE ATTRIBUTE (SA)  — 1 auto-selected                        │
└─────────────────────────────────────────────────────────────────────┘
  [  Round  ▼ ]   🟢 "Auto-selected: highest entropy SA column"
  ℹ "Entropy = 0.87. Change this if a different column is more sensitive."
```

### B4.3 — Target Column Auto-Selection (Numeric Techniques)

```
┌─────────────────────────────────────────────────────────────────────┐
│  TARGET COLUMNS (numeric)   — 3 auto-selected  [ Uncheck All ]      │
│  "Columns that will be transformed. All = none selected."           │
└─────────────────────────────────────────────────────────────────────┘

✅ HH_Size     [continuous_numeric | std=2.3 | nunique=18]
✅ NIC_2008    [ordinal_numeric    | std=1524 | nunique=47]
✅ NCO_2004    [ordinal_numeric    | std=812  | nunique=31]
☐  HH_Type     [excluded: binary — only 2 values]
☐  Multiplier  [excluded: likely weight/admin field]
```

### B4.4 — Validation Badges (shown before Apply)

Show a pre-flight checklist before the user hits Apply:

```
PRE-FLIGHT CHECK:
  ✅ QI columns selected (3)
  ✅ SA column selected (Round)
  ✅ SA has 4 unique values ≥ l=3 required
  ✅ Dataset has 100 rows ≥ 2k=6 minimum
  ⚠️ 100% of records are currently singletons on QI combination
     — significant generalisation will occur with k=5

[ ▶ Apply Technique ]
```

---

## B5 — MASTER AUTO-ASSIST FUNCTION

```python
def privacy_enhancement_auto_assist(df, technique_name, column_profiles, classifications):
    """
    Master function. Call this every time the user switches technique.
    Returns everything needed to pre-populate the Privacy Enhancement UI.

    Args:
        df                : pandas DataFrame (full dataset)
        technique_name    : string key (e.g. 'k_anonymity')
        column_profiles   : output of auto_assist_pipeline Stage 1 (already computed)
        classifications   : output of auto_assist_pipeline Stage 2 (already computed)

    Returns:
        dict with pre-selected columns + suggested parameters + reasons
    """
    N = len(df)

    # Stage 1: What inputs does this technique need?
    req = get_required_inputs(technique_name)

    # Stage 2: Auto-select columns
    selected = auto_select_columns(technique_name, column_profiles, classifications)
    qi_cols     = selected['qi_cols']
    sa_col      = selected['sa_col']
    target_cols = selected['target_cols']

    # Stage 3: Suggest parameters
    params = {}

    if technique_name == 'k_anonymity':
        k_params    = suggest_k_anonymity_params(df, qi_cols)
        params.update(k_params)
        # Also suggest k for the underlying Mondrian
        params['generalisation_method'] = 'midpoint'
        params['reason_gen'] = "Midpoint generalisation is the most common and preserves column scale."

    elif technique_name == 'l_diversity':
        k_params    = suggest_k_anonymity_params(df, qi_cols)
        l_params    = suggest_l_diversity_params(df, qi_cols, sa_col, k_params.get('k', 5))
        params.update(k_params)
        params.update(l_params)

    elif technique_name == 't_closeness':
        k_params    = suggest_k_anonymity_params(df, qi_cols)
        t_params    = suggest_t_closeness_params(df, qi_cols, sa_col)
        params.update(k_params)
        params.update(t_params)

    elif technique_name in ('rank_swapping', 'microaggregation',
                             'noise_addition', 'top_bottom_coding'):
        params = suggest_numeric_technique_params(df, target_cols, technique_name)

    elif technique_name == 'pram':
        params = suggest_pram_params(df, target_cols)

    elif technique_name == 'data_shuffling':
        params = suggest_data_shuffling_params(df, target_cols, column_profiles)

    elif technique_name == 'cell_suppression':
        # Can't suggest much without row/col/val being set — provide defaults
        params = suggest_cell_suppression_params(df, None, None, None, 'count')

    elif technique_name == 'explicit_suppression':
        # Default to uniqueness criterion
        params = {
            'criterion'        : 'uniqueness',
            'min_group_size'   : 2,
            'suppression_budget': 10,
            'reason'           : "Uniqueness criterion removes records that are QI-unique (highest re-ID risk)."
        }

    elif technique_name == 'generalisation':
        # Auto-suggest one config entry per selected target column
        col_configs = []
        for col in target_cols[:5]:   # limit to first 5
            p = column_profiles.get(col, {})
            if p.get('inferred_dtype') == 'continuous_numeric':
                col_configs.append({'col': col, 'type': 'bin',
                                     'bin_width': 'auto',
                                     'reason': f"Numeric — auto bin_width (Sturges' rule)"})
            elif p.get('inferred_dtype') == 'categorical':
                col_configs.append({'col': col, 'type': 'topk',
                                     'k': min(10, p.get('unique_count', 10)),
                                     'reason': f"Categorical — top-{min(10, p.get('unique_count',10))} categories"})
            else:
                col_configs.append({'col': col, 'type': 'round',
                                     'round_to': 10,
                                     'reason': "Numeric — round to nearest 10"})
        params = {'col_configs': col_configs}

    # Build pre-flight checks
    pre_flight = build_preflight_checks(technique_name, df, qi_cols, sa_col, target_cols, params)

    return {
        'technique'      : technique_name,
        'selected_qi'    : qi_cols,
        'selected_sa'    : sa_col,
        'selected_tc'    : target_cols,
        'suggested_params': params,
        'pre_flight'     : pre_flight,
        'dataset_info'   : {'rows': N, 'cols': len(df.columns)},
    }


def build_preflight_checks(technique, df, qi_cols, sa_col, target_cols, params):
    """
    Returns a list of check items shown before the Apply button.
    Each item: { label, status: 'pass'|'warn'|'fail', message }
    """
    checks = []
    N = len(df)

    req = get_required_inputs(technique)

    if req['qi']:
        if qi_cols:
            checks.append({'label': f'QI columns selected ({len(qi_cols)})',
                           'status': 'pass', 'message': ', '.join(qi_cols)})
        else:
            checks.append({'label': 'QI columns selected',
                           'status': 'fail', 'message': 'Select at least one QI column.'})

    if req['sa']:
        if sa_col:
            n_unique_sa = df[sa_col].nunique()
            checks.append({'label': f'SA column selected ({sa_col})',
                           'status': 'pass', 'message': f'{n_unique_sa} unique values'})
            # Check SA has enough unique values for l
            l = params.get('l', 3)
            if n_unique_sa < l:
                checks.append({'label': f'SA unique values ≥ l={l}',
                               'status': 'fail',
                               'message': f'SA has only {n_unique_sa} unique values — reduce l to {n_unique_sa}.'})
            else:
                checks.append({'label': f'SA unique values ≥ l={l}',
                               'status': 'pass', 'message': f'{n_unique_sa} ≥ {l} ✅'})
        else:
            checks.append({'label': 'SA column selected',
                           'status': 'fail', 'message': 'Select a sensitive attribute.'})

    if req['tc']:
        if target_cols:
            checks.append({'label': f'Target columns selected ({len(target_cols)})',
                           'status': 'pass', 'message': ', '.join(target_cols[:3]) + ('...' if len(target_cols) > 3 else '')})
        else:
            checks.append({'label': 'Target columns selected',
                           'status': 'fail', 'message': 'Select at least one target column.'})

    # Dataset size check
    k = params.get('k', params.get('cluster_k', 5))
    if N < 2 * k:
        checks.append({'label': f'Dataset size ≥ 2k={2*k}',
                       'status': 'fail',
                       'message': f'Dataset has only {N} rows. k={k} requires at least {2*k} rows.'})
    elif N < 10 * k:
        checks.append({'label': f'Dataset size ({N} rows)',
                       'status': 'warn',
                       'message': f'Small dataset for k={k}. Results may have high suppression.'})
    else:
        checks.append({'label': f'Dataset size ({N} rows)',
                       'status': 'pass', 'message': f'Sufficient for k={k}.'})

    # Singleton warning for QI-based techniques
    if req['qi'] and qi_cols:
        try:
            ec_sizes   = df.groupby(qi_cols).size()
            pct_unique = (ec_sizes == 1).sum() / len(ec_sizes) * 100
            if pct_unique > 50:
                checks.append({'label': f'{pct_unique:.0f}% of QI groups are singletons',
                               'status': 'warn',
                               'message': 'Significant generalisation will occur. Consider reducing QI columns.'})
        except Exception:
            pass

    return checks
```

---

## B6 — SUMMARY: WHAT EACH TECHNIQUE NEEDS FROM AUTO-ASSIST

| Technique | Auto-select QI? | Auto-select SA? | Auto-select TC? | Key Param Suggestion |
|-----------|:---:|:---:|:---:|---|
| K-Anonymity | ✅ (all QUASI_ID) | ❌ | ❌ | k = 10th pct EC size |
| L-Diversity | ✅ | ✅ (max entropy SA) | ❌ | l = k//2; variant from SA dtype |
| T-Closeness | ✅ | ✅ | ❌ | t = mean_EMD + 0.05 |
| Rank Swapping | ❌ | ❌ | ✅ (numeric, non-ID) | swap_frac from N |
| Microaggregation | ❌ | ❌ | ✅ (numeric) | k = √(N/10) |
| PRAM | ❌ | ❌ | ✅ (categorical) | p_ret from avg_categories |
| Top/Bottom Coding | ❌ | ❌ | ✅ (numeric) | pct from skewness |
| Noise Addition | ❌ | ❌ | ✅ (numeric) | λ from coeff of variation |
| Explicit Suppression | ⭕ (uniqueness) | ⭕ (sens. val.) | ⭕ (outlier) | criterion = uniqueness default |
| Generalisation | ❌ | ❌ | ✅ (any) | type from dtype per col |
| Data Shuffling | ❌ | ❌ | ✅ (SENSITIVE first) | variant from col types |
| Cell Suppression | ❌ | ❌ | ❌ | n_min from sparse% |

---

*Specification Version 1.0*
*Privacy Enhancement Config & Auto-Assist | MoSPI Statathon 2025 — SafeData Pipeline | AIRAVATA Technologies*
