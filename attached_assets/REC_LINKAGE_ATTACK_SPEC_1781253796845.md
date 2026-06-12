# Risk Assessment Module — Record Linkage Attack: Complete Specification

> **For Replit Agent**: This document defines the complete implementation for the **Record Linkage (Rec. Linkage) Attack** in the Risk Assessment module. It follows the same structure as the Prosecutor Attack spec. Replace all mock/placeholder logic for this attack with the accurate implementations described below. This document covers: what a Record Linkage attack is, the mathematical model, the full algorithm in code, and the complete UI output format for the results panel.

---

## 1. What is a Record Linkage Attack?

### 1.1 Threat Model

The **Record Linkage Attack** models an adversary who:

1. Has access to **two or more datasets** — the anonymised target dataset AND an **external auxiliary dataset** (e.g., a public voter roll, hospital registry, social media profile dump, or census extract).
2. Does **not** know for certain whether a specific person is in the target dataset.
3. Tries to **join / link** records from the auxiliary dataset to records in the target dataset using shared quasi-identifiers.
4. If a record in the auxiliary dataset matches **exactly one** record in the target dataset on all shared QI columns, the attacker has successfully re-identified that person — and now gains access to the sensitive attributes in the target dataset.

**Key distinction from Prosecutor Attack:**
- Prosecutor assumes the attacker knows the target IS in the dataset and attacks that specific person.
- Record Linkage assumes the attacker has an **entire external table** and tries to re-identify **as many people as possible** at once via a join operation. It is a **bulk re-identification** threat.

### 1.2 Real-World Example

Imagine your dataset is a government health survey (anonymised):
```
[Target Dataset]
State | District | Round | Age_Group | Income_Bracket | Disease_Status
MH    | D04      | 2     | 30-40     | Low            | Diabetic
MH    | D04      | 2     | 30-40     | Low            | Healthy
UP    | D11      | 1     | 50-60     | Medium         | Hypertensive
```

An attacker has a publicly available voter roll:
```
[Auxiliary Dataset]
Name          | State | District | Round | Age_Group | Income_Bracket
Ramesh Kumar  | UP    | D11      | 1     | 50-60     | Medium
Priya Sharma  | MH    | D04      | 2     | 30-40     | Low
...
```

The attacker joins on `[State, District, Round, Age_Group, Income_Bracket]`.

- Row 3 of the target matches **only one** row in the auxiliary dataset → Ramesh Kumar is now linked, and the attacker knows he is Hypertensive.
- Rows 1 and 2 of the target match **two** records in the auxiliary dataset → ambiguous, attacker cannot distinguish.

This is a Record Linkage attack.

---

## 2. Core Concepts (Specific to Record Linkage)

### 2.1 Equivalence Classes (same as Prosecutor)

Same definition applies:
```
EC(r) = { all records in target dataset sharing the same QI combination as record r }
```

### 2.2 Linkage Risk Per Record

For each record `r` in the target dataset:

```
Linkage_Risk(r) = 1 / |EC(r)|
```

**Intuition:**
- If `|EC(r)| = 1` → The record has a **unique QI fingerprint**. Any external database containing this person will link back to exactly one record → **100% linkage certainty**.
- If `|EC(r)| = k` → The attacker's external record could match any of k people in this group → only 1/k probability of correct linkage.

### 2.3 Dataset-Level Linkage Risk (Expected Linkage Rate)

```
Expected_Linkage_Rate = (1/N) × Σ (1 / |EC(r)|)   for all records r
```

Equivalent simplified form:
```
Expected_Linkage_Rate = number_of_distinct_EC_combinations / total_records
```

This tells you: **"On average, what fraction of records in this dataset can be correctly linked to an external source?"**

### 2.4 Successful Linkage Count

The attacker is considered to have **successfully linked** a record if the EC size = 1 (unique match):
```
Successful_Links = count(records where |EC(r)| = 1)
Successful_Link_Rate = Successful_Links / N × 100
```

### 2.5 Linkage Probability Distribution

Beyond just unique records, the attack succeeds with varying probability across EC sizes:

| EC Size | Linkage Probability | Interpretation |
|---------|--------------------|-|
| 1       | 1.00               | Certain re-identification |
| 2       | 0.50               | Coin flip |
| 3       | 0.33               | 1-in-3 chance |
| 4       | 0.25               | 1-in-4 chance |
| 5 (k=5) | 0.20               | At k-anonymity threshold |
| ≥10     | ≤0.10              | Low but non-zero risk |

---

## 3. Mathematical Model — Record Linkage Attack

### 3.1 Core Formula

For a target dataset `D` with `N` records and selected quasi-identifiers `QI = {q1, q2, ..., qm}`:

**Step 1 — Partition into Equivalence Classes:**
```
ECs = { EC₁, EC₂, ..., EC_j }   where  Σ|EC_i| = N
```

**Step 2 — Per-Record Linkage Score:**
```
link_score(r) = 1 / |EC(r)|
```

**Step 3 — Expected Correct Linkage Rate (ECLR):**
```
ECLR = (1/N) × Σᵣ link_score(r)
     = (1/N) × Σ_EC (|EC| × (1/|EC|))
     = |distinct ECs| / N
```

**Step 4 — Worst-Case Linkage Risk (WCLR):**
```
WCLR = max(link_score(r)) for all r
     = 1 / min(|EC|)
```

If `min(|EC|) = 1`, then `WCLR = 1.0` (100%) — i.e., at least one person is fully linkable.

**Step 5 — Safe Linkage Threshold:**

A dataset is considered **safe** under a record linkage attack if:
```
ECLR < 0.09  (less than 9% expected linkage, equivalent to effective k ≈ 11+)
AND
min(|EC|) ≥ k_user   (no EC smaller than user-set k)
```

### 3.2 Linkage Risk Score (0–100) for Badge Display

```
Linkage_Risk_Score = ECLR × 100

Badge colour:
  🔴 >20  — HIGH: Over 1-in-5 records are linkable
  🟡 5–20 — MEDIUM: Partial linkage risk
  🟢 <5   — LOW: Dataset is well-anonymised against linkage
```

### 3.3 Attack Amplification Factor

The **Amplification Factor** quantifies how much worse the linkage attack is compared to a purely random guess:

```
Random_Guess_Accuracy = 1 / N     (if attacker picked a record at random)

Amplification_Factor = ECLR / (1/N)
                     = ECLR × N
                     = number_of_distinct_ECs
```

**Example:** If N = 10,000 and ECLR = 0.40, then Amplification Factor = 4,000×. The linkage attack is 4,000 times more effective than random guessing.

---

## 4. Full Record Linkage Attack Algorithm (Step by Step)

```python
def record_linkage_attack(dataframe, quasi_identifiers, sensitive_attributes, k, l, t, sample_size_pct):

    # Step 1: Sample
    df = dataframe.sample(frac=sample_size_pct / 100, random_state=42)
    N = len(df)

    # Step 2: Build Equivalence Classes on QIs
    ec_groups = df.groupby(quasi_identifiers)
    ec_sizes = ec_groups.size().reset_index(name='ec_size')
    df = df.merge(ec_sizes, on=quasi_identifiers, how='left')

    # Step 3: Compute per-record linkage score
    df['link_score'] = 1.0 / df['ec_size']

    # Step 4: Mark linkage outcome
    df['linkage_status'] = df['ec_size'].apply(
        lambda s: 'Certain' if s == 1
                  else 'Probable' if s <= 3
                  else 'Possible' if s < k
                  else 'Protected'
    )
    df['at_risk'] = df['ec_size'] < k   # True = at risk under k-threshold

    # Step 5: Dataset-level metrics
    num_unique_records = (df['ec_size'] == 1).sum()
    num_probable = ((df['ec_size'] > 1) & (df['ec_size'] <= 3)).sum()
    num_possible = ((df['ec_size'] >= 4) & (df['ec_size'] < k)).sum()
    num_protected = (df['ec_size'] >= k).sum()

    distinct_ecs = df.groupby(quasi_identifiers).ngroups
    eclr = distinct_ecs / N                     # Expected Correct Linkage Rate
    wclr = 1.0 / df['ec_size'].min()            # Worst-Case Linkage Risk
    min_k = df['ec_size'].min()
    avg_ec_size = df['ec_size'].mean()
    amplification_factor = distinct_ecs         # How many times better than random

    # Step 6: L-Diversity check (per sensitive attribute)
    l_div_results = {}
    for sa in sensitive_attributes:
        l_vals = ec_groups[sa].nunique().reset_index(name='l_diversity')
        l_div_results[sa] = {
            'min_l': l_vals['l_diversity'].min(),
            'violating_ecs': (l_vals['l_diversity'] < l).sum(),
            'total_ecs': len(l_vals)
        }

    # Step 7: T-Closeness check (per sensitive attribute)
    t_close_results = {}
    for sa in sensitive_attributes:
        global_dist = df[sa].value_counts(normalize=True)
        max_distance = 0
        violating_ecs = 0
        for name, group in ec_groups:
            local_dist = group[sa].value_counts(normalize=True)
            all_values = set(global_dist.index) | set(local_dist.index)
            tvd = 0.5 * sum(abs(local_dist.get(v, 0) - global_dist.get(v, 0)) for v in all_values)
            max_distance = max(max_distance, tvd)
            if tvd > t:
                violating_ecs += 1
        t_close_results[sa] = {
            'max_distance': max_distance,
            'violating_ecs': violating_ecs,
            'total_ecs': distinct_ecs
        }

    # Step 8: Top vulnerable records (sorted by link_score desc)
    top_vulnerable = df.sort_values('link_score', ascending=False).head(10)

    return {
        'N': N,
        'distinct_ecs': distinct_ecs,
        'eclr': eclr,
        'wclr': wclr,
        'min_k': min_k,
        'avg_ec_size': avg_ec_size,
        'amplification_factor': amplification_factor,
        'num_unique_records': num_unique_records,
        'num_probable': num_probable,
        'num_possible': num_possible,
        'num_protected': num_protected,
        'linkage_risk_score': eclr * 100,
        'df_with_scores': df,
        'l_div_results': l_div_results,
        't_close_results': t_close_results,
        'top_vulnerable': top_vulnerable
    }
```

---

## 5. UI Results Panel — All Required Sections

The right-hand panel must render all sections below after the assessment runs. All numbers are dynamic — computed from the algorithm above. No hardcoded values.

---

### 5.1 Plain-English Summary Card (Top of Panel)

Display a prominent summary paragraph filled with actual computed values:

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔴  Record Linkage Risk: HIGH                                       │
│                                                                     │
│  An attacker with an external dataset (e.g., a voter roll or        │
│  hospital registry) could successfully re-identify [ECLR×100]% of  │
│  records in your dataset by joining on the selected quasi-          │
│  identifiers. [num_unique_records] out of [N] records are           │
│  UNIQUELY identifiable — meaning they can be linked with 100%       │
│  certainty. The attack is [amplification_factor]× more effective    │
│  than random guessing.                                              │
│                                                                     │
│  Results based on [N] rows ([sample_pct]% sample) |                 │
│  QIs used: [QI names] | SAs: [SA names]                            │
└─────────────────────────────────────────────────────────────────────┘
```

**Badge colour rule:**
- 🔴 `ECLR > 0.20` → HIGH
- 🟡 `0.05 ≤ ECLR ≤ 0.20` → MEDIUM
- 🟢 `ECLR < 0.05` → LOW

---

### 5.2 Key Metrics Row (Summary Statistics)

Display as a horizontal row of metric cards:

| Metric | Value | Status Colour |
|--------|-------|---------------|
| **Expected Linkage Rate** | `[ECLR × 100]%` | 🔴 >20% / 🟡 5–20% / 🟢 <5% |
| **Worst-Case Linkage Risk** | `[WCLR × 100]%` | 🔴 if =100%, else 🟡 |
| **Minimum EC Size (Min-K)** | `[min_k]` | 🔴 if < user_k |
| **Unique (Certain Links)** | `[num_unique_records] records` | 🔴 if > 0 |
| **Avg. EC Size** | `[avg_ec_size]` | Informational |
| **Amplification Factor** | `[amplification_factor]×` | Informational |

**Tooltip on Amplification Factor:**
> "The Record Linkage attack is [X] times more accurate than a random guess on this dataset. Higher = more dangerous."

---

### 5.3 Linkage Outcome Distribution (Donut / Pie Chart)

Four-segment donut chart using **actual counts**:

| Segment | Condition | Count | Colour |
|---------|-----------|-------|--------|
| Certain | `ec_size = 1` | `[num_unique_records]` | 🔴 Red |
| Probable | `ec_size 2–3` | `[num_probable]` | 🟠 Orange |
| Possible | `4 ≤ ec_size < k` | `[num_possible]` | 🟡 Yellow |
| Protected | `ec_size ≥ k` | `[num_protected]` | 🟢 Green |

**Legend tooltips:**
- **Certain:** EC size = 1. Attacker links with 100% confidence. These records must be suppressed or generalised.
- **Probable:** EC size 2–3. Attacker has >33% chance of correct linkage — above random.
- **Possible:** EC size between 4 and k. Some risk remains below your k-threshold.
- **Protected:** EC size ≥ k. At or above your privacy threshold. Low linkage risk.

---

### 5.4 Record-Level Linkage Trace Table

Show one row per record (paginated at 50 rows). This is the core diagnostic output.

**Columns:**
| Column | Content |
|--------|---------|
| Row # | Original row index |
| [QI₁] ... [QIₙ] | Actual values of each selected QI |
| EC Size | How many records share this exact QI combination |
| Link Score | `1 / EC Size` (e.g., 1.00, 0.50, 0.20) |
| Linkage Outcome | Certain / Probable / Possible / Protected |
| Status | 🔴 At Risk (if ec_size < k) / 🟢 Protected |

**Header definitions row** (displayed below column headers as subtext):
- **EC Size**: How many people in this dataset share your exact combination of [QI names]. EC Size = 1 means you are the only person with this fingerprint.
- **Link Score**: Probability an attacker correctly links an external record to this row. 1.00 = 100% certain.
- **Linkage Outcome**: Certain (1.00) / Probable (>0.33) / Possible (>0.20) / Protected (≤1/k).

**Filter bar above table:**
```
[ Show All ] [ 🔴 Certain ] [ 🟠 Probable ] [ 🟡 Possible ] [ 🟢 Protected ]   Search: [___]
```

**Export button:** "Download Full Table (CSV)" — exports all rows with link scores and outcomes.

---

### 5.5 Attack Simulation Narrative — "How the Attack Works on YOUR Data"

Step-by-step walkthrough using **actual values from the top vulnerable record** in the dataset:

```
RECORD LINKAGE SIMULATION — Step by Step

Step 1 — Attacker's External Dataset
  The attacker has an external dataset (e.g., voter roll, hospital registry).
  It contains records with columns: [QI names].
  They choose to JOIN this external data with your released dataset.

Step 2 — Join Condition
  The attacker performs:
    SELECT target.*, external.Name
    FROM target_dataset
    JOIN external_dataset
      ON target.[QI₁] = external.[QI₁]
     AND target.[QI₂] = external.[QI₂]
     AND target.[QI₃] = external.[QI₃]
     ...

Step 3 — Result on Most Vulnerable Record (Row #[row_id])
  QI Combination: [QI₁]=[val₁], [QI₂]=[val₂], [QI₃]=[val₃]...
  
  Records matched in your dataset: 1  ← UNIQUE MATCH
  
  The attacker has linked this person with 100% certainty.
  They now know this individual's:
    [SA₁] = [value]
    [SA₂] = [value]

Step 4 — Scale Across Dataset
  Total records linkable with certainty (EC=1): [num_unique_records]
  Total records linkable with >50% probability: [num_certain + num_probable]
  Expected Correct Linkage Rate: [ECLR × 100]%
  
  Of every 100 records an attacker attempts to link,
  approximately [ECLR × 100] will be correctly re-identified.

Step 5 — Amplification
  Compared to random guessing (1 in [N] = [1/N × 100]% chance),
  this attack is [amplification_factor]× more effective.
```

---

### 5.6 Equivalence Class Size Distribution (Chart + Table)

**Table:**
| EC Size | Number of ECs | Number of Records | % of Dataset | Risk Level |
|---------|---------------|-------------------|--------------|------------|
| 1 (Unique) | [count] | [records] | [pct]% | 🔴 Certain |
| 2–3 | [count] | [records] | [pct]% | 🟠 Probable |
| 4–(k-1) | [count] | [records] | [pct]% | 🟡 Possible |
| k–10 | [count] | [records] | [pct]% | 🟢 Protected |
| >10 | [count] | [records] | [pct]% | 🟢 Safe |

**Chart:** Horizontal bar chart.
- X-axis: number of records in that EC size bucket
- Y-axis: EC size categories
- Colour coding matches risk levels above (Red → Orange → Yellow → Green)
- Add a **vertical dashed line** at EC size = k (user-set k) labelled "Your k-threshold"

---

### 5.7 Link Score Distribution (Histogram)

Histogram of link scores across all N records:

| Score Range | Number of Records | Risk Level |
|-------------|-------------------|------------|
| 1.00 (Certain) | [count] | 🔴 |
| 0.34–0.99 (Probable) | [count] | 🟠 |
| 0.20–0.33 (Possible) | [count] | 🟡 |
| 0.10–0.19 (Low) | [count] | 🟡 |
| 0.00–0.09 (Protected) | [count] | 🟢 |

**Chart note below histogram:**
> "The Record Linkage attack is most damaging when many records have a score of 1.00. Even scores of 0.50 (EC size = 2) represent a significant risk — the attacker has a 1-in-2 chance of correct linkage."

---

### 5.8 L-Diversity Results (Per Sensitive Attribute)

Shown for each selected Sensitive Attribute:

```
L-Diversity Check (threshold l = [user_l])

Sensitive Attribute: [SA_NAME]
  Minimum distinct SA values in any EC:  [min_l]
  ECs violating l-diversity:             [violating_ecs] out of [total_ecs] ([pct]%)
  Records in violating ECs:              [records_in_violating_ecs] ([pct]% of dataset)

  Meaning: In [violating_ecs] groups, fewer than [l] distinct [SA_NAME] values
           exist. An attacker who links a record to its EC can infer [SA_NAME]
           with high confidence — even without unique re-identification.

  Status: 🔴 FAIL   (if violating_ecs > 0)
          🟢 PASS   (if all ECs have ≥ l distinct values)
```

---

### 5.9 T-Closeness Results (Per Sensitive Attribute)

```
T-Closeness Check (threshold t = [user_t])

Sensitive Attribute: [SA_NAME]
  Global distribution:          {value₁: X%, value₂: Y%, ...}
  Maximum EC deviation (TVD):   [max_distance]
  ECs violating t-closeness:    [violating_ecs] out of [total_ecs] ([pct]%)

  Meaning: In [violating_ecs] groups, the distribution of [SA_NAME] is very
           different from the overall dataset. Once a record is linked to its
           EC, the attacker can make high-confidence inferences about
           [SA_NAME] purely from the group distribution — even if individual
           records are not uniquely identified.

  Status: 🔴 FAIL   (if violating_ecs > 0)
          🟢 PASS   (if all ECs have TVD ≤ t)
```

**Note for implementation:** Display global distribution as a small horizontal bar chart next to the text, not just as raw numbers.

---

### 5.10 Top Vulnerable Records Table

Show the 10 records with the highest link scores (sorted descending):

| Rank | QI Combination (full values) | EC Size | Link Score | Linkage Outcome | Why Vulnerable |
|------|------------------------------|---------|------------|-----------------|----------------|
| 1 | [QI₁=val, QI₂=val, ...] | 1 | 1.00 | Certain | Unique QI fingerprint — no look-alike in dataset |
| 2 | [QI₁=val, QI₂=val, ...] | 1 | 1.00 | Certain | Unique QI fingerprint — no look-alike in dataset |
| 3 | [QI₁=val, QI₂=val, ...] | 2 | 0.50 | Probable | Only 2 records share this combination |
| ... | ... | ... | ... | ... | ... |

**Note below table:**
> "These records should be suppressed or have their quasi-identifiers generalised before this dataset is released."

---

### 5.11 QI Contribution Analysis

This section is **unique to Record Linkage** (not present in Prosecutor spec). It shows which quasi-identifiers are most responsible for high linkage risk.

**For each QI column, compute:**
```
QI_Contribution(qᵢ) = ECLR_without_qᵢ  vs  ECLR_with_qᵢ

Delta_i = ECLR_full - ECLR_without_qᵢ
```
The QI with the largest positive delta is the **most dangerous** — removing it reduces risk the most.

**Display as a ranked table:**

| Rank | Quasi-Identifier | ECLR Without This QI | Delta (Risk Reduction if Removed) | Recommendation |
|------|-----------------|----------------------|-----------------------------------|----------------|
| 1 | FSU_Serial_No | 12% | −65% | 🔴 Primary driver — generalise first |
| 2 | District_Code | 38% | −39% | 🟠 High impact |
| 3 | Round | 74% | −3% | 🟡 Low impact alone |
| 4 | State | 76% | −1% | 🟢 Minimal marginal risk |

**Chart:** Horizontal bar chart of "Risk Reduction if Removed" values. Colour 🔴 for >30%, 🟠 for 10–30%, 🟡 for <10%.

---

### 5.12 Recommendations Section (Auto-Generated, Conditional)

Generate only the blocks where the condition is actually violated. Do not show static placeholder text.

```
RECOMMENDATIONS (based on Record Linkage Assessment)

🔴 CRITICAL — [num_unique_records] records are uniquely linkable (EC size = 1)
   These records have a unique QI fingerprint and can be re-identified with
   100% certainty from any external dataset containing these individuals.
   Action: Suppress these [num_unique_records] rows before release, OR
   generalise the top-contributing QI ([top_qi_name]) by replacing 
   specific values with range brackets or categories.

🔴 HIGH — Expected Linkage Rate is [ECLR×100]% (safe threshold: <5%)
   Action: Apply k-anonymisation. Increase generalisation of 
   [top_contributing_qi] to raise the minimum EC size to at least [user_k].
   Target: ECLR < 5% (requires Min-K ≥ 20).

🟠 MEDIUM — [num_probable] records have Probable linkage risk (EC size 2–3)
   Action: These records are not uniquely linkable, but an attacker still
   has a 33–50% chance of correct linkage. Consider increasing generalisation
   to push all EC sizes to at least [user_k].

🟡 LOW — [num_possible] records are Possibly linkable (EC size 4 to k-1)
   These records fall below your k=[user_k] threshold.
   Action: Fine-tune generalisation of lower-impact QIs to bring these
   groups up to the k threshold.

🟡 L-Diversity violated for [SA names]  (if applicable)
   Action: Even records that survive linkage filtering can leak sensitive
   attributes if ECs are not l-diverse. Ensure each QI group has at 
   least [l] distinct values of [SA name].

🟡 T-Closeness violated for [SA names]  (if applicable)
   Action: Attribute distributions inside some ECs are very different from
   the global dataset. Restrict release of [SA name] or apply noise.

ℹ️ NEXT STEP
   Go to "Privacy Enhancement" to apply these fixes automatically.
   After enhancement, re-run this assessment to verify improvement.
```

---

### 5.13 Attack Score for Badge Display

```
Linkage_Risk_Score = ECLR × 100

Display as badge on the "Rec. Linkage" chip in the attack scenarios list:
  🔴  Score > 20  — HIGH RISK
  🟡  Score 5–20 — MEDIUM RISK
  🟢  Score < 5  — LOW RISK
```

This score also feeds into the **Overall Comparison Score** in the top navigation bar:
```
overall_score = mean(all enabled attack scores)
rec_linkage_contribution = ECLR × 100
```

---

## 6. Data Flow Summary

```
User uploads CSV
       ↓
User selects QIs + SAs + sets k, l, t, sample_size
       ↓
[Run Assessment clicked — Rec. Linkage enabled]
       ↓
1.  Sample dataset at sample_size_pct
2.  Build equivalence classes (groupby selected QIs)
3.  Compute ec_size per record
4.  Compute link_score = 1 / ec_size per record
5.  Classify each record: Certain / Probable / Possible / Protected
6.  Compute ECLR = distinct_ecs / N
7.  Compute WCLR = 1 / min(ec_size)
8.  Compute Amplification Factor = distinct_ecs
9.  Run L-Diversity check per SA
10. Run T-Closeness check per SA
11. Compute QI Contribution Analysis (ECLR delta per QI)
12. Identify top 10 vulnerable records
13. Generate conditional recommendations
       ↓
Render all 13 result sections in the right-hand panel
```

---

## 7. Difference Between Record Linkage and Prosecutor Attack (Implementation Note)

| Property | Prosecutor Attack | Record Linkage Attack |
|---|---|---|
| Adversary goal | Re-identify **one specific known target** | Re-identify **as many records as possible** via bulk join |
| Adversary knowledge | Knows target IS in dataset | Has external dataset; performs a join |
| Risk formula | `1 / EC_size` (same) | `1 / EC_size` (same) |
| Key metric | Re-ID Risk = ECLR (same formula) | Expected Correct Linkage Rate = ECLR |
| Extra metric | None | Amplification Factor, QI Contribution Analysis |
| Outcome labels | At Risk / Protected | Certain / Probable / Possible / Protected |
| Extra UI sections | None | QI Contribution Analysis (Section 5.11) |
| Attack narrative | Single target trace | Bulk join simulation |

> **Note for Replit Agent:** The underlying **risk formula is identical** for both attacks (`1 / EC_size`). The difference is in the framing, narrative, extra metrics (Amplification Factor, QI Contribution), outcome labels (Certain/Probable vs At Risk), and the additional QI Contribution Analysis table unique to Record Linkage. Reuse the EC computation code — do not duplicate it.

---

## 8. Implementation Notes for Replit Agent

1. **Reuse EC computation** from the Prosecutor attack module. Both attacks operate on the same equivalence classes. Compute them once per assessment run and share across attacks.
2. **The record-level trace table (Section 5.4) is mandatory.** Paginate at 50 rows. Add CSV export button.
3. **The Attack Simulation Narrative (Section 5.5) must use real values** pulled from the actual top vulnerable record.
4. **QI Contribution Analysis (Section 5.11)** requires re-running `groupby` with each QI removed one at a time. For M quasi-identifiers, this means M additional EC computations — cache the results.
5. **Outcome labels differ from Prosecutor:** Use Certain / Probable / Possible / Protected (not just At Risk / Protected).
6. **Recommendations (Section 5.12) must be conditional** — only render a block if that condition is actually violated.
7. **All charts must use real distributions** — no dummy data arrays.
8. **The Linkage Outcome donut (Section 5.3)** must show four segments with actual counts, not two.
9. **Status badges** on the "Rec. Linkage" chip should update after every run based on ECLR.
10. **Export:** "Download Full Report (CSV)" exports the full record-level table with link scores, EC sizes, and outcome labels.

---

*Specification version: 1.0 | For MoSPI Statathon 2025 — SafeData Pipeline*
