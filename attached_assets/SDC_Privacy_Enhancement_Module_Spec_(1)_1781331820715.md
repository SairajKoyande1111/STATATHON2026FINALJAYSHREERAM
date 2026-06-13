# Statistical Disclosure Control (SDC) — Privacy Enhancement Module
## Complete Technical Specification for Replit Integration
### Statathon 2025 | MoE Innovation Cell | AIRAVATA Technologies

---

## OVERVIEW

This document provides the **exact math, algorithms, parameters, configurations, QI/SA requirements, and report content** for all 7 SDC techniques. Every section is written so a Replit agent can implement the real working logic — no dummy code.

### QI / SA — Global Clarification

| Symbol | Full Form | Role | Where Required |
|--------|-----------|------|----------------|
| **QI** | Quasi-Identifiers | Columns that individually are harmless but in combination can re-identify a person (e.g. Age, Gender, District) | K-Anonymity, L-Diversity, T-Closeness |
| **SA** | Sensitive Attribute | The column whose value must be protected from inference (e.g. Income, Religion, Disease status) | L-Diversity, T-Closeness |
| **Target Columns** | Numeric columns to transform | The actual data columns the technique operates on | Rank Swapping, Microaggregation, PRAM, Top/Bottom Coding |

**Rule:** Show QI checkboxes only for techniques that use equivalence classes (K-Anon, L-Div, T-Close). Show SA dropdown only for L-Div and T-Close. Show Target Columns checklist for Rank Swapping, Microaggregation, PRAM, and Top/Bottom Coding.

---

---

# TECHNIQUE 1 — K-ANONYMITY (Mondrian Greedy Partitioning)

## 1.1 Mathematical Foundation

**Formal Definition:**
A dataset D satisfies **k-anonymity** if and only if every equivalence class (group of records sharing the same QI values) has size ≥ k.

```
∀ E ∈ partition(D, QI) : |E| ≥ k
```

**Mondrian Algorithm Core Logic:**
Mondrian recursively splits the dataset along QI dimensions. At each step:
1. Select the QI column with the widest normalised range
2. Find the median value of that column
3. Split records into two halves at the median
4. Recurse on each half
5. Stop when either half would have fewer than k records — at that point, suppress or merge

**Generalisation:**
For a numeric QI column after splitting, all values in a partition are replaced by their **range** [min, max] or **midpoint**:
```
generalised_value = (min_partition + max_partition) / 2   # midpoint generalisation
```
For categorical QI columns, values are replaced by a common ancestor in a hierarchy (or a generic label like "ANY" if no hierarchy is defined).

**Suppression:**
Records that cannot form a group of size k are suppressed (deleted). The suppression limit (S%) caps how many records can be deleted:
```
suppressed_count ≤ ceil(S% × N)
```
If suppression would exceed the limit, increase k or lower k — but always respect the limit.

## 1.2 Algorithm (Pseudocode)

```
function mondrian_k_anonymity(D, QI_cols, k, suppression_limit_pct):
    suppressed = []
    partitions = [D]
    result_partitions = []

    while partitions is not empty:
        P = partitions.pop()

        if len(P) < 2k:
            # Cannot split further
            result_partitions.append(P)
            continue

        # Choose split dimension: widest normalised range
        best_col = None
        best_range = -1
        for col in QI_cols:
            if col is numeric:
                r = (max(P[col]) - min(P[col])) / global_range[col]
            else:
                r = num_unique(P[col]) / global_unique[col]
            if r > best_range:
                best_range = r
                best_col = col

        if best_range == 0:
            result_partitions.append(P)
            continue

        # Split at median
        median = P[best_col].median()
        left  = P[P[best_col] <= median]
        right = P[P[best_col] > median]

        if len(left) < k or len(right) < k:
            result_partitions.append(P)
        else:
            partitions.extend([left, right])

    # Generalise each result partition
    output_rows = []
    suppressed_count = 0

    for part in result_partitions:
        if len(part) < k:
            suppressed_count += len(part)
        else:
            # Replace each QI value with partition range/midpoint
            for col in QI_cols:
                if col is numeric:
                    mid = (part[col].min() + part[col].max()) / 2
                    part[col] = mid
                else:
                    part[col] = most_common_value(part[col])  # or "ANY"
            output_rows.append(part)

    # Apply suppression limit
    max_suppress = ceil(suppression_limit_pct * len(D))
    if suppressed_count > max_suppress:
        # Merge smallest partitions instead of suppressing
        merge_smallest_partitions(result_partitions)

    return concat(output_rows), suppressed_count
```

## 1.3 Parameters & UI Configuration

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| **K Value** | Integer slider | 5 | 2–20 | Minimum group size per equivalence class |
| **Suppression Limit** | % slider | 5% | 0%–20% | Max % of records deleted if ungroupable |
| **QI Columns** | Multi-checkbox | — | All non-ID cols | Columns used to form equivalence classes |
| **Generalisation Method** | Radio | Midpoint | Midpoint / Range / Hierarchy | How QI values are replaced within a partition |

**Required inputs:** QI columns (at least 1). SA not used by K-Anonymity.  
**Target Columns:** Not applicable — K-Anonymity generalises QI columns, not target columns.

## 1.4 Metrics to Compute & Display Post-Application

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Min Equivalence Class Size** | min(|E| for E in partitions) | ≥ k |
| **Average Equivalence Class Size** | mean(|E|) | k to 3k |
| **Number of Equivalence Classes** | count(partitions) | — |
| **Suppression Rate** | suppressed / N × 100 | < suppression_limit |
| **k-Anonymity Satisfied** | min_class_size ≥ k | Boolean |
| **Information Loss (GIL)** | Σ (generalised_range / global_range) / (num_QI × N) | 0 = no loss, 1 = total loss |
| **Records Retained** | N - suppressed | — |

**GIL (Generalised Information Loss):**
```
GIL = (1 / |QI| × N) × Σ_col Σ_record (range_in_partition[col] / global_range[col])
```

## 1.5 Report Content (Generated After Application)

```
=== K-ANONYMITY REPORT ===

Technique       : K-Anonymity (Mondrian Greedy Partitioning)
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]
Records (Input) : N
Records (Output): N - suppressed

--- Parameters Used ---
K Value              : [k]
Suppression Limit    : [S%]
QI Columns           : [list]
Generalisation       : [Midpoint / Range]

--- Compliance ---
k-Anonymity Satisfied   : YES / NO
Min Equivalence Class   : [min_size] (must be ≥ k)
Avg Equivalence Class   : [avg_size]
Number of Classes       : [count]
Suppressed Records      : [count] ([rate%])

--- Information Loss ---
GIL Score               : [0.00 – 1.00] (0 = perfect, 1 = total loss)
GIL per QI Column       : [col: value, ...]

--- Equivalence Class Distribution ---
[Histogram: x = class size, y = frequency]

--- Column-level Changes ---
[For each QI col: original_min, original_max, post_generalised_min, post_generalised_max]

--- Interpretation ---
[Auto-generated text]:
  "This dataset satisfies [k]-anonymity. Each of the [count] equivalence classes
   contains at least [min_size] records. The generalisation information loss is [GIL],
   meaning [%]% of QI precision was sacrificed for privacy. [count_suppressed] records
   ([rate%]) were suppressed as they could not form groups of size [k]."

--- Recommendation ---
[If GIL > 0.5]: "High information loss detected. Consider reducing k or adding more QI columns."
[If suppressed > S%]: "Suppression limit exceeded. Increase k tolerance or reduce QI columns."
```

---

---

# TECHNIQUE 2 — L-DIVERSITY

## 2.1 Mathematical Foundation

**Formal Definition:**
An equivalence class E (from k-anonymity) is **l-diverse** if it contains at least l "well-represented" values of the sensitive attribute (SA).

Three variants:

### Variant A: Distinct L-Diversity
```
|{distinct values of SA in E}| ≥ l
```
Simplest. Just count unique SA values per class.

### Variant B: Entropy L-Diversity (Default — most rigorous)
```
-Σ_{s ∈ S} p(s|E) × log(p(s|E)) ≥ log(l)
```
Where:
- S = set of all unique SA values globally
- p(s|E) = fraction of records in class E with SA = s
- log = natural log

This ensures the SA distribution within each equivalence class has high entropy — no single value dominates.

### Variant C: Recursive (c, l)-Diversity
```
r₁ < c × (r₂ + r₃ + ... + rₘ)
```
Where r₁ ≥ r₂ ≥ ... ≥ rₘ are the sorted frequencies of SA values in class E.
- c is a parameter (typically 0.5–0.75)
- Prevents the most frequent SA value from dominating even if entropy is acceptable

**Key constraint:** L-Diversity is always built on top of K-Anonymity. The dataset must first be partitioned into equivalence classes (using Mondrian or similar), then each class is checked for l-diversity. If a class fails, records are either suppressed or merged with another class.

## 2.2 Algorithm (Pseudocode)

```
function l_diversity(D, QI_cols, SA_col, k, l, variant, c=0.5):

    # Step 1: Build k-anonymous equivalence classes (Mondrian)
    partitions = mondrian_k_anonymity(D, QI_cols, k, suppression_limit=0.1)

    result = []
    suppressed = []

    for E in partitions:
        sa_counts = E[SA_col].value_counts()
        sa_probs  = sa_counts / len(E)

        if variant == "distinct":
            satisfies = len(sa_counts) >= l

        elif variant == "entropy":
            entropy = -sum(p * log(p) for p in sa_probs if p > 0)
            satisfies = entropy >= log(l)

        elif variant == "recursive":
            sorted_r = sorted(sa_counts.values, reverse=True)
            r1 = sorted_r[0]
            rest = sum(sorted_r[1:])
            satisfies = (r1 < c * rest) and (len(sorted_r) >= l)

        if satisfies:
            result.append(E)
        else:
            # Try merging with nearest class first
            merged = try_merge_with_nearest(E, partitions)
            if merged satisfies l-diversity:
                result.append(merged)
            else:
                suppressed.extend(E)

    return concat(result), suppressed


function entropy_l_diversity_score(E, SA_col):
    probs = E[SA_col].value_counts(normalize=True)
    return -sum(p * log(p) for p in probs if p > 0)
```

## 2.3 Parameters & UI Configuration

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| **L Value** | Integer slider | 3 | 2–10 | Min well-represented SA values per class |
| **Variant** | Radio | Entropy | Entropy / Distinct / Recursive | Which l-diversity formula to use |
| **c (for Recursive)** | Float slider | 0.5 | 0.1–0.9 | Controls dominance threshold in recursive variant |
| **K Value** | Integer slider | 3 | 2–20 | Underlying k-anonymity parameter |
| **QI Columns** | Multi-checkbox | — | — | Columns for equivalence class formation |
| **SA Column** | Dropdown | — | — | Sensitive attribute to protect |

**Required inputs:** QI columns + SA column (mandatory for L-Diversity).

## 2.4 Metrics to Compute & Display

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Classes Satisfying L-Diversity** | count(E: satisfies_l) | = total classes |
| **Min Entropy per Class** | min(H(E)) | ≥ log(l) |
| **Avg Entropy per Class** | mean(H(E)) | — |
| **Classes Failing L-Diversity** | total - passing | 0 |
| **SA Distribution per Class** | value_counts per E | uniform = best |
| **Suppression Rate** | suppressed / N | < 10% |
| **L-Diversity Satisfied** | all classes pass | Boolean |

## 2.5 Report Content

```
=== L-DIVERSITY REPORT ===

Technique       : L-Diversity ([Entropy / Distinct / Recursive])
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]

--- Parameters ---
L Value              : [l]
Variant              : [entropy/distinct/recursive]
c (recursive only)   : [c]
Underlying K         : [k]
QI Columns           : [list]
Sensitive Attribute  : [SA_col]

--- Compliance ---
L-Diversity Satisfied    : YES / NO
Total Equivalence Classes: [count]
Classes Passing          : [count]
Classes Failing          : [count]
Suppressed Records       : [count] ([rate%])

--- Entropy Statistics (Entropy variant) ---
Min Class Entropy        : [value] (threshold: log([l]) = [log_l_value])
Max Class Entropy        : [value]
Avg Class Entropy        : [value]

--- SA Distribution Analysis ---
[Table: For each equivalence class — class_id, size, SA values present, entropy score, pass/fail]

--- SA Value Frequency (Global) ---
[Bar chart: SA value vs frequency across full dataset]

--- Interpretation ---
"[count] of [total] equivalence classes satisfy [l]-diversity using the [variant] method.
 The minimum entropy observed is [min_H], which [meets/does not meet] the threshold of
 log([l]) = [log_l]. [n_fail] classes were suppressed as they could not achieve l-diversity
 even after merging attempts."

--- Recommendation ---
[If many classes fail]: "Reduce l or switch to Distinct variant which is less strict."
[If SA has < l unique values globally]: "CRITICAL: SA column has fewer than l unique values globally — l-diversity is impossible. Reduce l to [n_unique_SA]."
```

---

---

# TECHNIQUE 3 — T-CLOSENESS

## 3.1 Mathematical Foundation

**Formal Definition:**
An equivalence class E satisfies **t-closeness** if the distance between the local SA distribution in E and the global SA distribution Q is at most t:

```
D[P, Q] ≤ t
```

Where:
- P = SA distribution within equivalence class E
- Q = SA distribution across the entire dataset
- D = Earth Mover's Distance (EMD), also called Wasserstein-1 distance

**Earth Mover's Distance (EMD):**

For **numeric** SA:
```
EMD(P, Q) = (1/|S|-1) × Σᵢ |CDF_P(i) - CDF_Q(i)|
```
Where CDF = cumulative distribution function over sorted unique SA values.

For **categorical** SA:
```
EMD(P, Q) = (1/2) × Σₛ |p(s|E) - p(s|global)|
```
This is equivalent to the Total Variation Distance for categorical data.

**Normalised EMD (used in practice):**
```
EMD_normalised = EMD(P, Q) / (max_possible_EMD)
```
For numeric data, max EMD = (|S|-1)/(2×(|S|-1)) = 0.5, so values ∈ [0, 1].

The threshold t = 0.30 means the class SA distribution may deviate at most 30% from global.

## 3.2 Algorithm (Pseudocode)

```
function t_closeness(D, QI_cols, SA_col, k, t):

    # Step 1: Compute global SA distribution Q
    global_counts = D[SA_col].value_counts().sort_index()
    Q = global_counts / len(D)   # global PMF
    Q_cdf = Q.cumsum()           # global CDF (for numeric)

    sorted_SA_values = sorted(D[SA_col].unique())
    n_unique = len(sorted_SA_values)

    # Step 2: k-anonymity partitioning
    partitions = mondrian_k_anonymity(D, QI_cols, k)

    result = []
    suppressed = []

    for E in partitions:
        # Compute local SA distribution P
        local_counts = E[SA_col].value_counts().reindex(sorted_SA_values, fill_value=0)
        P = local_counts / len(E)

        # Compute EMD
        if SA_col is numeric:
            P_cdf = P.cumsum()
            emd = sum(abs(P_cdf[i] - Q_cdf[i]) for i in range(n_unique)) / (n_unique - 1)
        else:  # categorical
            emd = 0.5 * sum(abs(P[s] - Q[s]) for s in sorted_SA_values)

        if emd <= t:
            result.append(E)
        else:
            # Try suppression of outlier SA records to bring EMD within t
            E_adjusted = remove_outlier_SA_records(E, Q, t)
            if compute_emd(E_adjusted, Q) <= t:
                result.append(E_adjusted)
                suppressed.extend(set_difference(E, E_adjusted))
            else:
                suppressed.extend(E)

    return concat(result), suppressed


function compute_emd_numeric(P, Q_cdf, sorted_vals):
    P_cdf = P.cumsum()
    n = len(sorted_vals)
    return sum(abs(P_cdf[i] - Q_cdf[i]) for i in range(n)) / (n - 1)


function compute_emd_categorical(P, Q):
    return 0.5 * sum(abs(P.get(s,0) - Q.get(s,0)) for s in Q.keys())
```

## 3.3 Parameters & UI Configuration

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| **T Threshold** | Float slider | 0.30 | 0.05–1.00 | Max EMD between local and global SA distribution |
| **K Value** | Integer slider | 3 | 2–20 | Underlying k-anonymity parameter |
| **QI Columns** | Multi-checkbox | — | — | Equivalence class columns |
| **SA Column** | Dropdown | — | — | Sensitive attribute column |
| **Distance Metric** | Dropdown | EMD | EMD / TVD | Earth Mover's or Total Variation Distance |

**Note:** Lower t = stricter privacy. t=0 means each class must mirror the global distribution exactly (very hard). t=0.5 is loose. Recommended: 0.15–0.35.

## 3.4 Metrics to Compute & Display

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Classes Satisfying T-Closeness** | count(E: emd ≤ t) | = total |
| **Min EMD** | min(emd per class) | < t |
| **Max EMD** | max(emd per class) | < t |
| **Avg EMD** | mean(emd per class) | — |
| **Classes Violating** | count(E: emd > t) | 0 |
| **T-Closeness Satisfied** | all classes pass | Boolean |

## 3.5 Report Content

```
=== T-CLOSENESS REPORT ===

Technique       : T-Closeness (Earth Mover's Distance)
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]

--- Parameters ---
T Threshold          : [t]
Distance Metric      : EMD (Earth Mover's Distance)
Underlying K         : [k]
QI Columns           : [list]
Sensitive Attribute  : [SA_col]

--- Compliance ---
T-Closeness Satisfied    : YES / NO
Total Equivalence Classes: [count]
Classes Passing (EMD ≤ t): [count]
Classes Failing (EMD > t): [count]
Suppressed Records       : [count] ([rate%])

--- EMD Statistics ---
Min EMD (best class)     : [value]
Max EMD (worst class)    : [value]  ← must be ≤ t
Avg EMD                  : [value]

--- Per-Class EMD Table ---
[Table: class_id | size | EMD | pass/fail | SA values present]

--- Global SA Distribution ---
[Bar chart: SA value → global proportion]

--- Worst-Class SA Distribution ---
[Bar chart for class with highest EMD: local vs global side-by-side]

--- Interpretation ---
"[count] of [total] equivalence classes satisfy t-closeness at t=[t].
 The maximum EMD observed is [max_emd]. [n_fail] classes failed and were suppressed.
 T-closeness prevents skewness attacks by ensuring no equivalence class has a
 significantly different SA distribution from the dataset as a whole."

--- Recommendation ---
[If many fail at t=0.30]: "Increase t to 0.40 for more lenient threshold, or reduce QI columns."
[If EMD consistently 0]: "SA column may not vary enough — consider a different SA column."
```

---

---

# TECHNIQUE 4 — RANK SWAPPING

## 4.1 Mathematical Foundation

**Formal Definition:**
Rank Swapping perturbs numeric values by swapping them between records whose **rank indices** differ by at most p positions.

```
|rank(rᵢ) - rank(rⱼ)| ≤ p
```

Where:
- rank(rᵢ) = position of record i when column values are sorted ascending (1-indexed)
- p = maximum rank distance allowed for swapping
- p is derived from swapFraction: `p = round(swapFraction × N)`

**Swap Mechanics:**
For each column independently:
1. Sort records by column value → get rank array
2. For each record i (in random order), find a candidate j where |rank(i) - rank(j)| ≤ p and j not yet swapped
3. Swap values: value[i] ↔ value[j]
4. Mark both i and j as swapped

**Marginal Preservation:** Rank swapping preserves the **marginal distribution** (rank distribution) of each column — the same set of values exists, just redistributed. Mean, variance, and quantiles are approximately preserved. This is a key property distinguishing it from noise addition.

**Privacy Guarantee:**
An adversary knowing a record's value cannot pin it to a specific individual because the value may have been swapped with any of p nearby-ranked records.

## 4.2 Algorithm (Pseudocode)

```
function rank_swapping(D, target_cols, swap_fraction):
    N = len(D)
    p = max(1, round(swap_fraction × N))   # max rank distance
    result = D.copy()

    for col in target_cols:
        if col is not numeric:
            continue

        # Get sorted rank indices
        sorted_indices = D[col].argsort().values   # indices that would sort col
        ranks = inverse_permutation(sorted_indices)  # rank of each record

        swapped = set()
        swap_order = shuffle(range(N))

        for i in swap_order:
            if i in swapped:
                continue

            rank_i = ranks[i]
            # Find eligible partners: rank within p of rank_i, not yet swapped
            candidates = [
                j for j in range(N)
                if j != i
                and j not in swapped
                and abs(ranks[j] - rank_i) <= p
            ]

            if candidates:
                j = random.choice(candidates)
                # Swap values
                result.loc[i, col], result.loc[j, col] = result.loc[j, col], result.loc[i, col]
                swapped.add(i)
                swapped.add(j)

    return result


# Efficient implementation using pre-sorted structure:
function rank_swap_efficient(col_values, p):
    N = len(col_values)
    sorted_idx = argsort(col_values)  # sorted_idx[rank] = original_index
    result_values = col_values.copy()
    swapped = [False] * N
    p_window = p

    for rank in shuffle(range(N)):
        i = sorted_idx[rank]
        if swapped[i]:
            continue

        # Window: ranks in [rank-p, rank+p]
        lo = max(0, rank - p_window)
        hi = min(N-1, rank + p_window)
        candidates = [
            sorted_idx[r] for r in range(lo, hi+1)
            if sorted_idx[r] != i and not swapped[sorted_idx[r]]
        ]

        if candidates:
            j = random.choice(candidates)
            result_values[i], result_values[j] = result_values[j], result_values[i]
            swapped[i] = True
            swapped[j] = True

    return result_values
```

## 4.3 Parameters & UI Configuration

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| **Swap Fraction** | % slider | 10% | 1%–50% | Determines max rank distance p = round(frac × N) |
| **Target Columns** | Multi-checkbox | All numeric | Numeric cols only | Columns to apply rank swapping on |
| **Random Seed** | Integer input | 42 | 0–9999 | For reproducibility |

**No QI or SA needed.** Rank swapping operates independently per column.

**p display:** Show computed p value in UI: `Max rank distance p = [p] records`

## 4.4 Metrics to Compute & Display

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Swap Rate** | swapped_pairs×2 / N | ≈ swap_fraction |
| **Mean Absolute Error** | mean(|original - swapped|) per col | lower = less distortion |
| **Rank Correlation (Spearman ρ)** | spearmanr(original, result) per col | close to 1 |
| **Mean Preserved** | abs(mean(orig) - mean(result)) / mean(orig) | < 1% |
| **Std Dev Preserved** | abs(std(orig) - std(result)) / std(orig) | < 5% |
| **Value Range Unchanged** | min/max same as original | should be True |

## 4.5 Report Content

```
=== RANK SWAPPING REPORT ===

Technique       : Rank Swapping (Rank-bounded value exchange)
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]

--- Parameters ---
Swap Fraction        : [frac%]
Max Rank Distance (p): [p] records
Target Columns       : [list]
Random Seed          : [seed]

--- Column-level Statistics ---
[Table for each target column:]
  Column          | Swap Rate | Mean Abs Error | Spearman ρ | Mean Preserved | Std Preserved
  [col_name]      | [xx%]     | [value]        | [0.xx]     | [YES/NO ±x%]   | [YES/NO ±x%]

--- Distribution Comparison ---
[For each col: side-by-side histogram: original vs post-swap]

--- Marginal Preservation Check ---
[Verify: sorted(original_col) == sorted(result_col) → should be TRUE for each col]
[Report: "Rank swapping preserves the exact value distribution per column."]

--- Privacy vs Utility Trade-off ---
[Chart: swap_fraction (x) vs spearman_rho (y) — showing how increasing fraction reduces utility]

--- Interpretation ---
"Rank swapping was applied to [n] columns with swap fraction [frac%] (p=[p]).
 The mean Spearman rank correlation across columns is [avg_rho], indicating
 [high/medium/low] data utility retention. The value distribution for each
 column remains identical (marginal preservation confirmed)."

--- Recommendation ---
[If ρ < 0.85]: "High distortion detected. Reduce swap fraction below [current/2]%."
[If swap rate < fraction/2]: "Many records could not find swap partners — dataset may be too small."
```

---

---

# TECHNIQUE 5 — MICROAGGREGATION (MDAV)

## 5.1 Mathematical Foundation

**Formal Definition:**
Microaggregation groups records into clusters of size ≥ k, then replaces each numeric value within a cluster with the **cluster centroid** (mean).

```
x̄ = (1/k) × Σᵢ xᵢ   (cluster centroid)
```

**MDAV (Maximum Distance to Average Vector) Algorithm:**
MDAV is the standard microaggregation method. It builds clusters by finding the record **farthest from the centroid**, then grouping it with its k-1 nearest neighbours.

**Distance Metric:**
Euclidean distance in multi-dimensional space (across all target numeric columns, after normalisation):
```
dist(rᵢ, rⱼ) = √(Σ_col ((xᵢ_col - xⱼ_col) / range_col)²)
```

**Information Loss:**
```
SSE = Σ_cluster Σ_record Σ_col (x_record_col - centroid_col)²
SST = Σ_record Σ_col (x_record_col - global_mean_col)²
IL = SSE / SST    # 0 = no loss, 1 = total loss
```

**Privacy Guarantee:**
No individual record value can be distinguished from at least k-1 others in its cluster, since all share the same centroid value. This prevents exact-match re-identification.

## 5.2 Algorithm (Pseudocode)

```
function mdav_microaggregation(D, target_cols, k):
    # Normalise target columns
    D_norm = normalise_minmax(D[target_cols])  # scale to [0,1]
    remaining = list(range(len(D)))
    clusters = []

    while len(remaining) >= 3k:
        # Step 1: Compute centroid of remaining records
        centroid = D_norm.iloc[remaining].mean(axis=0)

        # Step 2: Find record r1 farthest from centroid
        distances = [euclidean(D_norm.iloc[i], centroid) for i in remaining]
        r1_idx = remaining[argmax(distances)]

        # Step 3: Find k-1 nearest records to r1 → form cluster 1
        dists_to_r1 = [euclidean(D_norm.iloc[i], D_norm.iloc[r1_idx])
                       for i in remaining]
        nearest_k = nsmallest(k, remaining, key=lambda i: dists_to_r1[remaining.index(i)])
        cluster1 = nearest_k
        remaining = [i for i in remaining if i not in cluster1]

        # Step 4: Find record r2 farthest from centroid among remaining
        if len(remaining) >= k:
            centroid2 = D_norm.iloc[remaining].mean(axis=0)
            distances2 = [euclidean(D_norm.iloc[i], centroid2) for i in remaining]
            r2_idx = remaining[argmax(distances2)]

            dists_to_r2 = [euclidean(D_norm.iloc[i], D_norm.iloc[r2_idx])
                           for i in remaining]
            cluster2 = nsmallest(k, remaining, key=lambda i: dists_to_r2[remaining.index(i)])
            remaining = [i for i in remaining if i not in cluster2]
            clusters.append(cluster2)

        clusters.append(cluster1)

    # Remaining records form one last cluster (may be < k, merged with nearest)
    if remaining:
        clusters.append(remaining)

    # Replace values with cluster centroids
    result = D.copy()
    for cluster in clusters:
        for col in target_cols:
            centroid_val = D.loc[cluster, col].mean()
            result.loc[cluster, col] = centroid_val

    return result, clusters
```

## 5.3 Parameters & UI Configuration

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| **Cluster Size (k)** | Integer slider | 5 | 2–20 | Min records per cluster |
| **Target Columns** | Multi-checkbox | All numeric | Numeric cols only | Columns to aggregate |
| **Distance Metric** | Dropdown | Euclidean | Euclidean / Manhattan | Distance for MDAV clustering |

**No QI or SA needed.** Microaggregation operates on target numeric columns only.

## 5.4 Metrics to Compute & Display

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Number of Clusters** | count(clusters) | ≈ N/k |
| **Min Cluster Size** | min(|cluster|) | ≥ k |
| **Avg Cluster Size** | mean(|cluster|) | ≈ k |
| **SSE / SST (IL)** | SSE/SST | < 0.20 ideally |
| **Mean Absolute Deviation** | mean(|x_orig - x_centroid|) per col | — |
| **Pearson Correlation** | corr(original, result) per col | > 0.90 |
| **Variance Preserved** | var(result) / var(original) per col | close to 1 |

## 5.5 Report Content

```
=== MICROAGGREGATION REPORT ===

Technique       : Microaggregation (MDAV — Maximum Distance to Average Vector)
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]

--- Parameters ---
Cluster Size (k)     : [k]
Target Columns       : [list]
Distance Metric      : [Euclidean / Manhattan]

--- Cluster Statistics ---
Number of Clusters   : [count]
Min Cluster Size     : [min] (must be ≥ k)
Max Cluster Size     : [max]
Avg Cluster Size     : [avg]

--- Information Loss ---
SSE / SST (IL Score) : [value] (0 = no loss, 1 = total loss)
Interpretation       : [Low / Medium / High] distortion

--- Column-level Statistics ---
[Table for each target column:]
  Column     | Mean Abs Dev | Pearson r | Var Ratio | Min→Post | Max→Post
  [col_name] | [value]      | [0.xx]    | [0.xx]    | [x→y]    | [x→y]

--- Distribution Comparison ---
[For each col: original distribution (histogram) vs post-microaggregation]

--- Cluster Size Distribution ---
[Histogram of cluster sizes]

--- Interpretation ---
"MDAV microaggregation was applied to [n] columns with cluster size k=[k].
 [count] clusters were formed. The information loss (SSE/SST) is [IL], indicating
 [low/medium/high] distortion. The average Pearson correlation across target columns
 is [avg_r], showing [high/moderate] utility preservation."

--- Recommendation ---
[If IL > 0.30]: "High information loss. Reduce k or apply to fewer columns."
[If some columns have r < 0.80]: "Column [name] is heavily distorted. Consider excluding it."
```

---

---

# TECHNIQUE 6 — PRAM (Post-Randomisation Method)

## 6.1 Mathematical Foundation

**Formal Definition:**
PRAM perturbs **categorical** values using a **Markov transition matrix M**.

For each record independently, the original categorical value s is replaced by a new value s' drawn from the conditional distribution defined by row s of M:

```
P(new = s' | original = s) = M[s, s']
```

**Standard PRAM Transition Matrix:**
```
M[i, j] = p_ret          if i == j   (retain original value)
M[i, j] = (1 - p_ret) / (|S| - 1)   if i ≠ j   (perturb to any other value equally)
```

Where:
- p_ret = retention probability (probability of keeping original value)
- |S| = number of unique categories in the column
- Each row of M sums to 1 (valid probability distribution)

**Unbiased PRAM (Important):**
Naïve PRAM changes the marginal distribution. Unbiased PRAM applies a correction matrix so that the **expected marginal distribution is preserved**:

```
E[n'(s)] = n(s)   for all s ∈ S
```

This is achieved by solving: `n'_expected = M^T × n_original`

If M is constructed as above (symmetric with p_ret on diagonal), and the column's distribution is roughly uniform, the bias is minimal. For skewed distributions, use the correction:
```
corrected_value = M⁻¹ × observed_perturbed_distribution
```

**Privacy Intuition:**
An adversary knowing the post-PRAM value s' can only estimate the original value s with probability p_ret. If p_ret = 0.70, there is a 30% chance the original value was different — providing plausible deniability.

## 6.2 Algorithm (Pseudocode)

```
function pram(D, target_cols, p_ret, seed=42):
    random.seed(seed)
    result = D.copy()

    for col in target_cols:
        if col is not categorical:
            continue

        unique_vals = sorted(D[col].unique())
        S = len(unique_vals)
        val_to_idx = {v: i for i, v in enumerate(unique_vals)}
        idx_to_val = {i: v for i, v in enumerate(unique_vals)}

        # Build transition matrix
        M = build_transition_matrix(p_ret, S)

        # Apply PRAM row-by-row
        for record_idx in range(len(D)):
            original = D.loc[record_idx, col]
            orig_idx = val_to_idx[original]
            # Sample new value from row M[orig_idx]
            new_idx = random.choices(range(S), weights=M[orig_idx])[0]
            result.loc[record_idx, col] = idx_to_val[new_idx]

    return result


function build_transition_matrix(p_ret, S):
    M = np.full((S, S), (1 - p_ret) / (S - 1))
    np.fill_diagonal(M, p_ret)
    # Verify each row sums to 1
    assert all(abs(row.sum() - 1.0) < 1e-9 for row in M)
    return M


function apply_pram_vectorised(col_series, M, val_to_idx, idx_to_val):
    # Vectorised version for performance
    indices = col_series.map(val_to_idx).values
    new_indices = [np.random.choice(len(M), p=M[i]) for i in indices]
    return pd.Series([idx_to_val[i] for i in new_indices], index=col_series.index)
```

## 6.3 Parameters & UI Configuration

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| **Retention Probability** | Float slider | 0.70 | 0.10–1.00 | P(keep original value) = p_ret |
| **Target Columns** | Multi-checkbox | Categorical cols | Categorical cols only | Columns to perturb |
| **PRAM Variant** | Radio | Simple | Simple / Unbiased | Whether to apply distribution correction |
| **Random Seed** | Integer | 42 | 0–9999 | Reproducibility |

**Display in UI:**
- `P(keep original) = [p_ret]`
- `P(perturb to other) = [1-p_ret]`
- `Number of categories: [|S|] per column`

**No QI or SA needed.** PRAM operates on selected categorical columns independently.

**Auto-detection:** When target columns are not selected, auto-detect all categorical/object-type columns.

## 6.4 Metrics to Compute & Display

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Actual Retention Rate** | count(new == original) / N per col | ≈ p_ret |
| **Perturbation Rate** | count(new ≠ original) / N per col | ≈ 1 - p_ret |
| **Distribution Shift (TVD)** | 0.5 × Σ |P_orig(s) - P_new(s)| per col | < 0.10 |
| **Chi-Square Test** | χ² statistic (original vs new distribution) | p-value > 0.05 = similar |
| **Value-level Change Table** | Crosstab: original vs new per column | diagonal heavy = good |

## 6.5 Report Content

```
=== PRAM REPORT ===

Technique       : PRAM (Post-Randomisation Method)
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]

--- Parameters ---
Retention Probability  : [p_ret]  → P(keep) = [p_ret], P(change) = [1-p_ret]
PRAM Variant           : [Simple / Unbiased]
Target Columns         : [list]
Random Seed            : [seed]

--- Transition Matrix (per column) ---
[Show M matrix for first column as example — or for all if ≤ 10 categories]
[M is |S| × |S| with p_ret on diagonal]

--- Column-level Results ---
[Table:]
  Column       | Categories | Actual Retention | Perturbation Rate | TVD   | χ² p-value
  [col_name]   | [|S|]      | [xx%]            | [xx%]             | [0.xx]| [0.xx]

--- Value-level Confusion Table (per column) ---
[Crosstab: Original Value (rows) vs New Value (cols), with counts]
[Diagonal = retained, off-diagonal = perturbed]

--- Distribution Comparison ---
[Bar chart per column: original vs post-PRAM category frequencies]

--- Interpretation ---
"PRAM was applied to [n] categorical columns with retention probability [p_ret].
 The average actual retention rate across columns is [avg_ret%], close to the
 configured [p_ret×100%]. The mean Total Variation Distance is [avg_tvd],
 indicating [minimal/moderate/high] distribution shift post-perturbation.
 The chi-square test [confirms/does not confirm] distributional similarity."

--- Privacy Interpretation ---
"For each record, an adversary who knows the perturbed value has only [p_ret×100%]
 confidence the original value matches. This provides plausible deniability for all
 records in the perturbed columns."

--- Recommendation ---
[If TVD > 0.20]: "Distribution has shifted significantly. Switch to Unbiased PRAM variant."
[If retention rate >> p_ret]: "More values retained than expected — possible due to dominant category."
```

---

---

# TECHNIQUE 7 — TOP/BOTTOM CODING (Percentile Capping + Optional Noise)

## 7.1 Mathematical Foundation

**Formal Definition:**
Top/Bottom Coding replaces extreme values with percentile thresholds to prevent re-identification through rare extreme values:

```
v' = clip(v, q_bot, q_top) + N(0, λ²·σ²)
```

Where:
- `q_bot` = value at bottom percentile threshold (e.g., 5th percentile)
- `q_top` = value at top percentile threshold (e.g., 95th percentile)
- `clip(v, lo, hi)` = max(lo, min(hi, v))  → cap values outside range
- `N(0, λ²·σ²)` = optional Gaussian noise (λ × column std dev), added only if enabled
- λ = noise multiplier (default 0.05–0.20)
- σ = standard deviation of the original column

**Why top/bottom coding protects privacy:**
Extreme values (outliers) are often unique and can pinpoint specific individuals. By capping all values above q_top to exactly q_top (and below q_bot to q_bot), the adversary loses the ability to identify records via extreme values.

**With Gaussian noise:**
The optional noise injection adds additional obfuscation after capping:
```
σ_noise = λ × std(original_col)
noise   = sample from N(0, σ_noise²)
v_final = clipped_v + noise
```
This prevents an adversary from knowing exactly which records were capped (since all values now have noise).

**Percentile Computation:**
```
q_bot = percentile(col, bottom_pct)    # e.g., 5th percentile
q_top = percentile(col, top_pct)       # e.g., 95th percentile
```
Values ∈ [q_bot, q_top] are unchanged (or receive only noise if enabled).
Values < q_bot → replaced with q_bot.
Values > q_top → replaced with q_top.

## 7.2 Algorithm (Pseudocode)

```
function top_bottom_coding(D, target_cols, top_pct, bottom_pct, add_noise, noise_lambda, seed=42):
    random.seed(seed)
    result = D.copy()
    stats = {}

    for col in target_cols:
        if col is not numeric:
            continue

        original = D[col].values
        sigma = std(original)

        # Compute thresholds
        q_bot = percentile(original, bottom_pct)
        q_top = percentile(original, top_pct)

        # Clip values
        clipped = clip(original, q_bot, q_top)

        # Count how many were capped
        n_top_capped = sum(original > q_top)
        n_bot_capped = sum(original < q_bot)

        # Optional: Add Gaussian noise
        if add_noise:
            sigma_noise = noise_lambda * sigma
            noise = random.normal(0, sigma_noise, size=len(clipped))
            final = clipped + noise
        else:
            final = clipped

        result[col] = final

        stats[col] = {
            "q_bot": q_bot,
            "q_top": q_top,
            "n_top_capped": n_top_capped,
            "n_bot_capped": n_bot_capped,
            "pct_top_capped": n_top_capped / len(original) * 100,
            "pct_bot_capped": n_bot_capped / len(original) * 100,
            "sigma_noise": sigma_noise if add_noise else 0,
            "mean_shift": abs(mean(final) - mean(original)),
            "std_shift": abs(std(final) - sigma)
        }

    return result, stats
```

## 7.3 Parameters & UI Configuration

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| **Top Percentile Cap** | Integer slider | 95 | 50–100 | Values above this percentile are capped |
| **Bottom Percentile Cap** | Integer slider | 5 | 0–50 | Values below this percentile are capped |
| **Add Gaussian Noise** | Toggle | OFF | ON / OFF | Inject noise after capping |
| **Noise Lambda (λ)** | Float slider | 0.10 | 0.01–0.50 | σ_noise = λ × col_std (shown if noise ON) |
| **Target Columns** | Multi-checkbox | All numeric | Numeric cols only | Columns to apply coding |
| **Random Seed** | Integer | 42 | 0–9999 | For reproducibility of noise |

**No QI or SA needed.**

**Validation rule:** Bottom Cap must be < Top Cap. Show error if top_pct ≤ bottom_pct.

## 7.4 Metrics to Compute & Display

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Top Capping Rate** | n_top_capped / N × 100 per col | ≈ (100 - top_pct)% |
| **Bottom Capping Rate** | n_bot_capped / N × 100 per col | ≈ bottom_pct% |
| **Mean Shift** | abs(mean_orig - mean_new) / mean_orig | < 2% |
| **Std Dev Shift** | abs(std_orig - std_new) / std_orig | < 10% |
| **Noise Std (σ_noise)** | λ × std_orig per col | — |
| **Skewness Change** | skew(original) vs skew(result) | — |
| **Records Affected** | n_capped_top + n_capped_bot per col | ≈ (100-top_pct + bottom_pct)% |

## 7.5 Report Content

```
=== TOP/BOTTOM CODING REPORT ===

Technique       : Top/Bottom Coding (Percentile Capping + Optional Noise)
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]

--- Parameters ---
Top Percentile Cap     : [top_pct]th percentile
Bottom Percentile Cap  : [bottom_pct]th percentile
Gaussian Noise         : [ENABLED / DISABLED]
Noise Lambda (λ)       : [lambda] (σ_noise = [lambda] × col_std per column)
Target Columns         : [list]

--- Column-level Results ---
[Table for each target column:]
  Column     | q_bot     | q_top     | Bot Capped | Top Capped | Mean Shift | Std Shift | Noise σ
  [col_name] | [q_bot_v] | [q_top_v] | [n (%)]    | [n (%)]    | [±x%]      | [±x%]     | [σ_n]

--- Capping Impact Summary ---
Total records affected (any column): [count] ([rate%])
Max capping rate (single column)   : [col_name] at [rate%]

--- Distribution Comparison ---
[For each col: original vs post-coding histogram with q_bot and q_top lines marked]

--- Outlier Analysis ---
[Box plot before and after for each column]
[Show: original outliers marked vs post-coding]

--- Noise Statistics (if enabled) ---
[For each col: noise range injected, mean noise added, σ_noise value]

--- Interpretation ---
"Top/Bottom coding was applied to [n] columns. Values above the [top_pct]th percentile
 and below the [bottom_pct]th percentile were capped. On average [rate%] of records per
 column were capped. [Gaussian noise with λ=[lambda] was added / No noise was added].
 This prevents re-identification via extreme values, which are often unique to specific
 individuals in survey microdata."

--- Recommendation ---
[If mean_shift > 5%]: "Significant mean shift in [col]. Consider widening the percentile range."
[If capping rate > 20%]: "Over 20% of records capped in [col]. This may be too aggressive — increase top_pct or decrease bottom_pct."
[If noise enabled and σ_noise > 0.3×std]: "Noise level is high relative to data spread — consider reducing λ."
```

---

---

# CROSS-CUTTING IMPLEMENTATION NOTES FOR REPLIT

## A. Column Type Detection Logic

```python
def detect_column_type(series):
    if series.dtype in ['int64', 'float64']:
        n_unique = series.nunique()
        if n_unique <= 10:
            return 'categorical_numeric'  # treat as categorical (e.g., 0/1 flags, codes)
        return 'numeric'
    elif series.dtype in ['object', 'category']:
        return 'categorical'
    elif series.dtype == 'bool':
        return 'binary'
    return 'unknown'
```

**Rule for UI:**
- QI checkboxes: show ALL columns
- SA dropdown: show categorical + low-cardinality numeric
- Target Columns (numeric techniques): show only `dtype in [int64, float64]` with n_unique > 10
- Target Columns (PRAM): show only `dtype in [object, category]`

## B. Technique-to-Column-Type Matrix

| Technique | Needs QI | Needs SA | Target Cols Type | Operates On |
|-----------|----------|----------|------------------|-------------|
| K-Anonymity | YES (≥1) | NO | None | QI cols (generalised) |
| L-Diversity | YES (≥1) | YES (1) | None | QI + SA |
| T-Closeness | YES (≥1) | YES (1) | None | QI + SA |
| Rank Swapping | NO | NO | Numeric | Target cols |
| Microaggregation | NO | NO | Numeric | Target cols |
| PRAM | NO | NO | Categorical | Target cols |
| Top/Bottom Coding | NO | NO | Numeric | Target cols |

## C. Output Dataset Handling

After applying any technique:
1. **Save transformed dataset** with suffix `_[technique]_k[k]_[timestamp].csv`
2. **Track provenance:** store which technique + params were applied
3. **Generate report** as HTML and optionally PDF
4. **Show diff table:** original vs transformed (first 10 rows, all columns)
5. **Allow download** of both transformed dataset and report

## D. Report Generation Template Structure

Every report HTML should have these sections:
```
1. Header: technique name, dataset name, timestamp, params summary
2. Compliance Status: PASS / FAIL badge
3. Key Metrics Table: 5–8 most important metrics as cards
4. Statistical Comparison: before/after stats for affected columns
5. Visualisations: histograms, distributions, class tables
6. Interpretation Paragraph: auto-generated text
7. Recommendations: conditional based on metric thresholds
8. Download buttons: CSV (transformed data), HTML report, PDF report
```

## E. Error Handling Rules

| Condition | Error Message | Action |
|-----------|--------------|--------|
| QI not selected (for K/L/T) | "Select at least one QI column" | Block Apply |
| SA not selected (for L/T) | "Select a sensitive attribute" | Block Apply |
| SA has < l unique values (L-Div) | "SA has only [n] unique values — reduce L to ≤ [n]" | Warning |
| Dataset too small (N < 2k) | "Dataset has [N] rows — k=[k] requires at least [2k] rows" | Warning |
| All numeric columns excluded (Rank Swap/MDAV/TopBot) | "No numeric target columns selected" | Block Apply |
| All categorical columns excluded (PRAM) | "No categorical target columns selected" | Block Apply |
| Bottom pct ≥ Top pct (TopBot) | "Bottom cap must be less than top cap" | Block Apply |

---

---

# TECHNIQUE 8 — NOISE ADDITION

## 8.1 Mathematical Foundation

**Formal Definition:**
Noise Addition perturbs numeric values by injecting random noise drawn from a chosen distribution. The original value v is replaced by:

```
v' = v + ε
```

Where ε is a random variable drawn independently for each cell.

### Noise Distributions

**Gaussian (Normal) Noise — default:**
```
ε ~ N(0, σ²)
σ = λ × std(col)      # proportional to column spread
```
λ is the noise multiplier (signal-to-noise ratio control). Higher λ = more privacy, more distortion.

**Laplace Noise — differential-privacy-aligned:**
```
ε ~ Laplace(0, b)
b = sensitivity / ε_budget     # privacy budget formulation
  = λ × std(col)               # simplified proportional form
```
Laplace noise has heavier tails than Gaussian — better for outlier obfuscation, more aligned with ε-differential privacy semantics.

**Uniform Noise:**
```
ε ~ Uniform(-δ, +δ)
δ = λ × std(col)
```
Bounded perturbation — no extreme noise values. Useful when you want hard bounds on distortion.

### Key Statistical Properties (Gaussian case)

**Mean preservation (unbiased):**
```
E[v'] = E[v + ε] = E[v] + E[ε] = E[v] + 0 = E[v]
```
The expected mean is preserved exactly.

**Variance inflation:**
```
Var[v'] = Var[v] + Var[ε] = σ²_col + σ²_noise
```
Variance increases by σ²_noise — this is the primary utility cost.

**Signal-to-Noise Ratio (SNR):**
```
SNR = Var[v] / Var[ε] = σ²_col / (λ × σ_col)² = 1/λ²
```
SNR = 100 at λ=0.10 (10% noise), SNR = 4 at λ=0.50 (50% noise).

### Proportional vs Absolute Noise

| Mode | Formula | When to Use |
|------|---------|-------------|
| **Proportional** | σ_noise = λ × std(col) | Different columns have different scales — scales noise per column automatically |
| **Absolute** | σ_noise = fixed value | All columns need same noise magnitude |
| **Column-specific** | σ_noise_i = λᵢ × std(col_i) | Fine-grained control per column |

### Clipping Post-Noise (Optional)

To keep values within realistic bounds after noise:
```
v'_clipped = clip(v', original_min, original_max)
           = max(original_min, min(original_max, v + ε))
```
Without clipping, noise may produce values outside the original data range (e.g., negative ages).

## 8.2 Algorithm (Pseudocode)

```
function noise_addition(D, target_cols, distribution, lambda_noise,
                        clip_to_range=True, seed=42):
    random.seed(seed)
    result = D.copy()
    stats = {}

    for col in target_cols:
        if col is not numeric:
            continue

        original = D[col].values.astype(float)
        col_std  = std(original)
        col_mean = mean(original)
        col_min  = min(original)
        col_max  = max(original)
        N        = len(original)

        sigma_noise = lambda_noise * col_std

        # Generate noise
        if distribution == "gaussian":
            epsilon = random.normal(0, sigma_noise, size=N)

        elif distribution == "laplace":
            b = sigma_noise / sqrt(2)    # Laplace scale ≡ Gaussian σ/√2 for same variance
            epsilon = random.laplace(0, b, size=N)

        elif distribution == "uniform":
            delta = sigma_noise * sqrt(3)   # Uniform(-δ,δ) has variance δ²/3 → δ=σ√3
            epsilon = random.uniform(-delta, delta, size=N)

        noisy = original + epsilon

        # Optional clipping
        if clip_to_range:
            noisy = clip(noisy, col_min, col_max)

        result[col] = noisy

        stats[col] = {
            "sigma_noise"       : sigma_noise,
            "mean_original"     : col_mean,
            "mean_noisy"        : mean(noisy),
            "std_original"      : col_std,
            "std_noisy"         : std(noisy),
            "snr"               : (col_std ** 2) / (sigma_noise ** 2) if sigma_noise > 0 else inf,
            "mae"               : mean(abs(noisy - original)),
            "pearson_r"         : pearsonr(original, noisy),
            "clipped_count"     : sum(noisy == col_min) + sum(noisy == col_max)
                                  if clip_to_range else 0
        }

    return result, stats
```

## 8.3 Parameters & UI Configuration

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| **Noise Distribution** | Radio | Gaussian | Gaussian / Laplace / Uniform | Statistical distribution for noise |
| **Noise Multiplier (λ)** | Float slider | 0.10 | 0.01–1.00 | σ_noise = λ × col_std |
| **Clip to Original Range** | Toggle | ON | ON / OFF | Prevent out-of-range values post-noise |
| **Target Columns** | Multi-checkbox | All numeric | Numeric cols only | Columns to perturb |
| **Random Seed** | Integer | 42 | 0–9999 | Reproducibility |

**Display in UI:**
- `σ_noise = [lambda] × col_std (computed per column)`
- `SNR = [1/λ²] (higher = better utility)`
- Live preview: show estimated MAE for first selected column as λ changes

**No QI or SA needed.**

## 8.4 Metrics to Compute & Display

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Mean Absolute Error (MAE)** | mean(\|v' - v\|) per col | as low as possible |
| **Signal-to-Noise Ratio (SNR)** | σ²_col / σ²_noise | > 10 for low distortion |
| **Pearson Correlation** | corr(original, noisy) per col | > 0.95 |
| **Mean Preserved** | \|mean(v') - mean(v)\| / mean(v) | < 1% |
| **Variance Inflation** | (σ²_noisy - σ²_orig) / σ²_orig | ≈ λ² |
| **Clipped Records** | count(v' hit boundary) per col | ideally < 5% |
| **KL Divergence** | KL(P_orig \|\| P_noisy) | smaller = better |

## 8.5 Report Content

```
=== NOISE ADDITION REPORT ===

Technique       : Noise Addition ([Gaussian / Laplace / Uniform])
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]

--- Parameters ---
Distribution         : [Gaussian / Laplace / Uniform]
Noise Multiplier (λ) : [lambda]
Clip to Range        : [YES / NO]
Target Columns       : [list]
Random Seed          : [seed]

--- Column-level Statistics ---
[Table for each column:]
  Column     | σ_noise | SNR    | MAE     | Pearson r | Mean Shift | Var Inflation | Clipped
  [col_name] | [value] | [x.xx] | [value] | [0.xx]    | [±x%]      | [+x%]         | [n]

--- Distribution Comparison ---
[For each col: original vs noisy histogram overlay]
[Show: original (blue), noisy (orange/red), ±1σ_noise band shaded]

--- SNR vs Distortion Trade-off Chart ---
[Line chart: λ (x-axis) vs Pearson r (y-axis) — pre-computed for λ ∈ {0.05,0.10,...,0.50}]

--- Noise Distribution Plot ---
[PDF plot of the chosen noise distribution with configured σ_noise]

--- Interpretation ---
"Noise was injected into [n] columns using [distribution] distribution with λ=[lambda].
 The average SNR across columns is [avg_snr]. Mean values are preserved within [max_mean_shift%].
 The average Pearson correlation is [avg_r], indicating [high/moderate/low] utility preservation.
 [Clipping was applied — [total_clipped] boundary hits across all columns.]"

--- Privacy Interpretation ---
"An adversary observing any perturbed value v' knows the true value lies within
 approximately ±[2×sigma_noise] of v' (95% confidence interval for Gaussian noise).
 This uncertainty interval makes exact record linkage infeasible."

--- Recommendation ---
[If SNR < 4 (λ > 0.5)]: "Very high noise level — data utility severely degraded. Reduce λ."
[If Pearson r < 0.85 on any col]: "Column [name] has low correlation — consider reducing λ or excluding this column."
[If clipped > 10%]: "Many values hit boundary post-noise. Consider disabling clipping or using Laplace distribution."
```

---

---

# TECHNIQUE 9 — EXPLICIT SUPPRESSION

## 9.1 Mathematical Foundation

**Formal Definition:**
Explicit Suppression removes entire records (row suppression) or individual cell values (cell-level suppression) from the dataset based on a defined rule. Unlike K-Anonymity's incidental suppression, this is a **primary, deliberate** suppression strategy.

### Row Suppression

A record r is suppressed if it satisfies a suppression criterion C:
```
suppress(r) = TRUE  iff  C(r) = TRUE
```

**Common Criteria:**

**1. Uniqueness-based (re-identification risk):**
```
suppress(r) if |{r' ∈ D : r'[QI] = r[QI]}| < threshold
```
Suppress records that are unique or near-unique on QI combination — they are easily re-identified.

**2. Outlier-based (statistical outlier):**
```
suppress(r) if ∃ col: |r[col] - μ_col| > z_threshold × σ_col
```
Suppress records with extreme values beyond z standard deviations (z-score based).

**3. Sensitive value-based:**
```
suppress(r) if r[SA] ∈ sensitive_value_set
```
Suppress records whose sensitive attribute matches a predefined set of high-risk values.

**4. Rule-based / Threshold-based:**
```
suppress(r) if r[col] < lower_bound OR r[col] > upper_bound
```
Any configurable threshold condition on one or more columns.

### Cell-Level Suppression

Replace individual cell values with a suppression marker (NULL / `*`) without removing the entire row:
```
r'[col] = NULL    if  suppress_condition(r[col])
r'[col] = r[col]  otherwise
```

**Frequency rule for cell suppression:**
```
suppress cell r[col] if frequency_count(r[col]) < min_freq
```
Rare values (appearing fewer than min_freq times) are suppressed at cell level.

### Suppression Rate Budget

```
max_suppressed_rows  = ceil(row_suppression_limit × N)
max_suppressed_cells = ceil(cell_suppression_limit × N × C)
```
Where C = number of target columns. Always enforce budget — do not exceed.

### Information Loss from Suppression

```
IL_rows  = suppressed_rows / N
IL_cells = suppressed_cells / (N × C_target)
```

## 9.2 Algorithm (Pseudocode)

```
function explicit_suppression(D, mode, criterion, params, suppression_limit_pct):

    N = len(D)
    max_suppress = ceil(suppression_limit_pct * N)
    result = D.copy()
    suppressed_mask = [False] * N
    suppressed_cells = {}   # {(row_idx, col): True}

    # --- ROW SUPPRESSION ---
    if mode in ["row", "both"]:

        if criterion == "uniqueness":
            QI_cols    = params["qi_cols"]
            threshold  = params["min_group_size"]   # default 2
            group_sizes = D.groupby(QI_cols).transform('count').iloc[:, 0]
            candidates = D.index[group_sizes < threshold].tolist()

        elif criterion == "outlier":
            z_threshold = params["z_threshold"]   # default 3.0
            target_cols = params["target_cols"]
            candidates = []
            for col in target_cols:
                mu    = D[col].mean()
                sigma = D[col].std()
                outliers = D.index[abs(D[col] - mu) > z_threshold * sigma]
                candidates.extend(outliers)
            candidates = list(set(candidates))

        elif criterion == "sensitive_value":
            SA_col      = params["sa_col"]
            risk_values = params["risk_values"]   # list of values to suppress
            candidates  = D.index[D[SA_col].isin(risk_values)].tolist()

        elif criterion == "threshold":
            col         = params["col"]
            lower       = params.get("lower_bound", -inf)
            upper       = params.get("upper_bound", +inf)
            candidates  = D.index[(D[col] < lower) | (D[col] > upper)].tolist()

        # Apply suppression budget
        to_suppress = candidates[:max_suppress]   # respect budget
        result.drop(index=to_suppress, inplace=True)
        for idx in to_suppress:
            suppressed_mask[idx] = True

    # --- CELL-LEVEL SUPPRESSION ---
    if mode in ["cell", "both"]:

        target_cols = params.get("target_cols", D.columns.tolist())
        min_freq    = params.get("min_frequency", 3)

        for col in target_cols:
            freq = D[col].value_counts()
            rare_vals = freq[freq < min_freq].index
            cell_mask = D[col].isin(rare_vals)

            for idx in D.index[cell_mask]:
                result.loc[idx, col] = None   # or "***" for display
                suppressed_cells[(idx, col)] = True

    return result, suppressed_mask, suppressed_cells


function compute_suppression_stats(D, result, suppressed_mask, suppressed_cells):
    return {
        "rows_suppressed"     : sum(suppressed_mask),
        "rows_retained"       : len(result),
        "row_suppression_rate": sum(suppressed_mask) / len(D),
        "cells_suppressed"    : len(suppressed_cells),
        "cell_suppression_rate": len(suppressed_cells) / (len(D) * len(D.columns)),
        "il_rows"             : sum(suppressed_mask) / len(D),
        "il_cells"            : len(suppressed_cells) / (len(D) * len(D.columns))
    }
```

## 9.3 Parameters & UI Configuration

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| **Suppression Mode** | Radio | Row | Row / Cell / Both | Whether to suppress whole rows or individual cells |
| **Suppression Criterion** | Dropdown | Uniqueness | Uniqueness / Outlier (Z-score) / Sensitive Value / Threshold | Rule for deciding what to suppress |
| **Min Group Size** (Uniqueness) | Integer | 2 | 1–10 | Suppress records in QI groups smaller than this |
| **Z Threshold** (Outlier) | Float slider | 3.0 | 1.5–5.0 | Standard deviations beyond which a record is suppressed |
| **Risk Values** (Sensitive Value) | Tag input | — | — | Specific SA values whose records should be suppressed |
| **Lower / Upper Bound** (Threshold) | Number inputs | — | — | Bounds for threshold-based suppression |
| **Min Cell Frequency** (Cell mode) | Integer | 3 | 1–10 | Suppress cells with values appearing fewer than n times |
| **Suppression Budget** | % slider | 10% | 1%–30% | Max % of records that can be suppressed |
| **QI Columns** | Multi-checkbox | — | — | Required for Uniqueness criterion |
| **Target Columns** | Multi-checkbox | All | Any | Columns to check for outlier/threshold criteria |

## 9.4 Metrics to Compute & Display

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Rows Suppressed** | count(suppressed rows) | ≤ budget |
| **Row Suppression Rate** | suppressed / N × 100 | < 10% |
| **Cells Suppressed** | count(null cells) | — |
| **Cell Suppression Rate** | null_cells / (N × C) × 100 | — |
| **Budget Utilisation** | suppressed / max_suppress × 100 | ≤ 100% |
| **Uniqueness Eliminated** | count(QI-unique records) before vs after | should drop to 0 |
| **Outlier Records Removed** | count by z-score criterion | — |
| **IL (Row)** | rows_suppressed / N | lower = better |

## 9.5 Report Content

```
=== EXPLICIT SUPPRESSION REPORT ===

Technique       : Explicit Suppression ([Row / Cell / Both])
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]

--- Parameters ---
Mode                 : [Row / Cell / Both]
Criterion            : [Uniqueness / Outlier / Sensitive Value / Threshold]
Suppression Budget   : [budget%]
[Criterion-specific params shown here]

--- Suppression Summary ---
Records Input         : [N]
Records Suppressed    : [count] ([rate%])
Records Retained      : [N - suppressed]
Budget Used           : [used] / [max] ([utilisation%])
Budget Limit Breached : [YES (capped) / NO]

--- Cell Suppression (if applicable) ---
Cells Suppressed      : [count]
Cell Suppression Rate : [rate%]
Columns Affected      : [list]

--- Criterion Analysis ---
[If Uniqueness:]
  QI Unique Records Before : [count]
  QI Unique Records After  : [count] (should be 0)
  QI Groups Below Threshold: [count groups]

[If Outlier (Z-score):]
  Z Threshold Used         : [z]
  Per-column outlier count : [col: count, ...]

[If Sensitive Value:]
  SA Column                : [col]
  Risk Values Suppressed   : [list]
  Records per Risk Value   : [val: count, ...]

[If Threshold:]
  Column                   : [col]
  Bounds Applied           : [[lower], [upper]]
  Records Outside Bounds   : [count]

--- Remaining Dataset QI Profile ---
[Table: QI combination → group_size for all remaining records]
[Flag any group still below min_group_size as WARNING]

--- Interpretation ---
"[count] records ([rate%]) were suppressed using the [criterion] criterion.
 The suppression budget of [budget%] was [met / exceeded — capped at budget].
 [If Uniqueness: All QI-unique records have been removed — no individual can be
  singled out by their QI combination alone.]
 [If Outlier: Records with values beyond [z]σ from the mean were removed,
  eliminating the [n] most extreme records that posed re-identification risk.]"

--- Recommendation ---
[If suppressed > budget]: "More records matched the criterion than the budget allows.
  [n_uncovered] high-risk records remain. Consider increasing the budget or tightening QI selection."
[If suppressed = 0]: "No records matched the suppression criterion. Verify your parameters."
[If suppressed > 20%]: "Over 20% suppression rate — significant data loss. Consider less strict criteria."
```

---

---

# TECHNIQUE 10 — GENERALISATION (Standalone)

## 10.1 Mathematical Foundation

**Formal Definition:**
Standalone Generalisation replaces precise values with less precise but broader representations, reducing the information content of a column without removing records. Unlike K-Anonymity's generalisation (which is tied to equivalence classes), this is applied **directly and uniformly** to columns.

```
gen(v) = f(v)    where f maps precise values → generalised values
```

### Generalisation Types

**1. Numeric Range Binning:**
```
bin(v) = "[b_lo, b_hi)"    where b_lo = floor(v / bin_width) × bin_width
                                  b_hi = b_lo + bin_width
```
Example: Age 27 → "25–29" with bin_width=5.

**Auto bin_width computation (Sturges' rule):**
```
n_bins    = ceil(log₂(N) + 1)
bin_width = (max_col - min_col) / n_bins
```

**2. Numeric Rounding:**
```
rounded(v) = round(v / round_to) × round_to
```
Example: Income 47,832 → 47,000 with round_to=1000.

**3. Date/Time Generalisation:**
```
day    → month    → quarter → year → decade
```
Example: 2023-06-15 → "2023-Q2" or "2023" or "2020s".

**4. Categorical Hierarchy Generalisation:**
```
Level 0 (most specific): City      → "Mumbai"
Level 1               : District   → "Mumbai Metropolitan"
Level 2               : State      → "Maharashtra"
Level 3 (most general): Region     → "West India"
Level max             : Suppress   → "*"
```
The hierarchy must be defined as a lookup table or tree.

**5. Top-k Generalisation (categorical):**
```
gen_topk(v) = v          if rank(v by frequency) ≤ k
gen_topk(v) = "Other"    otherwise
```
Keep the k most frequent categories; merge the rest into "Other". Prevents rare categories from being re-identifying.

### Information Loss per Generalisation Step

For numeric binning:
```
IL = bin_width / (max_col - min_col)     # fraction of range lost
```

For categorical hierarchy:
```
IL = generalisation_level / max_level    # 0 = original, 1 = fully suppressed
```

For top-k:
```
IL = count(mapped to "Other") / N
```

## 10.2 Algorithm (Pseudocode)

```
function standalone_generalisation(D, col_config, seed=42):
    """
    col_config = list of:
      { col, type, params }
    where type ∈ ["bin", "round", "date", "hierarchy", "topk"]
    """
    result = D.copy()
    stats  = {}

    for cfg in col_config:
        col    = cfg["col"]
        g_type = cfg["type"]
        params = cfg["params"]

        original = D[col].copy()

        if g_type == "bin":
            bin_width = params.get("bin_width") or auto_bin_width(original)
            lo = floor(original / bin_width) * bin_width
            hi = lo + bin_width
            result[col] = lo.astype(str) + "–" + hi.astype(str)
            il = bin_width / (original.max() - original.min())

        elif g_type == "round":
            round_to = params["round_to"]
            result[col] = (original / round_to).round() * round_to
            # IL proxy: average absolute rounding error
            il = mean(abs(result[col].astype(float) - original.astype(float))) / original.std()

        elif g_type == "date":
            level  = params["level"]   # "month" | "quarter" | "year" | "decade"
            result[col] = apply_date_generalisation(original, level)
            il = date_il_map[level]    # predefined: month=0.25, quarter=0.5, year=0.75, decade=1.0

        elif g_type == "hierarchy":
            hierarchy_map = params["hierarchy"]   # {original_val: generalised_val}
            level         = params.get("level", 1)
            result[col]   = original.map(lambda v: hierarchy_map.get(v, "*"))
            il = level / params["max_level"]

        elif g_type == "topk":
            k = params["k"]
            top_k_vals = original.value_counts().nlargest(k).index
            result[col] = original.apply(lambda v: v if v in top_k_vals else "Other")
            il = sum(~original.isin(top_k_vals)) / len(original)

        stats[col] = {
            "type"            : g_type,
            "il"              : il,
            "unique_before"   : original.nunique(),
            "unique_after"    : result[col].nunique(),
            "records_changed" : sum(result[col].astype(str) != original.astype(str))
        }

    return result, stats


function auto_bin_width(series):
    N = len(series)
    n_bins = ceil(log2(N) + 1)   # Sturges
    return (series.max() - series.min()) / n_bins
```

## 10.3 Parameters & UI Configuration

Each column gets its own configuration row. The UI should show:

| Parameter | Type | Default | Options / Range | Description |
|-----------|------|---------|-----------------|-------------|
| **Column** | Dropdown | — | All columns | Column to generalise |
| **Generalisation Type** | Dropdown | Bin | Bin / Round / Date / Hierarchy / Top-K | Method applied to this column |
| **Bin Width** (Bin) | Number | auto | > 0 | Width of each numeric range bin |
| **Round To** (Round) | Number | 10 | > 0 | Rounding granularity |
| **Date Level** (Date) | Dropdown | Year | Day→Month→Quarter→Year→Decade | Temporal precision to retain |
| **Hierarchy Table** (Hierarchy) | File/JSON | — | Upload CSV | Mapping: original_val → generalised_val |
| **Top K** (Top-K) | Integer | 10 | 1–50 | Keep top-k most frequent; rest → "Other" |
| **Add Column Button** | Button | — | — | Add another column configuration row |

**No QI or SA needed.** Generalisation is applied per-column, independently.

## 10.4 Metrics to Compute & Display

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Information Loss (IL)** | per-column IL formula (see above) | < 0.30 |
| **Unique Values Before** | nunique(original) per col | — |
| **Unique Values After** | nunique(result) per col | lower = more generalised |
| **Records Changed** | count(result ≠ original) per col | — |
| **Reduction Ratio** | (unique_before - unique_after) / unique_before | higher = more generalisation |
| **"Other" Rate** (Top-K only) | count("Other") / N | < 20% |

## 10.5 Report Content

```
=== GENERALISATION REPORT ===

Technique       : Standalone Generalisation
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]

--- Configuration Summary ---
[Table: Column | Type | Parameters]

--- Column-level Results ---
[Table:]
  Column     | Type      | IL Score | Unique Before | Unique After | Records Changed | Reduction %
  [col_name] | [bin/...] | [0.xx]   | [n]           | [m]          | [count (%)]     | [x%]

--- Before/After Value Distribution ---
[For numeric bin/round: histogram before vs after]
[For categorical top-k: bar chart before (all categories) vs after (top-k + Other)]
[For date: timeline density before vs after at the generalised level]

--- Sample Value Mapping Table ---
[Show 10 example original → generalised value pairs per column]

--- Interpretation ---
"Generalisation was applied to [n] columns. The average information loss score is [avg_IL].
 [col_name] was binned into [n_bins] ranges of width [bin_width].
 [col_name2] had its top [k] categories retained; [rate%] of records were mapped to 'Other'.
 Total records changed: [count] ([rate%]) across all generalised columns."

--- Recommendation ---
[If IL > 0.50 on any col]: "High information loss on [col]. Reduce bin_width or increase Top-K."
[If unique_after == 1]: "Column [col] has been fully generalised to a single value — effectively suppressed."
[If "Other" > 30% for top-k]: "Over 30% of [col] mapped to 'Other'. Increase k to retain more categories."
```

---

---

# TECHNIQUE 11 — DATA SHUFFLING

## 11.1 Mathematical Foundation

**Formal Definition:**
Data Shuffling severs the linkage between quasi-identifier columns and sensitive attribute columns by **permuting the values of SA (or target) columns independently** from the rest of the record.

```
D'[SA] = permutation(D[SA])     # SA values shuffled independently of QI
D'[QI] = D[QI]                  # QI values unchanged
```

The key privacy guarantee: after shuffling, knowing a record's QI values tells you nothing about its SA value, because the SA values have been randomly re-assigned across records.

### Variants

**1. Full Random Shuffle (Global Permutation):**
```
π = random_permutation(1..N)
D'[SA][i] = D[SA][π(i)]    for all i
```
Every SA value is moved to a uniformly random record. Maximum privacy, maximum distortion of individual-level linkage.

**2. Within-Group Shuffle (Stratified Permutation):**
```
for each group G defined by grouping_col:
    π_G = random_permutation(indices in G)
    D'[SA][i] = D[SA][π_G(i)]    for i ∈ G
```
SA values are only shuffled within the same group (e.g., within the same district or age bracket). Preserves group-level statistics while breaking individual linkage.

**3. Rank-Preserving Shuffle (Correlated Permutation):**
```
Sort records by QI → get rank order R_QI
Sort SA values   → get rank order R_SA
Map R_QI(i) → R_SA(j) with bounded perturbation δ:
    j = R_SA⁻¹(R_QI(i) + noise)    where noise ~ Uniform(-δ, +δ)
```
Preserves rank correlation between QI and SA while breaking exact linkage. Useful when the dataset needs to retain trend information (e.g., higher income correlates with higher education, but exact pairs are shuffled).

### Statistical Properties

**Preserved by full shuffle:**
- Marginal distribution of SA: identical (same values, rearranged)
- Marginal distribution of QI: identical (unchanged)
- Column-level statistics (mean, std, quantiles): identical for SA

**Destroyed by full shuffle:**
- Joint distribution P(QI, SA): broken
- Correlation between QI and SA columns: zeroed out
- Individual-level QI↔SA linkage: severed

**Correlation destruction formula:**
```
E[corr(QI_col, SA_col after full shuffle)] ≈ 0
```
This is the primary privacy mechanism — an adversary cannot infer SA from QI.

### Measuring Privacy Gain

**Linkage Risk Before:** An adversary with auxiliary data can match QI → SA for k% of records.
**Linkage Risk After:** Matching probability ≈ 1/N (random chance) for any shuffled SA column.

**Mutual Information Reduction:**
```
MI_before = I(QI; SA) = Σ P(QI=q, SA=s) × log(P(QI=q, SA=s) / (P(QI=q)×P(SA=s)))
MI_after  ≈ 0    (for full shuffle)
```

## 11.2 Algorithm (Pseudocode)

```
function data_shuffling(D, target_cols, variant, group_col=None,
                        rank_delta=0.1, seed=42):
    random.seed(seed)
    result = D.copy()
    N = len(D)
    stats = {}

    for col in target_cols:
        original_vals = D[col].values.copy()

        if variant == "full":
            # Full random permutation
            permuted = random.permutation(original_vals)
            result[col] = permuted

        elif variant == "within_group":
            if group_col is None:
                raise ValueError("group_col required for within-group shuffle")
            permuted = original_vals.copy()
            for group_val in D[group_col].unique():
                group_idx = D.index[D[group_col] == group_val].tolist()
                group_vals = D.loc[group_idx, col].values
                shuffled   = random.permutation(group_vals)
                for i, idx in enumerate(group_idx):
                    permuted[D.index.get_loc(idx)] = shuffled[i]
            result[col] = permuted

        elif variant == "rank_preserving":
            delta        = int(rank_delta * N)   # max rank displacement
            sorted_idx   = argsort(original_vals)   # rank → original position
            rank_order   = argsort(sorted_idx)       # original position → rank
            permuted     = original_vals.copy()
            assigned     = set()

            for i in random.permutation(range(N)):
                rank_i   = rank_order[i]
                lo       = max(0, rank_i - delta)
                hi       = min(N - 1, rank_i + delta)
                candidates = [
                    sorted_idx[r] for r in range(lo, hi+1)
                    if sorted_idx[r] not in assigned
                ]
                if candidates:
                    j = random.choice(candidates)
                    permuted[i] = original_vals[j]
                    assigned.add(j)
                else:
                    permuted[i] = original_vals[i]   # fallback: keep original

            result[col] = permuted

        # Compute stats
        corr_before = pearsonr(D[col].astype(float), D[target_cols[0]].astype(float))[0] \
                      if len(target_cols) > 1 else float('nan')
        stats[col] = {
            "values_changed"    : sum(result[col].values != original_vals),
            "distribution_same" : sorted(result[col].values) == sorted(original_vals),
            "corr_with_qis"     : compute_avg_corr(result, col, D),  # vs all QI cols
            "mean_preserved"    : abs(mean(result[col]) - mean(original_vals)) < 1e-9
                                   if is_numeric(col) else None
        }

    return result, stats
```

## 11.3 Parameters & UI Configuration

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| **Shuffle Variant** | Radio | Full | Full / Within-Group / Rank-Preserving | Type of permutation |
| **Target Columns** | Multi-checkbox | SA columns | Any | Columns whose values are shuffled |
| **Group Column** (Within-Group) | Dropdown | — | Categorical cols | Column defining shuffle groups |
| **Rank Delta (δ)** (Rank-Preserving) | Float slider | 0.10 | 0.01–0.50 | Max fractional rank displacement |
| **Random Seed** | Integer | 42 | 0–9999 | Reproducibility |

**Note on Target Columns:** In the context of privacy, typically the SA column is shuffled. However, any set of columns can be shuffled. Show a warning if the user selects QI columns as targets (shuffling QIs would corrupt re-identification protection).

**No QI needed explicitly,** but the within-group variant requires a group column selection.

## 11.4 Metrics to Compute & Display

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Values Changed** | count(result[col] ≠ original[col]) per col | close to N (full shuffle) |
| **Distribution Preserved** | sorted(result)==sorted(original) | TRUE always |
| **Pearson r (col with itself)** | corr(original, shuffled) per col | ≈ 0 for full shuffle |
| **QI-SA Correlation (before)** | mean corr(QI_cols, SA_col) | — |
| **QI-SA Correlation (after)** | mean corr(QI_cols, shuffled_SA) | ≈ 0 for full shuffle |
| **Within-Group Homogeneity** | variance of SA within each group before vs after | preserved for within-group |
| **Rank Displacement (δ)** | mean(\|rank(v') - rank(v)\|) / N per col | ≤ configured δ |

## 11.5 Report Content

```
=== DATA SHUFFLING REPORT ===

Technique       : Data Shuffling ([Full / Within-Group / Rank-Preserving])
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]

--- Parameters ---
Variant              : [Full / Within-Group / Rank-Preserving]
Target Columns       : [list]
Group Column         : [col or N/A]
Rank Delta (δ)       : [delta or N/A]
Random Seed          : [seed]

--- Column-level Results ---
[Table:]
  Column     | Values Changed | Distribution Preserved | Pearson r (self) | QI Correlation Before | After
  [col_name] | [count (%)]    | [YES/NO]               | [0.xx]           | [0.xx]                | [0.xx]

--- QI–SA Correlation Matrix ---
[Heatmap: before vs after — rows = QI cols, cols = SA/target cols, values = Pearson r]
[After shuffle: all cells should be near 0 for Full variant]

--- Distribution Verification ---
[For each target col: overlay plot of original vs shuffled — should be identical distribution]

--- Within-Group Analysis (if applicable) ---
[For each group value: group size, SA values before shuffle, SA values after shuffle]
[Verify: same set of SA values within each group, just permuted]

--- Rank Displacement Analysis (if Rank-Preserving) ---
[Histogram: rank displacement |rank(v') - rank(v)| per record per column]
[Max displacement should be ≤ δ × N]

--- Privacy Gain Assessment ---
Linkage risk before : Adversary can match record with P ≈ [corr²_before] confidence on SA
Linkage risk after  : Adversary reduced to P ≈ 1/N = [1/N_value] (random chance)

--- Interpretation ---
"Data shuffling was applied to [n] columns using the [variant] method.
 [count] out of [N] values were relocated per column on average.
 The marginal distribution of each column is exactly preserved — the same values exist,
 but the individual-level QI↔SA linkage is severed.
 The average QI–SA Pearson correlation dropped from [corr_before] to [corr_after],
 confirming that an adversary cannot infer sensitive attribute values from quasi-identifiers."

--- Recommendation ---
[If values_changed < 0.5×N on full shuffle]: "Low shuffle rate — possible due to small dataset.
  Verify RNG seed or check for constant columns."
[If corr_after > 0.20]: "Residual correlation detected. For within-group shuffle, consider
  using Full shuffle or reducing group granularity."
[If distribution_preserved = FALSE]: "BUG — distribution should always be preserved by permutation.
  Check implementation."
```

---

---

# TECHNIQUE 12 — CELL SUPPRESSION (for Statistical Tables)

## 12.1 Mathematical Foundation

**Context:** Cell suppression is specifically designed for **aggregated statistical tables** (frequency counts, totals, means published in tabular form) rather than microdata records. It protects against disclosure in published summary statistics.

**Formal Definition:**
A cell c in a statistical table is **suppressed** (replaced with `*`) if its value poses a disclosure risk. Two types of suppression are applied:

```
PRIMARY suppression:   cells that directly violate a disclosure rule
SECONDARY suppression: additional cells suppressed to prevent back-calculation of primary cells
```

### Primary Suppression Rules

**1. Minimum Frequency Rule (n-rule):**
```
suppress c if count(c) < n_min
```
Any cell with fewer than n_min contributing records is suppressed. Standard: n_min = 3 or 5.

**2. Dominance Rule (p% rule / (n,k)-rule):**
```
suppress c if top-k contributors account for > p% of total cell value
```
Example: If the top 1 contributor accounts for > 70% of a cell total — that cell reveals too much about the dominant contributor.
```
dominance(c) = Σ_{i=1}^{k} sorted_contributions[i] / total_cell_value
suppress c if dominance(c) > p/100
```
Standard: k=1, p=70 (one entity dominates 70%).

**3. Prior-Posterior Ambiguity Rule:**
```
suppress c if (upper_bound - lower_bound) / true_value < sensitivity_threshold
```
Used in more advanced implementations. If an adversary can narrow down the true value to within sensitivity_threshold% using other published cells, suppress.

### Secondary Suppression (Complementary Suppression)

After primary suppression, an adversary can often back-calculate suppressed cells from marginal totals (row totals, column totals). Secondary suppression prevents this.

**Audit Condition:** A table is **safe** only if, for every suppressed cell c, the adversary cannot derive a value interval narrower than:
```
[true_c - protection_level, true_c + protection_level]
```
from the remaining published cells and row/column totals.

**Simple Secondary Suppression (Greedy):**
```
for each primary suppressed cell c:
    if row_total - sum(non_suppressed_in_row) = c:   # back-calculable!
        suppress one additional non-primary cell in same row
    if col_total - sum(non_suppressed_in_col) = c:   # back-calculable!
        suppress one additional non-primary cell in same col
```

**Protection Level (p%) for Secondary:**
```
protection = p_pct × cell_value / 100
```
The adversary must not be able to estimate c within ±protection of its true value.

### Table Structure Requirements

The input for cell suppression is an **aggregated table**, not raw microdata. The system must either:
1. Accept a pre-built table (CSV with row/col headers and numeric cells), or
2. Build the table from raw microdata by cross-tabulating two categorical columns with a numeric aggregation column.

```
Table T[r, c] = aggregate(D[value_col], where row_col=r AND col_col=c)
aggregate = count | sum | mean
```

### Information Loss for Tables

```
IL = suppressed_cells / total_non_margin_cells
```
Marginal cells (row totals, column totals, grand total) are typically not suppressed.

## 12.2 Algorithm (Pseudocode)

```
function cell_suppression(table, n_min, p_pct, k_dominance,
                          protection_pct, apply_secondary=True):
    """
    table: 2D array T[R][C] with row_labels, col_labels, marginals
           T[i][j] = {value: float, count: int, contributors: list[float]}
    """
    suppressed = set()   # set of (row_idx, col_idx)
    R, C = len(table), len(table[0])

    # --- STEP 1: PRIMARY SUPPRESSION ---
    for i in range(R):
        for j in range(C):
            cell = table[i][j]
            if cell is marginal_cell:
                continue

            # n-rule
            if cell["count"] < n_min:
                suppressed.add((i, j))
                continue

            # dominance rule
            contribs = sorted(cell["contributors"], reverse=True)
            top_k_sum = sum(contribs[:k_dominance])
            if cell["value"] > 0 and top_k_sum / cell["value"] > p_pct / 100:
                suppressed.add((i, j))

    # --- STEP 2: SECONDARY SUPPRESSION (greedy) ---
    if apply_secondary:
        changed = True
        while changed:
            changed = False
            for (i, j) in list(suppressed):
                # Check row: can this cell be back-calculated?
                row_known = [table[i][jj]["value"]
                             for jj in range(C)
                             if (i, jj) not in suppressed and not is_marginal(i, jj)]
                row_total = table[i][C]   # row marginal
                if abs(row_total - sum(row_known) - table[i][j]["value"]) < 1e-9:
                    # Back-calculable — suppress another cell in same row
                    candidates = [(i, jj) for jj in range(C)
                                  if (i, jj) not in suppressed
                                  and not is_marginal(i, jj)]
                    if candidates:
                        # Choose smallest non-suppressed cell (minimum IL)
                        best = min(candidates, key=lambda x: table[x[0]][x[1]]["value"])
                        suppressed.add(best)
                        changed = True

                # Check col: same logic for column back-calculation
                col_known = [table[ii][j]["value"]
                             for ii in range(R)
                             if (ii, j) not in suppressed and not is_marginal(ii, j)]
                col_total = table[R][j]   # col marginal
                if abs(col_total - sum(col_known) - table[i][j]["value"]) < 1e-9:
                    candidates = [(ii, j) for ii in range(R)
                                  if (ii, j) not in suppressed
                                  and not is_marginal(ii, j)]
                    if candidates:
                        best = min(candidates, key=lambda x: table[x[0]][x[1]]["value"])
                        suppressed.add(best)
                        changed = True

    # Build output table
    output_table = deepcopy(table)
    for (i, j) in suppressed:
        output_table[i][j]["display"] = "*"

    il = len(suppressed) / (R * C)   # exclude marginals from denominator
    return output_table, suppressed, il


function build_table_from_microdata(D, row_col, col_col, value_col, aggregate):
    """Build cross-tabulation table from raw microdata."""
    rows  = sorted(D[row_col].unique())
    cols  = sorted(D[col_col].unique())
    table = {}

    for r in rows:
        table[r] = {}
        for c in cols:
            subset = D[(D[row_col] == r) & (D[col_col] == c)]
            if aggregate == "count":
                val   = len(subset)
                contribs = [1] * len(subset)
            elif aggregate == "sum":
                val   = subset[value_col].sum()
                contribs = subset[value_col].tolist()
            elif aggregate == "mean":
                val   = subset[value_col].mean()
                contribs = subset[value_col].tolist()

            table[r][c] = {
                "value"       : val,
                "count"       : len(subset),
                "contributors": contribs,
                "display"     : str(round(val, 2))
            }

    # Add marginals
    for r in rows:
        table[r]["TOTAL"] = {"value": sum(table[r][c]["value"] for c in cols),
                              "count": sum(table[r][c]["count"] for c in cols),
                              "display": "TOTAL"}
    table["TOTAL"] = {}
    for c in cols:
        table["TOTAL"][c] = {"value": sum(table[r][c]["value"] for r in rows),
                              "display": "TOTAL"}
    table["TOTAL"]["TOTAL"] = {"value": sum(table[r]["TOTAL"]["value"] for r in rows),
                                "display": "GRAND TOTAL"}
    return table, rows, cols
```

## 12.3 Parameters & UI Configuration

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| **Input Mode** | Radio | Build from data | Build from microdata / Upload table CSV | How the table is provided |
| **Row Variable** | Dropdown | — | Categorical cols | Column used as table rows |
| **Column Variable** | Dropdown | — | Categorical cols | Column used as table columns |
| **Value Variable** | Dropdown | — | Numeric cols | Column to aggregate |
| **Aggregation** | Radio | Count | Count / Sum / Mean | How to aggregate value_col |
| **Min Frequency (n)** | Integer slider | 3 | 1–10 | Primary: suppress if count < n |
| **Dominance Threshold (p%)** | Integer slider | 70 | 50–95 | Primary: suppress if top-k contributors > p% |
| **Dominance k** | Integer | 1 | 1–3 | Number of top contributors to check |
| **Apply Secondary Suppression** | Toggle | ON | ON / OFF | Prevent back-calculation via marginals |
| **Protection Level** | % slider | 10 | 5–30 | Min uncertainty around suppressed cell (% of cell value) |

**No QI or SA in the traditional sense.** Row and column variables serve a similar role — they define the table structure.

## 12.4 Metrics to Compute & Display

| Metric | Formula | Good Value |
|--------|---------|------------|
| **Primary Cells Suppressed** | count(primary suppressions) | as few as possible |
| **Secondary Cells Suppressed** | count(secondary suppressions) | as few as needed |
| **Total Suppression Rate** | total_suppressed / total_cells | < 20% |
| **n-rule Violations** | cells with count < n_min (before suppression) | → 0 after |
| **Dominance Violations** | cells violating p% rule (before) | → 0 after |
| **Back-Calculation Safe** | all suppressed cells safe from row/col derivation | TRUE |
| **Information Loss (IL)** | suppressed / total | lower = better |
| **Suppression Pattern** | distribution of suppressed cells across rows/cols | balanced = better |

## 12.5 Report Content

```
=== CELL SUPPRESSION REPORT (Statistical Tables) ===

Technique       : Cell Suppression — Statistical Table Protection
Dataset         : [dataset_name]
Timestamp       : [ISO datetime]

--- Table Configuration ---
Row Variable         : [row_col]   ([n_rows] categories)
Column Variable      : [col_col]   ([n_cols] categories)
Value Variable       : [value_col] (aggregation: [count/sum/mean])
Total Cells          : [R × C] (excl. marginals)

--- Suppression Rules Applied ---
Minimum Frequency (n): [n_min] → suppress if count < [n_min]
Dominance Rule       : suppress if top-[k] contributors > [p%]% of cell total
Secondary Suppression: [ENABLED / DISABLED]
Protection Level     : [protection%]%

--- Suppression Summary ---
Primary Suppressions  : [count] cells ([rate%])
  ↳ n-rule triggered  : [count]
  ↳ Dominance triggered: [count]
Secondary Suppressions: [count] cells ([rate%])
Total Cells Suppressed: [total] / [R×C] = [IL%]
Back-Calculation Safe : [ALL SAFE / WARNING: [n] cells remain calculable]

--- Published Table (with suppressions) ---
[Rendered table: rows = row_col values + TOTAL row,
                 cols = col_col values + TOTAL col,
                 suppressed cells shown as  * ]
[Primary suppressed: marked with *  ]
[Secondary suppressed: marked with ** ]
[Marginal totals: always shown       ]

--- Pre-Suppression Table (for reference) ---
[Same table with all actual values — only shown in internal/admin report]

--- Cell Frequency Heatmap ---
[Heatmap of count(records per cell) — cells below n_min highlighted red]

--- Dominance Analysis ---
[For each dominance-suppressed cell: show top contributor's share %]
[E.g., "Cell (Maharashtra, Agriculture): top contributor = 85% → SUPPRESSED"]

--- Row/Column Safety Audit ---
[For each row: verify that the set of suppressed cells prevents back-calculation]
[For each col: same verification]
[Output: ROW [label] — SAFE / UNSAFE (needs more secondary suppression)]

--- Interpretation ---
"The [R×C] statistical table was protected using cell suppression.
 [n_primary] cells triggered primary suppression: [n_n_rule] via the minimum
 frequency rule (count < [n_min]) and [n_dom] via the dominance rule (top-[k]
 contributors > [p]%). [n_secondary] additional cells were secondarily suppressed
 to prevent back-calculation from marginal totals.
 The total information loss is [IL%] — [low/medium/high] relative to table size.
 All [total_suppressed] suppressed cells are protected against back-calculation."

--- Recommendation ---
[If back-calculation still possible]: "CRITICAL — [n] suppressed cells are still back-calculable.
  Add more secondary suppressions or increase protection level."
[If IL > 30%]: "High information loss. Consider merging small row/col categories to reduce sparse cells."
[If n_primary = 0]: "No cells violate the suppression rules — table is already safe to publish."
[If entire row suppressed]: "Row '[label]' is fully suppressed — consider merging with adjacent category."
```

---

---

# UPDATED CROSS-CUTTING TABLES

## Updated Technique-to-Column-Type Matrix (All 12 Techniques)

| # | Technique | Needs QI | Needs SA | Target Cols Type | Input Type |
|---|-----------|----------|----------|------------------|------------|
| 1 | K-Anonymity | YES (≥1) | NO | None (QI generalised) | Microdata |
| 2 | L-Diversity | YES (≥1) | YES (1) | None | Microdata |
| 3 | T-Closeness | YES (≥1) | YES (1) | None | Microdata |
| 4 | Rank Swapping | NO | NO | Numeric | Microdata |
| 5 | Microaggregation | NO | NO | Numeric | Microdata |
| 6 | PRAM | NO | NO | Categorical | Microdata |
| 7 | Top/Bottom Coding | NO | NO | Numeric | Microdata |
| 8 | **Noise Addition** | NO | NO | Numeric | Microdata |
| 9 | **Explicit Suppression** | Conditional | Conditional | Any (configurable) | Microdata |
| 10 | **Generalisation** | NO | NO | Any (per-col config) | Microdata |
| 11 | **Data Shuffling** | NO | Optional | Any | Microdata |
| 12 | **Cell Suppression** | NO (row/col var instead) | NO (value var instead) | Aggregated table | Microdata → Table |

## Updated Error Handling Rules (New Techniques)

| Condition | Error Message | Action |
|-----------|--------------|--------|
| Noise λ = 0 | "Noise multiplier cannot be 0 — no noise will be added" | Block Apply |
| Noise on non-numeric col | "Noise Addition requires numeric columns only" | Block Apply |
| Explicit Suppression: Uniqueness with no QI | "Uniqueness criterion requires at least one QI column" | Block Apply |
| Explicit Suppression: Sensitive Value with no SA | "Sensitive Value criterion requires an SA column and risk values list" | Block Apply |
| Explicit Suppression: suppressed = 0 | "No records match the criterion — adjust your parameters" | Warning |
| Generalisation: bin_width ≥ (max - min) | "Bin width is larger than column range — all values map to one bin" | Warning |
| Generalisation: top_k ≥ n_unique | "K ≥ unique categories — no 'Other' group will be formed" | Warning |
| Data Shuffling: target col is constant | "Column [col] has a single unique value — shuffling has no effect" | Warning |
| Data Shuffling: within-group, no group_col | "Within-Group variant requires a group column" | Block Apply |
| Cell Suppression: row_col = col_col | "Row and column variables must be different columns" | Block Apply |
| Cell Suppression: table has < 2 rows or cols | "Table must have at least 2 rows and 2 columns for meaningful suppression" | Block Apply |
| Cell Suppression: all cells in a row suppressed | "Row '[label]' is fully suppressed — consider merging with another category" | Warning |
| Cell Suppression: back-calc still possible | "UNSAFE: [n] suppressed cells are still back-calculable — enable secondary suppression" | Warning |

---

*End of SDC Privacy Enhancement Module Specification*
*Version 2.0 | Statathon 2025 | AIRAVATA Technologies*
*Original 7 techniques: v1.0 | Added Techniques 8–12: v2.0*
