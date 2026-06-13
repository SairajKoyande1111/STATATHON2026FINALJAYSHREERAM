# Differential Privacy — Complete Implementation Guide
### SafeData Pipeline | Privacy Enhancement Module
> For Replit Agent: This document covers full mathematical foundations, algorithm logic, UI sidebar requirements, metric computations, and report generation for the Differential Privacy tab.

---

## 1. MATHEMATICAL FOUNDATIONS

### 1.1 Core Definition

A randomised mechanism **M: D → R** satisfies **(ε, δ)-Differential Privacy** if for all pairs of adjacent datasets D, D' differing by one record, and for all measurable output sets S ⊆ R:

```
Pr[M(D) ∈ S] ≤ exp(ε) · Pr[M(D') ∈ S] + δ
```

- When **δ = 0**, this is **pure ε-DP** (strictest guarantee).
- When **δ > 0**, this is **(ε, δ)-DP** (approximate DP).
- **ε (epsilon)**: Privacy budget. Lower = more private. ε ≤ 1 is strong DP; ε > 5 is weak DP.
- **δ (delta)**: Probability of catastrophic failure. Should be ≤ 1/n² where n = dataset size.

### 1.2 Sensitivity

**Global L1 Sensitivity** of a function f: D → ℝᵈ:
```
Δf = max_{D,D' adjacent} ‖f(D) − f(D')‖₁
```

For **column-level perturbation** (numeric), sensitivity = column range:
```
Δf_col = max_value − min_value   (clamped to known domain)
```

For **counting queries**:
```
Δf = 1    (adding/removing one record changes count by at most 1)
```

**Global L2 Sensitivity** (used for Gaussian Mechanism):
```
Δ₂f = max_{D,D' adjacent} ‖f(D) − f(D')‖₂
```

---

## 2. MECHANISM ALGORITHMS

### 2.1 Laplace Mechanism

**Use case:** Numeric columns, pure ε-DP guarantee.

**Mathematical definition:**
```
M(x) = f(x) + Lap(0, Δf/ε)
```

Where `Lap(0, b)` is the Laplace distribution with:
- Mean = 0
- Scale parameter b = Δf/ε
- PDF: p(z) = (1/2b) · exp(−|z|/b)
- Variance = 2b²

**Noise generation algorithm:**
```
Algorithm: Laplace_Noise_Sample(b)
  1. Sample u ~ Uniform(−0.5, 0.5)
  2. Return −b · sign(u) · ln(1 − 2|u|)
```

Or equivalently using exponential distribution:
```
  1. Sample e₁ ~ Exp(1/b), e₂ ~ Exp(1/b) independently
  2. Return e₁ − e₂
```

**Column-wise application:**
```python
for each numeric column c in target_columns:
    sensitivity_c = clamp_range[c]  # user-defined or auto-detected from data
    scale_c = sensitivity_c / epsilon
    for each value x in column c:
        noise = laplace_sample(scale=scale_c)
        x_protected = x + noise
        # Optional: clamp back to valid range
        x_protected = clamp(x_protected, min_c, max_c)
```

**Privacy guarantee:** ε-DP (pure differential privacy)

**Why Laplace?**
- Optimal for L1 sensitivity queries
- Tight privacy bound (no δ needed)
- Efficient to sample
- Best single-column perturbation technique

---

### 2.2 Gaussian Mechanism

**Use case:** Numeric columns, (ε, δ)-DP with better composition properties.

**Mathematical definition:**
```
M(x) = f(x) + N(0, σ²)
```

**Sigma calibration (analytic):**
```
σ ≥ Δ₂f · √(2 ln(1.25/δ)) / ε
```

For ε = 1, δ = 1×10⁻⁵:
```
σ ≥ Δ₂f · √(2 · ln(125000)) / 1
σ ≥ Δ₂f · √(2 · 11.736)
σ ≥ Δ₂f · 4.845
```

**Tighter bound (Balle & Wang, 2018 — analytic Gaussian mechanism):**
```
σ* = Δ₂f · calibrate_analytic_gaussian(ε, δ)
```
Using Φ (standard normal CDF):
```
σ* = min σ such that: Φ(Δ/(2σ) − εσ/Δ) − exp(ε)·Φ(−Δ/(2σ) − εσ/Δ) ≤ δ
```

**Algorithm:**
```python
def gaussian_mechanism(x, sensitivity, epsilon, delta):
    sigma = sensitivity * sqrt(2 * log(1.25 / delta)) / epsilon
    noise = normal(mean=0, std=sigma)
    return x + noise
```

**Privacy guarantee:** (ε, δ)-DP

**Composition advantage:**
- Gaussian composes better than Laplace under advanced composition (Rényi DP)
- Use when applying multiple queries on the same dataset

---

### 2.3 Exponential Mechanism

**Use case:** Categorical columns only. Outputs a value from a discrete set with probability proportional to utility.

**Mathematical definition:**
```
Pr[M(D) = r] ∝ exp(ε · u(D, r) / (2Δu))
```

Where:
- `r` = candidate output value
- `u(D, r)` = utility score of output r on dataset D
- `Δu` = sensitivity of utility function = max_{D,D',r} |u(D,r) − u(D',r)|

**For categorical frequency preservation:**
```
u(D, r) = count(r in D) / n    # normalised frequency as utility
Δu = 1/n                        # adding one record changes max frequency by 1/n
```

**Sampling algorithm:**
```python
def exponential_mechanism(values, epsilon, utility_fn, delta_u):
    candidates = unique(values)
    scores = [utility_fn(c) for c in candidates]
    weights = [exp(epsilon * s / (2 * delta_u)) for s in scores]
    probs = weights / sum(weights)
    return random_choice(candidates, probabilities=probs)
```

**Privacy guarantee:** ε-DP

**Important constraints:**
- Only applies to CATEGORICAL columns (string, nominal, ordinal)
- For each row, independently sample a new categorical value from the exponential distribution
- Sensitivity must be computed per-column based on number of unique categories

---

## 3. ADVANCED DIFFERENTIAL PRIVACY FEATURES

### 3.1 Privacy Budget Accounting

**Sequential Composition Theorem:**
If M₁ satisfies ε₁-DP and M₂ satisfies ε₂-DP, then (M₁, M₂) satisfies (ε₁ + ε₂)-DP.

**Advanced Composition (for k mechanisms, each ε₀-DP):**
```
Total ε = ε₀√(2k ln(1/δ')) + kε₀(eᵉ⁰ − 1)
```
This gives tighter budget than naive summation.

**Rényi Differential Privacy (RDP) — most accurate:**
- Convert each mechanism to RDP: M(α) = αε²/(2σ²) for Gaussian
- Sum RDP budgets across queries
- Convert back to (ε, δ)-DP: ε_final = M(α) + log(1/δ)/(α−1)

**Implementation recommendation:**
```python
# Track composition automatically
class PrivacyAccountant:
    def __init__(self, total_budget_epsilon, total_budget_delta):
        self.total_epsilon = total_budget_epsilon
        self.total_delta = total_budget_delta
        self.spent_epsilon = 0
        self.spent_delta = 0
        self.operations = []
    
    def check_budget(self, mechanism, epsilon, delta=0):
        new_total_e, new_total_d = self.compose(epsilon, delta)
        if new_total_e > self.total_epsilon:
            raise BudgetExhausted(f"Would exceed ε budget: {new_total_e:.4f} > {self.total_epsilon}")
        return True
    
    def record_operation(self, mechanism, epsilon, delta, columns):
        self.spent_epsilon += epsilon
        self.spent_delta += delta
        self.operations.append({
            "mechanism": mechanism,
            "epsilon": epsilon,
            "delta": delta,
            "columns": columns,
            "timestamp": now()
        })
```

### 3.2 Local vs. Global DP

- **Global DP** (current implementation): Trusted curator adds noise to aggregate. Better utility.
- **Local DP**: Each respondent randomises their own record before sharing. No trusted curator needed.

**Local DP — Randomised Response for Binary:**
```
M(x) = x           with probability (eᵉ)/(eᵉ + 1)
M(x) = 1−x         with probability 1/(eᵉ + 1)
```

**RAPPOR (for categorical):**
```
1. Encode x as one-hot vector B
2. For each bit bᵢ: flip with probability 1/2 · (eᵉ/² − 1)/(eᵉ/² + 1)
3. Add second round of randomisation
```

---

## 4. SIDEBAR CONFIGURATION PANEL (UI Requirements)

The current sidebar only shows "Target Columns". The following sections MUST be added to the sidebar panel for Differential Privacy:

### 4.1 Section: Dataset Overview
```
┌─────────────────────────────────────┐
│ DATASET OVERVIEW                    │
│ Total Rows:         [n]             │
│ Total Columns:      [k]             │
│ Numeric Columns:    [n_num]         │
│ Categorical Cols:   [n_cat]         │
│ Missing Values:     [%]             │
│ Quasi-Identifiers:  [auto-detected] │
└─────────────────────────────────────┘
```

### 4.2 Section: Target Columns (Enhanced)
```
┌─────────────────────────────────────┐
│ TARGET COLUMNS                      │
│ ○ All Columns (auto)                │
│ ○ Select Specific Columns           │
│                                     │
│ Column        Type    Sensitivity   │
│ ☐ MLT         Num     [auto/manual] │
│ ☐ NSC         Cat     —            │
│ ☐ Blank       Num     [auto/manual] │
│ ☐ Level       Cat     —            │
│ ☐ Round       Cat     —            │
│ ☐ State       Cat     —            │
│                                     │
│ [Select All]  [Select None]         │
│ [Auto-detect Numerics]              │
└─────────────────────────────────────┘
```

### 4.3 Section: Privacy Budget Manager
```
┌─────────────────────────────────────┐
│ PRIVACY BUDGET (ε)                  │
│ ┌──────────────────────────────┐    │
│ │  0.1  0.5  [1.0]  2.0  5.0  │    │
│ └──────────────────────────────┘    │
│ Slider: [═══════●════════] 1.0      │
│                                     │
│ Interpretation:                     │
│ ● ε < 0.5  : Very Strong Privacy    │
│ ● ε = 1.0  : Strong Privacy ✓      │
│ ● ε = 2.0  : Moderate Privacy      │
│ ● ε > 5.0  : Weak Privacy ⚠        │
│                                     │
│ Total Budget Spent: 0.0 / 1.0       │
│ Remaining:          1.0             │
│ [Budget Tracker Visualisation]      │
└─────────────────────────────────────┘
```

### 4.4 Section: Sensitivity Configuration
```
┌─────────────────────────────────────┐
│ SENSITIVITY SETTINGS                │
│                                     │
│ ○ Auto-detect from data range       │
│ ○ Manual per-column override        │
│                                     │
│ Global Clipping Strategy:           │
│ ○ Min-Max Range                     │
│ ○ IQR-based (outlier robust)        │
│ ○ Percentile [1%–99%]               │
│ ○ Manual domain bounds              │
│                                     │
│ Outlier Handling:                   │
│ ○ Clip before noise (recommended)   │
│ ○ No clipping                       │
└─────────────────────────────────────┘
```

### 4.5 Section: Composition & Advanced Options
```
┌─────────────────────────────────────┐
│ COMPOSITION SETTINGS                │
│                                     │
│ Privacy Accountant:                 │
│ ○ Basic (sequential)                │
│ ● Advanced (moments accountant)     │
│ ○ Rényi DP (tightest)               │
│                                     │
│ Multiple Mechanisms:                │
│ ○ Apply single mechanism            │
│ ○ Laplace (numeric) +               │
│   Exponential (categorical)         │
│                                     │
│ Post-processing:                    │
│ ☑ Clamp output to valid range       │
│ ☐ Round integers back to int        │
│ ☑ Preserve column types             │
└─────────────────────────────────────┘
```

### 4.6 Section: Risk Preview (before applying)
```
┌─────────────────────────────────────┐
│ ESTIMATED IMPACT PREVIEW            │
│                                     │
│ Expected Information Loss:  ~9–15%  │
│ Expected Noise Magnitude:           │
│   MLT: ±204,458 (scale = Δf/ε)     │
│   Blank: ±0.45                      │
│                                     │
│ Utility Preservation Est.:          │
│   Mean Accuracy:     ~95%           │
│   Distribution KL:   ~0.12          │
│                                     │
│ Re-ID Risk After DP:                │
│   Estimated: < 5%                   │
└─────────────────────────────────────┘
```

### 4.7 Section: Differential Privacy Mode
```
┌─────────────────────────────────────┐
│ DP MODE                             │
│ ○ Global DP (trusted curator)       │
│ ○ Local DP (per-record randomise)   │
│                                     │
│ Random Seed (reproducibility):      │
│ [___42___]  ☑ Set seed              │
└─────────────────────────────────────┘
```

---

## 5. METRICS TO COMPUTE AND DISPLAY

### 5.1 Core Privacy Metrics

| Metric | Formula | Display |
|--------|---------|---------|
| Epsilon spent | Sum of per-column ε | e.g., `1.0` |
| Delta used | Per mechanism | `1×10⁻⁵` or `0` |
| Noise scale (b) | `Δf / ε` | per column |
| Columns perturbed | Count of modified cols | `6` |
| Privacy guarantee | Type | `ε-DP (ε=1)` |

### 5.2 Utility / Information Loss Metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Mean Absolute Error (MAE)** | `(1/n) Σ |x_orig − x_dp|` | Average distortion per value |
| **Mean Squared Error (MSE)** | `(1/n) Σ (x_orig − x_dp)²` | Penalises large errors |
| **RMSE** | `√MSE` | In original units |
| **Mean Relative Error** | `(1/n) Σ |x_orig − x_dp| / |x_orig|` | Percentage error |
| **Wasserstein Distance** | Earth-mover distance between original and DP distributions | Distribution fidelity |
| **KL Divergence** | `Σ p(x) log(p(x)/q(x))` | Statistical difference |
| **Hellinger Distance** | `(1/√2) √(Σ (√p − √q)²)` | Symmetric divergence |
| **Information Loss %** | `1 − correlation(original, dp)` | Aggregate measure |
| **Global Information Loss (GIL)** | `(distinct_part−1)/(distinct_global−1)` | Per column |

### 5.3 Statistical Preservation Metrics

| Metric | Check |
|--------|-------|
| **Mean preservation** | `|μ_orig − μ_dp| / σ_orig` → should be < 0.05 |
| **Variance ratio** | `σ²_dp / σ²_orig` → expected `1 + 2b²/σ²_orig` |
| **Skewness delta** | `|skew_orig − skew_dp|` |
| **Kurtosis delta** | `|kurt_orig − kurt_dp|` |
| **Correlation matrix preservation** | Frobenius norm of `(C_orig − C_dp)` |
| **Quantile error** | MAE across 10th/25th/50th/75th/90th percentiles |

### 5.4 Re-identification Risk Metrics (post-DP)

| Metric | Description |
|--------|-------------|
| **k-Anonymity (post-DP)** | Minimum group size after perturbation |
| **Record linkage probability** | Probability of correctly linking a dp record to original |
| **Membership inference accuracy** | How well an adversary can guess if a record was in training set |
| **Attribute disclosure risk** | Risk that a sensitive attribute can be inferred |

### 5.5 Mechanism-Specific Metrics

**Laplace:**
- Noise scale b = Δf/ε (per column)
- Expected |noise| = b
- 95% of noise within ±3b

**Gaussian:**
- σ = Δ₂f · √(2 ln(1.25/δ)) / ε
- 95% of noise within ±1.96σ
- Signal-to-Noise Ratio (SNR) = μ / σ

**Exponential:**
- Category shift rate: % of values changed
- Utility preservation: weighted frequency agreement
- Top-1 accuracy: % of records keeping their original category

---

## 6. COMPLETE REPORT STRUCTURE (Post "Apply Technique")

When the user clicks **Apply Technique**, generate a comprehensive downloadable report containing:

### Report Header
```
┌────────────────────────────────────────────────────────────────┐
│  SafeData Privacy Report — Differential Privacy Analysis       │
│  Dataset: [name]     Date: [timestamp]     Mechanism: Laplace  │
│  Generated by: SafeData v1.0 | MoSPI – STATATHON 2025         │
└────────────────────────────────────────────────────────────────┘
```

### Section 1: Executive Summary
- One-paragraph natural language summary
- Privacy guarantee achieved
- Overall information loss (%)
- Recommendation: "Safe for public release" / "Review required"

### Section 2: Configuration Used
| Parameter | Value |
|-----------|-------|
| Mechanism | Laplace |
| Epsilon (ε) | 1.0 |
| Delta (δ) | 0 (pure DP) |
| Target Columns | All numeric (6) |
| Sensitivity Method | Auto (column range) |
| Composition | Sequential |
| Random Seed | 42 |

### Section 3: Privacy Metrics Table
| Column | Type | Sensitivity (Δf) | Noise Scale (b) | ε allocated | Privacy Guarantee |
|--------|------|-----------------|-----------------|-------------|-------------------|
| MLT | Numeric | 1,200,000 | 1,200,000 | 1.0 | ε-DP |
| Blank | Numeric | 0.8 | 0.8 | 1.0 | ε-DP |
| Level | Categorical | — | — | — | Exponential |
| ... | ... | ... | ... | ... | ... |
| **Total** | | | | **1.0** | **ε-DP (ε=1)** |

### Section 4: Information Loss Report
Per-column utility metrics:

| Column | MAE | RMSE | Mean Relative Error | KL Divergence | Wasserstein |
|--------|-----|------|---------------------|---------------|-------------|
| MLT | 204,458 | 289,641 | 4.2% | 0.041 | 0.082 |
| Blank | 0.31 | 0.44 | 8.7% | 0.012 | 0.018 |
| ... | ... | ... | ... | ... | ... |
| **Avg** | — | — | **9.6%** | 0.026 | 0.048 |

### Section 5: Statistical Preservation Summary
For each numeric column, show before/after comparison:

| Statistic | Original | Post-DP | Delta | Status |
|-----------|----------|---------|-------|--------|
| Mean | 312,450 | 312,203 | -0.08% | ✅ Preserved |
| Std Dev | 89,320 | 204,932 | +129% | ⚠ Inflated (by noise) |
| Median | 298,100 | 297,840 | -0.09% | ✅ Preserved |
| Min | 10,000 | −398,240 | N/A | Expected |
| Max | 890,000 | 1,212,450 | N/A | Expected |
| Skewness | 0.42 | 0.38 | −0.04 | ✅ Preserved |

### Section 6: Distribution Comparison Charts
- Histogram overlay: Original vs. Post-DP distribution for each numeric column
- QQ-Plot for normality preservation
- Box plot comparison
- Correlation heatmap: Original vs. Post-DP

### Section 7: Noise Characterisation
For each column:
```
Column: MLT
  Mechanism:         Laplace
  Noise Scale (b):   204,458.46
  Expected |noise|:  204,458.46
  95th pct noise:    ±613,375
  Actual avg noise:  [computed]
  SNR:               1.53
```

### Section 8: Re-Identification Risk Assessment (Post-DP)
| Risk Type | Before DP | After DP | Reduction |
|-----------|-----------|----------|-----------|
| k-Anonymity (min k) | 1 | 1 (categorical unchanged) | — |
| Record Linkage Probability | 0.82 | 0.14 | 83% |
| Attribute Disclosure Risk | HIGH | LOW | ✅ |
| Membership Inference | 0.71 | 0.51 | 28% |

### Section 9: Full Output Table
Display ALL 100 records with columns:
- Original value (for reference, admin view only)
- Protected value
- Noise added
- % change

Columns visible in table:
```
| Row | MLT_orig | MLT_dp | noise | % | NSC | NSS | Blank_orig | Blank_dp | ... |
```

**Buttons below table:**
- `[↓ Download CSV (100 records)]` — protected dataset only
- `[↓ Download Full Report (HTML)]`
- `[↓ Download Report (PDF)]`
- `[↓ Download Audit Trail (JSON)]` — includes all parameters, timestamps, random seed

### Section 10: Audit Trail
```json
{
  "run_id": "dp_20260613_184800",
  "mechanism": "laplace",
  "epsilon": 1.0,
  "delta": 0,
  "columns_perturbed": ["MLT", "Blank", "Level_encoded", ...],
  "sensitivity": {"MLT": 1200000, "Blank": 0.8},
  "noise_scale": {"MLT": 1200000, "Blank": 0.8},
  "random_seed": 42,
  "records_processed": 100,
  "records_suppressed": 0,
  "execution_time_ms": 7,
  "information_loss_pct": 9.6,
  "timestamp": "2026-06-13T18:48:00Z",
  "analyst": "QE Admin",
  "dataset": "Household_characteristics_100ro...",
  "privacy_guarantee": "ε-DP (ε = 1.0)"
}
```

### Section 11: Recommendations
Auto-generate based on results:
```
✅ Privacy budget ε = 1.0 provides strong differential privacy.

⚠️  Columns MLT and MLT_SR have very high sensitivity (range > 1M). 
    Consider normalising these columns before applying DP, or use a 
    smaller epsilon for these columns only.

💡 Recommendation: For public release, consider ε = 0.5 for stronger 
    protection. Current ε = 1.0 is suitable for research partner access.

⚠️  Categorical columns (NSC, NSS, Level, State) were not perturbed by 
    Laplace. Apply Exponential Mechanism to these columns for complete DP.

ℹ️  With 100 records, set δ ≤ 1×10⁻⁴ for practical (ε,δ)-DP.
```

---

## 7. IMPLEMENTATION ALGORITHM (Full Pipeline)

```python
def apply_differential_privacy(dataset, config):
    """
    Full DP pipeline
    
    config = {
        "mechanism": "laplace" | "gaussian" | "exponential",
        "epsilon": float,          # e.g., 1.0
        "delta": float,            # 0 for pure DP, 1e-5 for gaussian
        "target_columns": list,    # or "all"
        "sensitivity_mode": "auto" | "manual",
        "sensitivity_values": dict,  # column -> value
        "clipping": "minmax" | "iqr" | "percentile",
        "post_clamp": True,
        "random_seed": int
    }
    """
    set_seed(config["random_seed"])
    accountant = PrivacyAccountant(config["epsilon"])
    results = {}
    
    for col in config["target_columns"]:
        col_type = detect_type(dataset[col])
        
        if col_type == "numeric" and config["mechanism"] in ["laplace", "gaussian"]:
            # Step 1: Compute sensitivity
            if config["sensitivity_mode"] == "auto":
                lo, hi = compute_clipping_bounds(dataset[col], config["clipping"])
                sensitivity = hi - lo
            else:
                sensitivity = config["sensitivity_values"][col]
            
            # Step 2: Clip data
            clipped = clip(dataset[col], lo, hi)
            
            # Step 3: Add noise
            if config["mechanism"] == "laplace":
                accountant.check(col, config["epsilon"])
                scale = sensitivity / config["epsilon"]
                noise = laplace_noise(n=len(clipped), scale=scale)
            elif config["mechanism"] == "gaussian":
                accountant.check(col, config["epsilon"], config["delta"])
                sigma = sensitivity * sqrt(2 * log(1.25 / config["delta"])) / config["epsilon"]
                noise = gaussian_noise(n=len(clipped), sigma=sigma)
            
            protected = clipped + noise
            
            # Step 4: Post-clamp (optional)
            if config["post_clamp"]:
                protected = clip(protected, lo, hi)
            
            results[col] = {
                "protected": protected,
                "noise": noise,
                "sensitivity": sensitivity,
                "scale": scale if mechanism == "laplace" else sigma,
                "epsilon_used": config["epsilon"]
            }
        
        elif col_type == "categorical" and config["mechanism"] == "exponential":
            # Exponential mechanism for categorical
            protected = []
            categories = dataset[col].unique()
            freq = dataset[col].value_counts(normalize=True)
            delta_u = 1 / len(dataset)
            
            for _ in range(len(dataset)):
                utilities = [freq.get(c, 0) for c in categories]
                weights = [exp(config["epsilon"] * u / (2 * delta_u)) for u in utilities]
                probs = normalize(weights)
                protected.append(random_choice(categories, probs))
            
            results[col] = {"protected": protected}
    
    # Compute metrics
    metrics = compute_all_metrics(dataset, results)
    
    # Generate report
    report = generate_report(dataset, results, metrics, config, accountant)
    
    return {
        "protected_dataset": assemble_dataset(dataset, results),
        "metrics": metrics,
        "report": report,
        "audit_trail": accountant.get_log()
    }
```

---

## 8. REPORT GENERATION (HTML + CSV Output)

### HTML Report Template Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>SafeData DP Report — [Dataset] — [Date]</title>
  <style>/* Government of India branding, MoSPI colors */</style>
</head>
<body>
  <!-- Header with MoSPI logo, STATATHON branding -->
  
  <!-- Section 1: Executive Summary Card -->
  <div class="summary-card">
    <div class="metric">Information Loss: 9.6% (LOW)</div>
    <div class="metric">Records Protected: 100/100</div>
    <div class="metric">Privacy Guarantee: ε-DP (ε=1.0)</div>
    <div class="metric">Mechanism: Laplace</div>
  </div>
  
  <!-- Section 2: Configuration Table -->
  
  <!-- Section 3: Per-Column Privacy Metrics Table -->
  
  <!-- Section 4: Statistical Comparison Table (before/after) -->
  
  <!-- Section 5: Distribution Charts (inline SVG/Chart.js) -->
  
  <!-- Section 6: Re-ID Risk Table -->
  
  <!-- Section 7: Full Output Table (all 100 records) -->
  <table class="output-table">
    <thead>
      <tr>
        <th>Row</th>
        <th>MLT (original)</th>
        <th>MLT (protected)</th>
        <th>Noise</th>
        <!-- ... all columns ... -->
      </tr>
    </thead>
    <tbody>
      <!-- 100 rows -->
    </tbody>
  </table>
  
  <!-- Section 8: Recommendations -->
  
  <!-- Section 9: Audit Trail JSON block -->
  
  <!-- Footer: MoSPI | Developed by AIRAVATA Technologies -->
</body>
</html>
```

### CSV Output (protected dataset only)

The downloaded CSV must:
1. Include only **protected column values** (no original values)
2. Retain all non-perturbed columns unchanged
3. Include header row
4. Add a metadata comment at top:
   ```csv
   # SafeData Protected Dataset | Mechanism: Laplace | ε=1.0 | Date: 2026-06-13
   # This file has been processed with Differential Privacy. DO NOT re-identify.
   MLT,NSC,NSS,Blank,Level,Round,State,...
   201844.1591,NSC-14,NSS-7,-0.2572,Level 1,Round 62,Haryana,...
   ```

---

## 9. MECHANISM SELECTION GUIDE (Decision Tree)

```
Is the column NUMERIC?
  YES → 
    Do you need pure DP (strictest)?
      YES → Laplace Mechanism
      NO (composition needed) → Gaussian Mechanism
  NO (CATEGORICAL) →
    Exponential Mechanism

Multiple columns?
  Apply Laplace to all numeric + Exponential to all categorical
  Use Advanced Composition to track total budget
```

---

## 10. KEY IMPLEMENTATION NOTES FOR REPLIT AGENT

1. **Sensitivity must be computed BEFORE noise** — auto-detect from data range or user input
2. **Never use `epsilon = 0`** — validate epsilon > 0 always
3. **Categorical columns must NOT use Laplace** — use Exponential only
4. **Clamp after noise addition** — prevents out-of-range values in output
5. **Set random seed for reproducibility** — add seed field to sidebar
6. **Track privacy budget across multiple "Apply" clicks** — use accountant class
7. **Display noise scale per column** — not just global epsilon
8. **Report must include full 100-record table** — not just first 5 records
9. **Both CSV and HTML report downloads** — CSV = data only, HTML = full analysis report
10. **Gaussian requires delta > 0** — validate delta input, show error if delta = 0 with Gaussian
11. **Information loss % = (sum of relative column losses) / num_columns** — weighted average
12. **Show "Privacy Budget Remaining" dynamically** — update as user adjusts ε slider
13. **Auto-detect column types** — numeric vs categorical, drive mechanism availability accordingly
14. **Audit trail JSON always included** — downloadable alongside CSV and HTML
