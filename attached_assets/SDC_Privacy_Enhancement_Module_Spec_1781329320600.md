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

*End of SDC Privacy Enhancement Module Specification*
*Version 1.0 | Statathon 2025 | AIRAVATA Technologies*
