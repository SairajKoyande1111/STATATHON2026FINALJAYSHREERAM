# Differential Privacy — Sidebar Metrics & Configuration Additions
### Analogous to SDC's QI / SA / Pre-flight Panel
> Add these sections to the LEFT PANEL (sidebar) of the Differential Privacy tab, below "Target Columns"

---

## WHY DP SIDEBAR NEEDS ITS OWN METRICS

In **SDC**, the sidebar tracks:
- Quasi-Identifiers (QI) → columns that can re-identify someone indirectly
- Sensitive Attributes (SA) → columns that must be protected
- Pre-flight Check → validates configuration before applying

In **Differential Privacy**, the equivalents are:
- **Privacy-Sensitive Columns** → which columns carry the most re-ID risk (needs ε budget)
- **High-Sensitivity Columns** → columns with large ranges that produce enormous noise (needs attention)
- **Budget Allocation Preview** → how ε is split across columns
- **Pre-flight Check** → validates DP parameters before applying

---

## SIDEBAR SECTION 1: Column Configuration Panel

```
┌──────────────────────────────────────────┐
│  COLUMN CONFIGURATION                    │
│                                          │
│  ⚡ Auto-suggested: ε = 1.0 (standard)   │
│     Sensitivity: Auto (Min-Max)          │
└──────────────────────────────────────────┘
```

---

## SIDEBAR SECTION 2: Numeric Columns (Perturbable)

Analogous to **Quasi-Identifiers** in SDC — these are the columns DP will actually perturb.

```
┌──────────────────────────────────────────────────────────┐
│  NUMERIC COLUMNS (DP Perturbable)    [Uncheck All]       │
│                                                          │
│  Auto-detected from column profiles. Adjust as needed.  │
│                                                          │
│  Column          Sensitivity (Δf)    Risk     Budget    │
│  ☑ MLT           1,200,000  🔴       HIGH     ε = 1.0  │
│  ☑ Blank         0.82       🟡       MED      ε = 1.0  │
│  ☑ Level_num     4          🟢       LOW      ε = 1.0  │
│  ☑ NSS_num       16         🟢       LOW      ε = 1.0  │
│  ☑ Sample_wt     48,000     🟡       MED      ε = 1.0  │
│                                                          │
│  🔴 Direct-ID  🟡 High Sensitivity  🟢 Low Sensitivity  │
└──────────────────────────────────────────────────────────┘
```

**Colour logic:**
| Colour | Condition | Meaning |
|--------|-----------|---------|
| 🔴 Red | Noise scale > 10× mean value | Very high noise, utility loss likely |
| 🟡 Yellow | Noise scale 1×–10× mean value | Moderate noise |
| 🟢 Green | Noise scale < 1× mean value | Low noise, utility well preserved |

---

## SIDEBAR SECTION 3: Categorical Columns (Exponential Mechanism Target)

Analogous to **Sensitive Attribute** in SDC — these columns need the Exponential Mechanism.

```
┌──────────────────────────────────────────────────────────┐
│  CATEGORICAL COLUMNS (Exponential Mech.)                 │
│                                                          │
│  Auto-detected. Exponential Mechanism applies here.     │
│                                                          │
│  Column          Unique Values    Entropy     Include   │
│  ☐ NSC           14 values        3.81 bits   Optional │
│  ☐ NSS           16 values        3.96 bits   Optional │
│  ☐ Level         3 values         1.58 bits   Optional │
│  ☐ Round         12 values        3.46 bits   Optional │
│  ☐ State         28 values        4.81 bits   Optional │
│  ☐ Sector        2 values         1.00 bits   Optional │
│                                                          │
│  ⚠ Currently: Laplace will SKIP these 38 columns.      │
│  → Check boxes above to apply Exponential Mechanism     │
│    to categorical columns too (uses same ε budget).     │
└──────────────────────────────────────────────────────────┘
```

**Why show entropy?**  
Higher entropy = more uniform distribution = Exponential mechanism distorts less. Low entropy columns (e.g., binary Sector) are most vulnerable to Exponential noise.

---

## SIDEBAR SECTION 4: Privacy Budget Allocator

Analogous to SDC's **T-threshold** / **K slider** — the core parameter with live feedback.

```
┌──────────────────────────────────────────────────────────┐
│  PRIVACY BUDGET (ε) ALLOCATOR                            │
│                                                          │
│  ⚡ Suggested: ε = 1.0 (Strong Privacy)                  │
│                                                          │
│  Global ε:  [━━━━━━●━━━━━━━━━━━]  1.0                   │
│                                                          │
│  Allocation Mode:                                        │
│  ● Equal split across all perturbed columns             │
│  ○ Manual per-column allocation                         │
│  ○ Proportional to sensitivity (low-sens cols get more) │
│                                                          │
│  ── If Equal Split (5 numeric columns) ──               │
│  ε per column = 1.0 / 5 = 0.20                         │
│  (tighter per-column but same total guarantee)          │
│                                                          │
│  ── If Global (all columns share same ε) ──             │
│  Each column uses full ε = 1.0                          │
│  Total privacy cost = ε × num_columns = 5.0 ⚠          │
│  (weaker composition guarantee)                         │
│                                                          │
│  Budget Meter:                                           │
│  [████████████████████░░░░░░░░] 1.0 / 1.0 spent        │
│                                                          │
│  0.1   0.5   [1]   2   5                               │
│  ● ε = 1.0 → Strong Privacy ✅                          │
│    "Strong protection for sensitive census data."       │
└──────────────────────────────────────────────────────────┘
```

---

## SIDEBAR SECTION 5: Sensitivity / Clipping Strategy

This is unique to DP (no SDC equivalent). Sensitivity determines how much noise is added — critical to get right.

```
┌──────────────────────────────────────────────────────────┐
│  SENSITIVITY / CLIPPING STRATEGY                         │
│                                                          │
│  Controls how column range (Δf) is computed —           │
│  affects noise scale and outlier robustness.            │
│                                                          │
│  ● Auto (Min-Max)         [current]                     │
│    Δf = max(col) − min(col)                             │
│    Pros: Exact, no clipping loss                        │
│    Cons: Outliers inflate noise massively               │
│                                                          │
│  ○ IQR-Based (Robust)                                   │
│    Δf = Q75 − Q25 × 1.5                                │
│    Pros: Outlier resistant, lower noise                 │
│    Cons: Clips extreme values                           │
│                                                          │
│  ○ Percentile [1% – 99%]                               │
│    Δf = P99 − P01                                       │
│    Pros: Good balance                                   │
│                                                          │
│  ○ Manual Domain Bounds                                  │
│    User-defined min/max per column                      │
│                                                          │
│  ⚠ MLT column: range = 1,200,000                        │
│    Noise scale at ε=1: ±1,200,000 (very high!)         │
│    Suggest: IQR-based clipping for MLT                  │
└──────────────────────────────────────────────────────────┘
```

---

## SIDEBAR SECTION 6: Composition Mode

Critical for correctness when multiple columns/mechanisms are applied.

```
┌──────────────────────────────────────────────────────────┐
│  COMPOSITION SETTINGS                                    │
│                                                          │
│  Privacy Accountant:                                     │
│  ○ Basic (sequential) — ε_total = Σεᵢ                  │
│  ● Advanced (moments accountant)                        │
│  ○ Rényi DP — tightest bound                            │
│                                                          │
│  Estimated total privacy cost:                           │
│  Basic:    ε_total = 5.0  (5 cols × 1.0)               │
│  Advanced: ε_total ≈ 1.8  (√5 × 1.0 × correction)     │
│  Rényi:    ε_total ≈ 1.4  (tightest)                   │
│                                                          │
│  ℹ Using Advanced composition gives you more            │
│    accurate budget tracking across columns.             │
└──────────────────────────────────────────────────────────┘
```

---

## SIDEBAR SECTION 7: PRE-FLIGHT CHECK

Directly analogous to SDC's **Pre-flight Check** — validates everything before Apply.

```
┌──────────────────────────────────────────────────────────┐
│  ⚡ PRE-FLIGHT CHECK                                      │
│                                                          │
│  ✅ Numeric columns selected (5)                         │
│     MLT, Blank, Level_num, NSS_num, Sample_wt           │
│                                                          │
│  ✅ Privacy budget: ε = 1.0 (valid)                      │
│     Strong DP guarantee confirmed                        │
│                                                          │
│  ✅ Sensitivity auto-computed                            │
│     All 5 columns have valid ranges                     │
│                                                          │
│  ⚠ High noise warning: MLT                              │
│     Noise scale (1,200,000) > mean value (312,450)      │
│     → Consider IQR clipping or lower sensitivity        │
│                                                          │
│  ⚠ 38 categorical columns untouched                     │
│     Laplace/Gaussian do not apply to categoricals       │
│     → Enable Exponential Mechanism to protect them      │
│                                                          │
│  ℹ Delta (δ) = 0 for Laplace (pure DP)                 │
│     No catastrophic failure probability                 │
│                                                          │
│  ✅ Dataset size (100 rows): sufficient                  │
│     δ ≤ 1×10⁻⁴ recommended for n=100                   │
│                                                          │
│  ESTIMATED IMPACT:                                       │
│  Information Loss:    ~9–15% (Low)                      │
│  Records Retained:    100/100                           │
│  Re-ID Risk (post):   < 5%                             │
└──────────────────────────────────────────────────────────┘
```

---

## SIDEBAR SECTION 8: Reproducibility

```
┌──────────────────────────────────────────────────────────┐
│  REPRODUCIBILITY                                         │
│                                                          │
│  Random Seed:  [  42  ]   ☑ Set fixed seed              │
│                                                          │
│  ℹ Same seed + same ε = identical output every run.    │
│    Required for audit trails and reproducible research. │
└──────────────────────────────────────────────────────────┘
```

---

## SUMMARY: SDC vs DP Sidebar Mapping

| SDC Sidebar Element | DP Equivalent | Notes |
|---------------------|--------------|-------|
| Quasi-Identifiers (QI) | **Numeric Columns** | Columns that DP perturbs directly |
| Sensitive Attribute (SA) | **Categorical Columns** | Use Exponential Mechanism |
| Auto-suggested t/k | **Auto-suggested ε** | With label: "Strong/Moderate/Weak" |
| T-Threshold slider | **ε slider** with budget labels | Same UX pattern |
| Distance Metric (EMD/TVD) | **Sensitivity Mode** (Min-Max/IQR/Percentile) | Controls noise magnitude |
| Underlying K | **Composition Mode** (Basic/Advanced/Rényi) | Controls budget accounting |
| Pre-flight Check | **Pre-flight Check** | Same pattern, DP-specific validations |
| Column risk colours (🔴🟡🟢) | **Noise-to-signal ratio colours** | 🔴 = noise >> data, 🟢 = noise << data |

---

## IMPLEMENTATION NOTES FOR REPLIT AGENT

1. **Reuse the exact same sidebar UX pattern as SDC** — same card layout, same colour coding (🔴🟡🟢), same Pre-flight Check format
2. **Column colour for DP** = based on `noise_scale / mean_value` ratio, not re-ID risk
3. **Auto-suggest ε** = default to 1.0 with label, same as SDC auto-suggests t=0.30
4. **Entropy** shown for categorical columns (bits) helps user understand which columns the Exponential Mechanism will distort most
5. **Pre-flight warnings** must fire before Apply Technique button is enabled — show ⚠ if any column has noise_scale > column_mean
6. **Budget Allocator** — show both "global ε" and "per-column ε after split" so user understands the composition implication
7. **Sensitivity warning** — if any column's `max − min > 100 × median`, auto-warn and suggest IQR clipping
8. **Categorical untouched warning** — always show how many categorical columns are NOT being protected, with a CTA to enable Exponential Mechanism
