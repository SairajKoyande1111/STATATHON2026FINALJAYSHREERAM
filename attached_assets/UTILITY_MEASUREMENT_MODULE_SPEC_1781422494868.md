# Utility Measurement Module — Complete Technical Specification
## SafeData Pipeline | Statathon 2025 | MoE Innovation Cell | AIRAVATA Technologies

> **For Replit Agent**: This document defines the **complete implementation** of the Utility Measurement Module for the SafeData Pipeline. Replace all placeholder/empty logic in the Utility Measurement page with the accurate, mathematically rigorous implementations described below. The module compares an **original dataset** against a **privacy-enhanced (processed) dataset** and generates a comprehensive, professional Privacy-Utility Report. Every section is production-ready — no dummy code.

---

## SYSTEM CONTEXT & PURPOSE

The Utility Measurement Module is the **third pillar** of the SafeData Pipeline:

| Module | Role |
|---|---|
| **Risk Assessment** | Quantifies re-identification risk using 10 attack simulations |
| **Privacy Enhancement** | Applies anonymisation / noise / SDC techniques to reduce risk |
| **Utility Measurement** ← *this module* | Measures how much statistical value was preserved after privacy enhancement |

**Core Goal:** Answer the question: *"After protecting privacy, how much of the data's analytical usefulness has been preserved?"*

This directly addresses the Statathon 2025 problem statement's requirement:
> *"master the privacy-utility trade-off: maximizing data protection while minimizing the loss of analytical value."*

---

## 1. MODULE ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                   UTILITY MEASUREMENT MODULE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   INPUT PANEL           RESULTS PANEL                          │
│   ┌───────────┐         ┌─────────────────────────────────┐    │
│   │ Original  │──────►  │  SECTION A: Summary Dashboard   │    │
│   │ Dataset   │         │  SECTION B: Statistical Fidelity│    │
│   │ dropdown  │         │  SECTION C: Distribution Compar │    │
│   └───────────┘         │  SECTION D: Column-Level Detail │    │
│   ┌───────────┐         │  SECTION E: Privacy-Utility     │    │
│   │ Processed │──────►  │             Trade-off Chart     │    │
│   │ Operation │         │  SECTION F: Attack-wise Impact  │    │
│   │ dropdown  │         │  SECTION G: Compliance Check    │    │
│   └───────────┘         │  SECTION H: Auto Report (PDF)   │    │
│   [Measure Utility]     └─────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. INPUT PANEL SPECIFICATION

### 2.1 UI Components

```
┌──────────────────────────────────┐
│  ⟳ Compare Data                 │
│  Select original and processed   │
│  datasets to compare             │
│                                  │
│  Original Dataset                │
│  [ Select original dataset ▼ ]   │
│                                  │
│  Processed Operation             │
│  [ Select processed result ▼ ]   │
│                                  │
│  [▶ Measure Utility]             │
└──────────────────────────────────┘
```

### 2.2 Dataset Dropdowns

**Original Dataset dropdown:**
- Lists all datasets uploaded in the Data Upload module
- Shows: `{filename} ({N} rows × {M} columns)`

**Processed Operation dropdown:**
- Lists all operations applied in the Privacy Enhancement module
- Each entry format: `{technique_name} on {dataset_name} — {timestamp}`
- Example: `K-Anonymity (k=5) on household_data.csv — 14 Jun 2026, 14:32`
- If no processed datasets exist: Show message "No processed datasets found. Apply a Privacy Enhancement technique first."

### 2.3 Column Alignment Validation (Run on Button Click)

Before computing metrics, validate:

```python
def validate_datasets(original_df, processed_df):
    errors = []
    warnings = []

    # Check column count
    if set(original_df.columns) != set(processed_df.columns):
        missing_in_proc = set(original_df.columns) - set(processed_df.columns)
        extra_in_proc   = set(processed_df.columns) - set(original_df.columns)
        if missing_in_proc:
            warnings.append(f"Columns suppressed in processed: {missing_in_proc}")
        if extra_in_proc:
            warnings.append(f"New columns added in processed: {extra_in_proc}")

    # Check row count
    row_diff = len(original_df) - len(processed_df)
    if row_diff > 0:
        warnings.append(f"{row_diff} rows suppressed during processing ({row_diff/len(original_df)*100:.1f}%)")
    
    # Proceed even with warnings — compute on common columns
    common_cols = list(set(original_df.columns) & set(processed_df.columns))
    return common_cols, warnings
```

Display warnings as **yellow info banners** before showing results. Never block the computation for column count mismatches — compute on intersection.

---

## 3. CORE METRIC DEFINITIONS & MATHEMATICS

### 3.1 Metric Registry

All utility metrics fall into **five families**:

| Family | What it measures | Key metrics |
|---|---|---|
| **Statistical Fidelity** | Are the numbers still right? | Mean Absolute Error, Relative Bias, Variance Ratio |
| **Distribution Similarity** | Do the shapes still match? | Kolmogorov-Smirnov, Jensen-Shannon Divergence, Wasserstein Distance |
| **Information Content** | Is the information still there? | Mutual Information Loss, Entropy Preservation |
| **Correlation Preservation** | Are relationships intact? | Correlation Matrix Difference, Kendall τ, Cramér's V |
| **Regression/ML Utility** | Would models still work? | Predictive Power Score, R² Preservation |

---

### 3.2 Family A — Statistical Fidelity Metrics

**Computed per numeric column. Aggregated to dataset level.**

#### A1. Mean Absolute Error (MAE)
```
MAE(col) = (1/N) × Σ |original_i - processed_i|
```
- Lower is better. Zero = perfect preservation.
- **Normalised MAE (NMAE)** = MAE / (max_original - min_original)
- Interpretation threshold: NMAE < 0.05 → Excellent; 0.05–0.15 → Good; > 0.15 → Poor

#### A2. Relative Bias (RB)
```
RB(col) = (mean_processed - mean_original) / mean_original × 100    [in %]
```
- Positive = processed overestimates; Negative = underestimates
- |RB| < 2% → Excellent; 2–5% → Acceptable; > 5% → Significant distortion

#### A3. Variance Ratio (VR)
```
VR(col) = var_processed / var_original
```
- VR = 1.0 → perfect variance preservation
- VR < 1 → variance was suppressed (common in k-anonymity, microaggregation)
- VR > 1 → noise was added (common in DP Laplace/Gaussian)
- Acceptable range: 0.85 ≤ VR ≤ 1.15

#### A4. Mean Preservation Score (MPS)
```
MPS(col) = 1 - |mean_processed - mean_original| / (std_original + ε)
           ε = 1e-10 (to avoid divide-by-zero)
```
- Range: 0 (worst) to 1 (perfect)

#### A5. Percentile Preservation (PP)
Compute at p = [5, 10, 25, 50, 75, 90, 95]:
```
for each percentile p:
    orig_p  = percentile(original, p)
    proc_p  = percentile(processed, p)
    error_p = |orig_p - proc_p| / (|orig_p| + ε)

PP(col) = 1 - mean(error_p for all p)
```
- Critical for income/expenditure data where tail statistics matter

#### A6. Overall Statistical Fidelity Score (SFS)
```
SFS = mean(
    (1 - NMAE) × 0.30    +
    (1 - |RB|/100) × 0.25 +
    min(VR, 1/VR) × 0.25  +  # symmetrized
    MPS × 0.10            +
    PP × 0.10
    for each numeric column
)
```
- Range: 0–1. Display as percentage (multiply by 100).

---

### 3.3 Family B — Distribution Similarity Metrics

**For numeric columns: continuous tests. For categorical columns: discrete tests.**

#### B1. Kolmogorov-Smirnov Statistic (KS)

```
KS(col) = max |F_original(x) - F_processed(x)|
```
Where F is the empirical CDF.

- KS = 0 → identical distributions; KS = 1 → completely different
- KS < 0.05 → distributions are statistically indistinguishable
- Also compute **KS p-value** (scipy.stats.ks_2samp). p > 0.05 → fail to reject null (distributions same).
- **Display as:** "Distributions statistically indistinguishable ✓" or "Significant distributional shift detected ⚠"

#### B2. Jensen-Shannon Divergence (JSD)

```
M(x)    = 0.5 × (P(x) + Q(x))          # midpoint distribution
JSD(P,Q) = 0.5 × KL(P||M) + 0.5 × KL(Q||M)

KL(P||M) = Σ P(x) × log2(P(x) / M(x))  # KL-Divergence
```

Where P = original distribution (binned), Q = processed distribution.

- For **numeric columns**: bin both into 20 equal-width bins using original's range
- For **categorical columns**: use value frequency tables as probability distributions
- JSD range: 0 (identical) to 1 (completely different)
- JSD < 0.05 → Excellent; 0.05–0.10 → Good; > 0.10 → Significant divergence

#### B3. Wasserstein Distance (Earth Mover's Distance)

```
W₁(P, Q) = ∫ |F_P(x) - F_Q(x)| dx        # for 1D distributions
```

Or equivalently (for sorted samples):
```
W₁ = (1/N) × Σ |sort(original)[i] - sort(processed)[i]|
```
- **Normalised Wasserstein:** W₁_norm = W₁ / (max_original - min_original)
- W₁_norm < 0.05 → distributions are close

#### B4. Histogram Intersection (for categorical columns)

```
HI(P, Q) = Σ min(P(c), Q(c))    for each category c
```
- Range: 0–1. HI = 1 → distributions identical.
- Used for: education levels, religion, state codes, gender, any categorical column

#### B5. Chi-Square Test (for categorical columns)

```
χ² = Σ (observed_c - expected_c)² / expected_c

observed_c = count of category c in processed dataset
expected_c = count of category c in original × (N_processed / N_original)
```
- p > 0.05 → distribution preserved (no statistically significant change)
- Report: p-value + verdict

---

### 3.4 Family C — Information Content Metrics

#### C1. Entropy Preservation Ratio (EPR)

Shannon entropy per column:
```
H(col) = -Σ p(v) × log2(p(v))    for each unique value v

# For numeric columns: bin into 10 equal-frequency bins first
# For categorical columns: compute directly on value frequencies

EPR(col) = H(processed_col) / H(original_col)
```
- EPR = 1.0 → entropy perfectly preserved
- EPR < 1.0 → information reduced (generalisation removed diversity)
- EPR > 1.0 → noise increased uncertainty (differential privacy effect)
- Target range: 0.90 ≤ EPR ≤ 1.10

#### C2. Mutual Information Loss (MIL)

Between pairs of columns (QI + SA columns are priority pairs):
```
MI(X, Y) = Σ_x Σ_y P(x,y) × log2(P(x,y) / (P(x) × P(y)))

MIL(col_A, col_B) = 1 - MI(processed_A, processed_B) / MI(original_A, original_B)
```
- MIL = 0 → relationship fully preserved
- MIL = 1 → relationship destroyed
- Compute for all pairs where MI(original) > 0.01 (skip near-zero relationships)

#### C3. Unique Value Retention Rate (UVRR)

```
UVRR(col) = |unique values in processed col| / |unique values in original col|
```
- Critical metric for categorical columns affected by generalisation
- UVRR = 1.0 → all distinct values retained
- UVRR < 1.0 → categories were merged/suppressed (expected in k-anonymity)

---

### 3.5 Family D — Correlation & Relationship Preservation

#### D1. Pearson Correlation Preservation (for numeric pairs)

```
ρ_original(X,Y)  = Cov(X,Y) / (σ_X × σ_Y)
ρ_processed(X,Y) = Cov(X',Y') / (σ_X' × σ_Y')

CorrPreservation(X,Y) = 1 - |ρ_original - ρ_processed|
```

**Correlation Matrix Frobenius Distance:**
```
ΔR = ‖R_original - R_processed‖_F / ‖R_original‖_F
```
Where R is the full correlation matrix of numeric columns.
- ΔR < 0.05 → Excellent; 0.05–0.15 → Good; > 0.15 → Poor

#### D2. Spearman Rank Correlation (for ordinal/non-normal data)

Same formula as Pearson but applied to ranks:
```
ρ_spearman = Pearson(rank(X), rank(Y))
```

#### D3. Cramér's V (for categorical column pairs)

```
V = sqrt(χ² / (N × (min(r,c) - 1)))
```
Where r = number of rows in contingency table, c = number of columns.
- Compare V_original vs V_processed for each categorical pair.
- Report delta: ΔV = |V_original - V_processed|

#### D4. Kendall Tau Distance (for ordinal columns)

```
τ = (concordant_pairs - discordant_pairs) / (N × (N-1) / 2)
```
Compare τ_original vs τ_processed.

---

### 3.6 Family E — ML / Regression Utility (Predictive Power)

#### E1. Predictive Power Score (PPS)

For each column pair (predictor → target):
```
# Fit a simple decision tree on original data
model_orig = DecisionTreeRegressor(max_depth=3).fit(X_orig, y_orig)
score_orig = cross_val_score(model_orig, X_orig, y_orig, cv=3, scoring='r2').mean()

# Fit same model on processed data
model_proc = DecisionTreeRegressor(max_depth=3).fit(X_proc, y_proc)
score_proc = cross_val_score(model_proc, X_proc, y_proc, cv=3, scoring='r2').mean()

PPS_preservation = score_proc / score_orig    (if score_orig > 0)
```
- PPS_preservation = 1 → full predictive utility retained
- PPS_preservation < 0.8 → significant ML utility loss

#### E2. R² Preservation

For each numeric column Y using all other numeric columns as features:
```
R²_original  = OLS(Y ~ other_cols, data=original).rsquared
R²_processed = OLS(Y ~ other_cols, data=processed).rsquared

R²_retention(Y) = R²_processed / R²_original
```

#### E3. Regression Coefficient Stability

For a key SA column (e.g., income) as target:
```
β_original  = OLS coefficients on original data
β_processed = OLS coefficients on processed data

Coefficient_RMSE = sqrt(mean((β_original - β_processed)²))
```
Stable coefficients indicate the relationships in the data are preserved.

---

### 3.7 Overall Utility Score (OUS) — Composite Metric

The headline metric displayed prominently at the top of the results panel.

```
OUS = (
    SFS × 0.30      +   # Statistical Fidelity Score
    DS  × 0.25      +   # Distribution Similarity (avg of 1-KS, 1-JSD, 1-W₁_norm)
    IC  × 0.20      +   # Information Content (avg of EPR proximity, 1-MIL, UVRR)
    CP  × 0.15      +   # Correlation Preservation (1 - ΔR)
    PU  × 0.10          # Predictive Utility (avg R² retention)
) × 100             [expressed as 0–100 percentage]
```

**OUS Grade Table:**

| Score | Grade | Verdict | Label Colour |
|---|---|---|---|
| 90–100 | A+ | Exceptional — virtually no utility loss | 🟢 Green |
| 80–89  | A  | Excellent — minor distortion only | 🟢 Green |
| 70–79  | B  | Good — manageable trade-off | 🟡 Amber |
| 60–69  | C  | Acceptable — notable utility loss | 🟡 Amber |
| 50–59  | D  | Poor — significant analytical degradation | 🔴 Red |
| < 50   | F  | Fail — data utility severely compromised | 🔴 Red |

---

## 4. RESULTS PANEL — SECTION-BY-SECTION SPECIFICATION

### SECTION A — Summary Dashboard (Top of Results Panel)

**Always visible first. Overview cards in a 4-column grid.**

```
┌──────────────────────────────────────────────────────────────────┐
│  Overall Utility Score      Risk Reduction      Rows Retained    │
│  ┌──────────┐               ┌──────────┐        ┌──────────┐    │
│  │   84.2%  │               │  -62.3%  │        │  97.8%   │    │
│  │  Grade A │               │  Re-ID   │        │ (977/1000│    │
│  │ Excellent│               │  Risk    │        │ rows)    │    │
│  └──────────┘               └──────────┘        └──────────┘    │
│                                                                  │
│  Columns Assessed    Technique Applied                           │
│  ┌──────────┐        ┌────────────────────────────────────┐      │
│  │ 12 of 15 │        │ K-Anonymity (k=5, Mondrian)        │      │
│  │ columns  │        │ Applied: 14 Jun 2026, 14:32        │      │
│  └──────────┘        └────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

**Metric Cards — Required values:**

| Card | Formula | Source |
|---|---|---|
| Overall Utility Score | OUS formula (Section 3.7) | Computed |
| Risk Reduction | (Risk_before - Risk_after) / Risk_before × 100 | From Risk Assessment module — pull last assessment result for this dataset |
| Rows Retained | processed_rows / original_rows × 100 | Row counts |
| Columns Assessed | count(common_cols) | Column intersection |
| Technique Applied | From processed operation metadata | Privacy Enhancement log |

**Privacy-Utility Balance Bar (visual):**
```
Privacy  ████████████████░░░░░  Utility
         62.3% risk reduced    84.2% utility retained
```

---

### SECTION B — Statistical Fidelity Panel

**Tab / accordion for each numeric column. Plus an "All Columns Summary" table.**

#### B1. All-Columns Summary Table (default view)

| Column | Orig Mean | Proc Mean | Bias % | Orig Std | Proc Std | Var Ratio | NMAE | SFS |
|---|---|---|---|---|---|---|---|---|
| income | 42,000 | 41,890 | -0.26% | 12,400 | 11,830 | 0.91 | 0.032 | 91.2% |
| age_years | 38.4 | 38.1 | -0.78% | 11.2 | 10.9 | 0.95 | 0.018 | 94.7% |
| ... | | | | | | | | |

- Color coding: Green if within threshold, Amber if marginal, Red if failing
- Sortable columns
- Export as CSV button

#### B2. Per-Column Deep Dive (click any row to expand)

Shows a **side-by-side statistical summary card:**

```
┌────────────────────────────────────────────────────────────┐
│  Column: income                                            │
├───────────────────┬────────────────────────────────────────┤
│  Metric           │  Original    │  Processed  │  Delta    │
├───────────────────┼─────────────────────────────────────────┤
│  Count            │  1,000       │  977        │  -23      │
│  Mean             │  ₹42,000    │  ₹41,890   │  -0.26%   │
│  Median           │  ₹38,500    │  ₹38,200   │  -0.78%   │
│  Std Dev          │  ₹12,400    │  ₹11,830   │  -4.59%   │
│  Min              │  ₹5,000     │  ₹5,000    │  0.00%    │
│  Max              │  ₹1,20,000  │  ₹1,15,000 │  -4.17%   │
│  Skewness         │  1.42       │  1.38       │  -0.04    │
│  Kurtosis         │  3.21       │  3.05       │  -0.16    │
│  5th Percentile   │  ₹8,200     │  ₹8,400    │  +2.44%   │
│  25th Percentile  │  ₹28,000    │  ₹27,500   │  -1.79%   │
│  75th Percentile  │  ₹52,000    │  ₹51,200   │  -1.54%   │
│  95th Percentile  │  ₹85,000    │  ₹84,000   │  -1.18%   │
└───────────────────┴────────────────────────────────────────┘
```

---

### SECTION C — Distribution Comparison (Side-by-Side Visual)

**For every column: side-by-side original vs processed distribution plots.**

#### C1. Numeric Columns — Overlaid Histogram + KDE

```
Chart spec:
  - X-axis: column value range (use original's range)
  - Y-axis: density (normalised)
  - Original: blue bars (semi-transparent, opacity 0.6)
  - Processed: orange bars (semi-transparent, opacity 0.6)
  - Overlay KDE line: blue (original) + orange (processed)
  - Show KS statistic and p-value as annotation on chart
  - Show mean lines as vertical dashed lines
```

Below chart, display KS test result:
```
KS = 0.038 | p = 0.412 → ✓ Distributions statistically indistinguishable (p > 0.05)
```

#### C2. Categorical Columns — Grouped Bar Chart

```
Chart spec:
  - X-axis: categories (sorted by original frequency)
  - Y-axis: percentage frequency
  - Blue bars: original frequency %
  - Orange bars: processed frequency %
  - Annotation: Histogram Intersection = {HI}
  - χ² test verdict displayed beneath chart
```

#### C3. Percentile Ladder Chart (per numeric column)

```
Percentile ladder:
  X-axis: value
  Y-axis: percentile (5, 10, 25, 50, 75, 90, 95)
  
  Blue line:   original percentile values
  Orange line: processed percentile values
  
  Shaded band: acceptable deviation zone (±5%)
  
  Points outside band: marked with ⚠ warning icon
```

#### C4. QQ-Plot (Quantile-Quantile)

```
  X-axis: quantiles of original column
  Y-axis: quantiles of processed column
  Points: each quantile pair
  Reference line: y = x (perfect preservation = all points on this line)
  Deviation from diagonal = distortion
```

---

### SECTION D — Column-Level Detail Matrix

**Full heatmap view showing all utility metrics across all columns.**

#### D1. Utility Heatmap

```
        Col1   Col2   Col3   Col4   Col5   ...
NMAE    🟢     🟡     🟢     🔴     🟢
VR      🟢     🟢     🟡     🔴     🟢
JSD     🟢     🟡     🟢     🟡     🟢
EPR     🟢     🟢     🟢     🟢     🟡
KS      🟢     🟡     🟢     🔴     🟢
UVRR    🟢     🔴     🟢     🟡     🟢
SFS     91%    72%    88%    44%    87%
```

Color rule:
- 🟢 Green: Metric within excellent threshold
- 🟡 Amber: Metric in acceptable but non-ideal range
- 🔴 Red: Metric exceeds acceptable threshold

Click any cell → opens per-column deep dive (Section B2).

#### D2. Top 5 Most Distorted Columns

Auto-ranked by lowest SFS score:
```
⚠ Most Distorted Columns (Require Attention)
  1. district_code     SFS = 44.3%   — severe generalisation (UVRR = 0.12)
  2. income_bracket    SFS = 61.7%   — high bias (RB = -8.2%)
  3. household_size    SFS = 72.1%   — acceptable but watch variance
  ...
```

#### D3. Suppressed/Removed Columns

If columns were removed during processing:
```
⚪ Suppressed Columns (removed during anonymisation)
  - household_id    (direct identifier — correctly suppressed)
  - exact_address   (high-risk QI — correctly suppressed)
```

---

### SECTION E — Privacy-Utility Trade-off Dashboard

**The centrepiece visualisation. Required for hackathon impact.**

#### E1. Privacy-Utility Radar Chart (Spider Chart)

Six axes, comparing original (blue) vs processed (orange):

```
Axes:
  1. Statistical Accuracy    (SFS score)
  2. Distribution Fidelity   (1 - avg JSD)
  3. Information Content     (avg EPR proximity to 1.0)
  4. Relationship Integrity  (1 - ΔR correlation matrix)
  5. Tail Preservation       (percentile score)
  6. Predictive Power        (avg R² retention)

Display: radar/spider chart
Original = filled blue polygon
Processed = filled orange polygon
```

#### E2. Risk vs Utility Bubble Chart

X-axis: Re-identification risk (from Risk Assessment)
Y-axis: Overall Utility Score (OUS)
One bubble = the original dataset (high risk, utility = 100%)
One bubble = the processed dataset (lower risk, OUS%)
Bubble size = number of records

Draw "acceptable zone" in green: Risk < 20%, Utility > 70%

```
Utility
  100% ●  ← Original (High risk, Full utility)
   84%          ●  ← Processed (Low risk, High utility)
   60%  [ACCEPTABLE ZONE ████████████]
    0%─────────────────────────────── Risk
       0%   20%   40%   60%   80%  100%
```

#### E3. Technique Effectiveness Summary Card

```
┌──────────────────────────────────────────────────────┐
│  Technique: K-Anonymity (k=5, Mondrian)              │
│  ─────────────────────────────────────────────────── │
│  Risk Reduction:  62.3%   ↓ (Better privacy)         │
│  Utility Retained: 84.2%  ✓ (Strong utility)         │
│  Records Suppressed: 23  (2.3%)                      │
│  ─────────────────────────────────────────────────── │
│  VERDICT: ✅ OPTIMAL — Excellent privacy-utility     │
│  balance. Recommended for public release.            │
└──────────────────────────────────────────────────────┘
```

**Verdict logic:**
```python
def get_verdict(ous, risk_reduction, records_suppressed_pct):
    if ous >= 80 and risk_reduction >= 50 and records_suppressed_pct < 5:
        return "✅ OPTIMAL — Excellent privacy-utility balance. Recommended for public release."
    elif ous >= 70 and risk_reduction >= 50:
        return "⚠ ACCEPTABLE — Adequate balance. Minor utility loss tolerable for research use."
    elif ous >= 70 and risk_reduction < 50:
        return "⚠ HIGH UTILITY BUT LOW PROTECTION — Consider stronger parameters."
    elif ous < 70 and risk_reduction >= 50:
        return "❌ OVER-ANONYMISED — Privacy achieved but at severe utility cost. Relax parameters."
    else:
        return "❌ POOR BALANCE — Neither sufficient privacy nor utility achieved. Review technique choice."
```

---

### SECTION F — Attack-wise Utility Impact

**Links Utility Measurement back to the Risk Assessment module. Shows how each attack scenario is affected.**

#### F1. Per-Attack Risk Reduction Table

Pull risk scores from the last Risk Assessment run on the original dataset. Then re-run (or estimate) on the processed dataset.

| Attack | Risk Before | Risk After | Reduction | Utility Cost |
|---|---|---|---|---|
| Prosecutor | 78.4% | 18.2% | -76.8% ↓ | SFS impact: Low |
| Record Linkage | 72.1% | 15.6% | -78.4% ↓ | SFS impact: Low |
| Journalist | 65.3% | 22.1% | -66.2% ↓ | SFS impact: Low |
| Marketer | 81.2% | 24.8% | -69.5% ↓ | SFS impact: Low |
| Attr. Disclosure | 44.2% | 12.3% | -72.2% ↓ | SFS impact: Medium |
| Inference | 38.9% | 19.2% | -50.6% ↓ | SFS impact: Medium |
| Membership | 55.1% | 34.2% | -37.9% ↓ | SFS impact: Low |
| Rec. Linkage | 82.3% | 16.8% | -79.6% ↓ | SFS impact: Low |
| Differencing | 61.2% | 28.4% | -53.6% ↓ | SFS impact: High |
| Model Inversion | 29.4% | 18.1% | -38.4% ↓ | SFS impact: Medium |

**Utility cost per attack** = estimated from which metrics drive each attack:
- Attacks based on QI uniqueness (Prosecutor, Journalist, Rec. Linkage) → cost measured by SFS of QI columns
- Attacks based on SA disclosure (Attr. Disclosure, Inference) → cost measured by EPR of SA columns
- Differencing → cost measured by aggregate query accuracy (mean/count preservation)

#### F2. Residual Risk Banner

If any attack still shows Risk > 20% after processing:
```
⚠ RESIDUAL RISK WARNING
  Membership Inference: 34.2% risk remains above recommended 20% threshold.
  Differencing Attack:  28.4% risk remains above recommended 20% threshold.
  
  Recommendation: Apply Differential Privacy (ε=1.0) in addition to k-anonymity
  to further reduce aggregate query leakage.
```

---

### SECTION G — Compliance Readiness Check

**Maps results to DPDP Act 2023 and NSO data release standards.**

#### G1. DPDP Act 2023 Compliance Checklist

```
┌────────────────────────────────────────────────────────────────────────┐
│  DPDP Act 2023 Compliance — Data Minimisation & Purpose Limitation     │
├──────────────────────────────────────────────────────────────────────  │
│  ✅ Direct Identifiers Removed     Household_ID, Name suppressed       │
│  ✅ Re-identification Risk < 30%   Current risk: 18.2%                 │
│  ✅ Sensitive Attribute Protected  Disease_status: ADR = 12.3%         │
│  ⚠  Utility Preserved > 70%       Current OUS: 84.2% ✓               │
│  ✅ Data Minimisation Applied      23 records suppressed (2.3%)        │
│  ✅ Audit Trail Available          Technique log complete              │
├────────────────────────────────────────────────────────────────────────│
│  Overall Compliance: LIKELY COMPLIANT (5/6 criteria met)              │
└────────────────────────────────────────────────────────────────────────┘
```

#### G2. NSO Microdata Release Readiness

```
NSO Safe Data Criteria:
  □ k ≥ 3 (minimum equivalence class size)      → k_min = 5 ✅
  □ Re-ID risk < 9% (OECD guideline)            → Risk = 18.2% ⚠ (above OECD)
  □ Utility OUS > 70% for research use          → 84.2% ✅
  □ Suppression < 5% of records                 → 2.3% ✅
  □ Sensitive attributes protected (ADR < 20%)  → ADR = 12.3% ✅

Verdict: SUITABLE FOR RESTRICTED ACCESS RELEASE
         Consider additional DP noise for unrestricted public release.
```

---

### SECTION H — Automated Privacy-Utility Report Generation

**Full downloadable PDF/HTML report. This is a mandatory deliverable for Statathon 2025.**

#### H1. Report Trigger

Button in results panel:
```
[📄 Generate Full Report (PDF)]   [📊 Export Data (CSV)]   [🖼 Export Charts (PNG)]
```

#### H2. Report Structure

```
REPORT SECTIONS:

Cover Page
  - Title: "Privacy-Utility Assessment Report"
  - Dataset: {dataset_name}
  - Technique: {technique_applied}
  - Date: {timestamp}
  - Generated by: SafeData Pipeline | AIRAVATA Technologies | Statathon 2025
  - Ministry of Statistics & Programme Implementation, Government of India

Section 1: Executive Summary (1 page)
  - Overall Utility Score: {OUS}% (Grade: {grade})
  - Risk Reduction: {risk_reduction}%
  - Records Processed: {N_original} → {N_processed} ({suppressed} suppressed)
  - Verdict: {verdict text}
  - Key Recommendation: [auto-generated text]

Section 2: Privacy Assessment Before & After (1 page)
  - Table: all 10 attacks, risk before, risk after, reduction
  - Privacy Risk Gauge (before vs after)

Section 3: Statistical Fidelity Analysis (2 pages)
  - All-columns summary table
  - Top 5 most distorted columns with explanation
  - Mean/Median/Std dev comparison table

Section 4: Distribution Analysis (2–3 pages)
  - Key column histograms (top 5 numeric columns by importance)
  - Categorical frequency bar charts (top 3 categorical columns)
  - KS test results table

Section 5: Correlation & Relationship Preservation (1 page)
  - Correlation matrix before (original)
  - Correlation matrix after (processed)
  - Delta correlation heatmap (colour: green = no change, red = destroyed)
  - Frobenius distance: {ΔR}

Section 6: Privacy-Utility Trade-off Visualisation (1 page)
  - Radar chart (spider chart) — before vs after
  - Privacy-Utility bubble chart
  - Technique effectiveness card

Section 7: Compliance Readiness (1 page)
  - DPDP Act 2023 checklist
  - NSO criteria checklist
  - Release recommendation

Section 8: Recommendations & Next Steps (1 page)
  - Auto-generated text based on OUS and residual risks
  - Suggested parameter tuning (if over-anonymised or under-anonymised)
  - Alternative technique suggestions

Appendix A: Raw Metrics Table (all computed values)
Appendix B: Methodology Notes
```

#### H3. Report Auto-Text Generation Logic

```python
def generate_executive_summary(ous, risk_reduction, technique, suppressed_pct):
    grade = get_grade(ous)
    
    summary = f"""
    The SafeData pipeline applied {technique} to the uploaded dataset. 
    The processed dataset achieves an Overall Utility Score of {ous:.1f}% (Grade: {grade}), 
    representing {'excellent' if ous >= 80 else 'adequate' if ous >= 70 else 'limited'} 
    preservation of analytical value.
    
    Re-identification risk was reduced by {risk_reduction:.1f}%, 
    with {suppressed_pct:.1f}% of records suppressed during processing.
    
    {get_verdict(ous, risk_reduction, suppressed_pct)}
    
    Key statistical properties including mean values, variance, and distributional 
    shape are {'well-preserved' if ous >= 80 else 'partially preserved' if ous >= 70 else 'significantly distorted'}.
    The dataset {'is' if ous >= 70 and risk_reduction >= 50 else 'may not be'} 
    suitable for {'public release' if risk_reduction >= 70 else 'restricted research access'}.
    """
    return summary

def generate_recommendations(ous, risk_reduction, worst_columns, residual_attacks):
    recs = []
    
    if ous < 70:
        recs.append(f"Utility is below acceptable threshold. Consider reducing k from current value, "
                    f"or switching from Mondrian to a softer generalisation method.")
    
    if risk_reduction < 50:
        recs.append(f"Privacy protection is insufficient. Increase k parameter or add "
                    f"Differential Privacy (ε ≤ 1.0) as a complementary technique.")
    
    if worst_columns:
        recs.append(f"Columns {worst_columns[:3]} show the highest distortion. "
                    f"Consider applying column-specific suppression thresholds.")
    
    if 'Differencing' in residual_attacks:
        recs.append("Differencing attack risk remains elevated. Add Laplace noise to "
                    "aggregate statistics or apply query auditing.")
    
    return recs
```

---

## 5. UI LAYOUT & DESIGN SPECIFICATION

### 5.1 Full Page Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HEADER: Statathon 2025 | GoI | MoE | MoSPI branding                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  BREADCRUMB: Home > Utility Measurement                                      │
├──────────────────┬──────────────────────────────────────────────────────────┤
│                  │                                                           │
│  LEFT PANEL      │   RESULTS PANEL                                          │
│  (fixed width    │   (scrollable, full width)                               │
│   ~280px)        │                                                           │
│                  │   [A] SUMMARY DASHBOARD (top, always visible)            │
│  ⟳ Compare Data  │   ──────────────────────────────────────────────────     │
│                  │                                                           │
│  Original        │   TABS: [Statistical] [Distributions] [Correlations]    │
│  Dataset         │         [Privacy-Utility] [Attack Impact] [Compliance]  │
│  [dropdown]      │                                                           │
│                  │   [Active tab content]                                   │
│  Processed       │                                                           │
│  Operation       │                                                           │
│  [dropdown]      │                                                           │
│                  │   [📄 Generate Full Report (PDF)]                        │
│  [Measure        │                                                           │
│   Utility]       │                                                           │
│                  │                                                           │
└──────────────────┴──────────────────────────────────────────────────────────┘
```

### 5.2 Loading State

While computing (can take 2–8 seconds for large datasets):

```
┌────────────────────────────────────┐
│  ⏳ Computing Utility Metrics...   │
│                                    │
│  ████████████░░░░░░░░  62%         │
│                                    │
│  ✅ Statistical Fidelity Done      │
│  ✅ Distribution Similarity Done   │
│  ⏳ Computing Correlations...      │
│  ○  Generating Report...           │
└────────────────────────────────────┘
```

Implement as a step-by-step progress tracker. Each metric family completes one step.

### 5.3 Color Palette (consistent with existing system)

```css
--utility-excellent: #16a34a;   /* green-600 */
--utility-good:      #d97706;   /* amber-600 */
--utility-poor:      #dc2626;   /* red-600 */
--chart-original:    #3b82f6;   /* blue-500 */
--chart-processed:   #f97316;   /* orange-500 */
--chart-delta:       #8b5cf6;   /* purple-500 */
--bg-card:           #ffffff;
--bg-section:        #f8fafc;
--border:            #e2e8f0;
```

### 5.4 Chart Library

Use **Chart.js** (already available in the project) or **Recharts** if React is used.

For the QQ-plot and KDE charts, use **D3.js** (kernel density estimation requires D3).

All charts must be:
- Exportable as PNG (right-click > Save or download button)
- Responsive (scale to container width)
- Labelled with title, axis labels, and legend
- Include data tooltips on hover

---

## 6. DATA FLOW & STATE MANAGEMENT

### 6.1 Computation Pipeline (ordered)

```python
def run_utility_measurement(original_df, processed_df, metadata):

    # Step 0: Validate
    common_cols, warnings = validate_datasets(original_df, processed_df)
    numeric_cols     = [c for c in common_cols if original_df[c].dtype in ['int64','float64']]
    categorical_cols = [c for c in common_cols if original_df[c].dtype == 'object']

    # Step 1: Statistical Fidelity (per numeric column)
    fidelity_results = {}
    for col in numeric_cols:
        fidelity_results[col] = compute_statistical_fidelity(
            original_df[col], processed_df[col]
        )
    sfs_global = mean([r['sfs'] for r in fidelity_results.values()])

    # Step 2: Distribution Similarity
    dist_results = {}
    for col in numeric_cols:
        dist_results[col] = {
            'ks':          ks_2samp(original_df[col].dropna(), processed_df[col].dropna()),
            'jsd':         compute_jsd(original_df[col], processed_df[col], bins=20),
            'wasserstein': compute_wasserstein(original_df[col], processed_df[col]),
        }
    for col in categorical_cols:
        dist_results[col] = {
            'hi':          compute_histogram_intersection(original_df[col], processed_df[col]),
            'chi2':        compute_chi2(original_df[col], processed_df[col]),
        }

    # Step 3: Information Content
    info_results = {}
    for col in common_cols:
        info_results[col] = {
            'entropy_orig': compute_entropy(original_df[col]),
            'entropy_proc': compute_entropy(processed_df[col]),
            'epr':          compute_entropy(processed_df[col]) / (compute_entropy(original_df[col]) + 1e-10),
            'uvrr':         original_df[col].nunique() / (processed_df[col].nunique() + 1e-10)
                            if processed_df[col].nunique() > 0 else 0,
        }

    # Step 4: Correlation Preservation
    R_orig = original_df[numeric_cols].corr()
    R_proc = processed_df[numeric_cols].corr()
    delta_R = np.linalg.norm(R_orig.values - R_proc.values, 'fro') / (np.linalg.norm(R_orig.values, 'fro') + 1e-10)

    # Step 5: Predictive Utility (lightweight)
    r2_results = compute_r2_retention(original_df[numeric_cols], processed_df[numeric_cols])

    # Step 6: Composite OUS
    ds_score = mean([1 - r['jsd'] for r in dist_results.values() if 'jsd' in r])
    ic_score = mean([clamp(r['epr'], 0, 1) for r in info_results.values()])
    cp_score = 1 - delta_R
    pu_score = r2_results['mean_retention']

    ous = (
        sfs_global * 0.30 +
        ds_score   * 0.25 +
        ic_score   * 0.20 +
        cp_score   * 0.15 +
        pu_score   * 0.10
    ) * 100

    # Step 7: Assemble result object for frontend
    return {
        'ous': round(ous, 1),
        'grade': get_grade(ous),
        'sfs': sfs_global,
        'fidelity': fidelity_results,
        'distribution': dist_results,
        'information': info_results,
        'correlation': {'delta_R': delta_R, 'R_orig': R_orig, 'R_proc': R_proc},
        'predictive': r2_results,
        'warnings': warnings,
    }
```

### 6.2 Helper Functions

```python
def compute_jsd(series_a, series_b, bins=20):
    """Jensen-Shannon Divergence between two numeric series"""
    import numpy as np
    from scipy.special import rel_entr
    
    # Use original's range for binning
    range_min, range_max = series_a.min(), series_a.max()
    bin_edges = np.linspace(range_min, range_max, bins + 1)
    
    p, _ = np.histogram(series_a.dropna(), bins=bin_edges, density=True)
    q, _ = np.histogram(series_b.dropna(), bins=bin_edges, density=True)
    
    # Normalise
    p = p / (p.sum() + 1e-10)
    q = q / (q.sum() + 1e-10)
    
    m = 0.5 * (p + q)
    jsd = 0.5 * np.sum(rel_entr(p, m)) + 0.5 * np.sum(rel_entr(q, m))
    return float(np.clip(jsd, 0, 1))

def compute_entropy(series):
    """Shannon entropy of a column"""
    import numpy as np
    if pd.api.types.is_numeric_dtype(series):
        counts, _ = np.histogram(series.dropna(), bins=10)
    else:
        counts = series.value_counts().values
    probs = counts / (counts.sum() + 1e-10)
    probs = probs[probs > 0]
    return float(-np.sum(probs * np.log2(probs)))

def compute_histogram_intersection(series_a, series_b):
    """Histogram intersection for categorical columns"""
    cats = set(series_a.unique()) | set(series_b.unique())
    total_a = len(series_a)
    total_b = len(series_b)
    hi = sum(
        min(
            series_a.value_counts().get(c, 0) / total_a,
            series_b.value_counts().get(c, 0) / total_b
        )
        for c in cats
    )
    return float(hi)

def compute_r2_retention(orig_numeric, proc_numeric):
    """Lightweight R² retention using pairwise correlations as proxy"""
    from sklearn.linear_model import LinearRegression
    import numpy as np
    
    retentions = []
    cols = orig_numeric.columns.tolist()
    
    for target in cols:
        features = [c for c in cols if c != target]
        if not features:
            continue
        
        try:
            X_o = orig_numeric[features].fillna(0).values
            y_o = orig_numeric[target].fillna(0).values
            r2_o = np.corrcoef(X_o.T, y_o)[-1, :-1]
            r2_o_score = float(np.mean(r2_o**2))
            
            X_p = proc_numeric[features].fillna(0).values
            y_p = proc_numeric[target].fillna(0).values
            r2_p = np.corrcoef(X_p.T, y_p)[-1, :-1]
            r2_p_score = float(np.mean(r2_p**2))
            
            retention = r2_p_score / (r2_o_score + 1e-10)
            retentions.append(min(retention, 1.0))
        except Exception:
            continue
    
    return {
        'per_column': dict(zip(cols, retentions)),
        'mean_retention': float(np.mean(retentions)) if retentions else 0.5
    }
```

---

## 7. BACKEND API ENDPOINTS

If the project uses a REST backend (Express/FastAPI), add these endpoints:

```
POST /api/utility/measure
  Body: { original_dataset_id, processed_operation_id }
  Response: { ous, grade, fidelity, distribution, information, correlation, predictive, warnings }

GET /api/utility/results/{result_id}
  Response: same as above (cached result)

POST /api/utility/report/generate
  Body: { result_id, format: 'pdf' | 'html' }
  Response: { download_url }

GET /api/utility/export/csv/{result_id}
  Response: CSV file of all per-column metrics
```

---

## 8. INTEGRATION WITH EXISTING MODULES

### 8.1 Risk Assessment Integration

When loading the Utility Measurement page, auto-fetch the last Risk Assessment result for the selected original dataset:
```javascript
const riskResults = await fetchLastRiskAssessment(original_dataset_id);
const riskBefore  = riskResults?.prosecutor_risk ?? null;
// After processing: re-run risk on processed dataset (lightweight, single attack)
const riskAfter   = await runLightweightRiskCheck(processed_dataset_id);
const riskReduction = riskBefore ? ((riskBefore - riskAfter) / riskBefore * 100) : null;
```

### 8.2 Privacy Enhancement Integration

The "Processed Operation" dropdown should pull from the Privacy Enhancement module's operation log:
```javascript
const operations = await fetchPrivacyEnhancementOperations();
// Each: { id, technique, params, dataset_id, output_dataset_id, timestamp }
```

### 8.3 Reports Module Integration

The full generated PDF should also be accessible from the Reports page (existing module):
```
Reports page → "Utility Report for {dataset} — {timestamp}" → Download PDF
```

---

## 9. SPECIAL HANDLING FOR HOUSEHOLD MICRODATA

Given the Statathon 2025 dataset context (NSO household survey microdata), add these specific checks:

### 9.1 Survey Aggregate Preservation

For microdata, key aggregate statistics used by researchers:
```python
SURVEY_AGGREGATES = {
    'state_level_means':    group by state → compute mean of numeric cols,
    'district_level_counts': group by district → compute counts,
    'cross_tabulations':    2×2 contingency tables for key categorical pairs,
}

for agg_name, agg_fn in SURVEY_AGGREGATES.items():
    orig_agg = agg_fn(original_df)
    proc_agg = agg_fn(processed_df)
    
    agg_preservation[agg_name] = {
        'mae':     MAE(orig_agg, proc_agg),
        'rmse':    RMSE(orig_agg, proc_agg),
        'r2':      R²(orig_agg, proc_agg),
    }
```

Display these as "Survey-Level Aggregate Accuracy" — critical for NSO research validity.

### 9.2 Income/Expenditure Specific Metrics

```python
# For income/expenditure columns:
GINI_ORIGINAL  = gini_coefficient(original_df['income'])
GINI_PROCESSED = gini_coefficient(processed_df['income'])
GINI_DELTA     = abs(GINI_ORIGINAL - GINI_PROCESSED)

# Lorenz curve comparison:
lorenz_orig = compute_lorenz_curve(original_df['income'])
lorenz_proc = compute_lorenz_curve(processed_df['income'])

# Display both Lorenz curves on the same chart
# Compute area between curves = utility loss in inequality measurement
```

### 9.3 Gini Coefficient Formula

```
Sort income values: x₁ ≤ x₂ ≤ ... ≤ xₙ

Gini = (2 × Σᵢ (i × xᵢ)) / (n × Σᵢ xᵢ) - (n+1)/n
```

---

## 10. EXPORT SPECIFICATIONS

### 10.1 CSV Export (Raw Metrics)

```
Columns: column_name, data_type, orig_mean, proc_mean, relative_bias_pct,
         orig_std, proc_std, variance_ratio, nmae, ks_statistic, ks_pvalue,
         jsd, wasserstein_norm, entropy_orig, entropy_proc, epr, uvrr, sfs
```

### 10.2 JSON Export (Full Result Object)

Full structured JSON matching the computation pipeline output in Section 6.1.

### 10.3 PNG Chart Export

For each chart, add a download button. On click:
```javascript
const canvas = document.querySelector(`#chart-${chartId} canvas`);
const link = document.createElement('a');
link.download = `${chartId}_utility_chart.png`;
link.href = canvas.toDataURL('image/png');
link.click();
```

---

## 11. ACCESSIBILITY & PROFESSIONAL DESIGN NOTES

- All tables must be sortable by clicking column headers
- All charts must have aria-labels for screen reader accessibility
- Color must not be the only indicator — also use icons (✅ ⚠ ❌) and text labels
- Mobile responsive: stack panels vertically on screens < 768px
- Dark mode: respect system `prefers-color-scheme` (use CSS variables already defined in the system)
- Print-friendly: hide sidebars when printing; full content visible
- Loading skeleton UI: show placeholder bars while computing

---

## 12. SUMMARY — WHAT TO BUILD (PRIORITY ORDER)

1. **Input Panel** — dropdowns + validation (2.1, 2.3)
2. **Core Metric Engine** — all formulas in Section 3 (backend)
3. **Section A — Summary Dashboard** — 4 cards + verdict (Section 4, SECTION A)
4. **Section B — Statistical Fidelity** — table + per-column expand (Section B)
5. **Section C — Distribution Charts** — histogram + KDE overlays (Section C)
6. **Section E — Privacy-Utility Trade-off** — radar chart + bubble chart (Section E)
7. **Section D — Column Heatmap** — full metric matrix (Section D)
8. **Section F — Attack Impact Table** (Section F)
9. **Section G — Compliance Checklist** (Section G)
10. **Section H — PDF Report Generator** (Section H)
11. **Section: Survey Aggregates** — household data specific (Section 9)

---

*SafeData Pipeline | Utility Measurement Module Specification v1.0*
*AIRAVATA Technologies | Statathon 2025 | MoE Innovation Cell, Government of India*
*Document prepared: June 2026*
