# Risk Assessment Module — Attribute Disclosure Attack: Complete Specification

> **For Replit Agent**: This document defines the complete implementation for the **Attribute Disclosure (Attr. Disclose) Attack** in the Risk Assessment module. It follows the same structure as the Prosecutor and Record Linkage attack specs. Replace all mock/placeholder logic for this attack with the accurate implementations described below. This document covers: what an Attribute Disclosure attack is, the mathematical model, the full algorithm in code, and the complete UI output format for the results panel.

---

## 1. What is an Attribute Disclosure Attack?

### 1.1 Threat Model

The **Attribute Disclosure Attack** models an adversary who:

1. Does **not** need to uniquely re-identify a specific individual.
2. Instead, the attacker learns something **sensitive and certain** about a target by narrowing them down to an equivalence class (EC) — even if the EC contains multiple people.
3. If **every record in an EC shares the same value** for a sensitive attribute (SA), then any attacker who knows a person belongs to that EC **automatically knows their sensitive attribute value** — regardless of k-anonymity.
4. This is a **weaker attacker** than the Prosecutor, but it covers a much larger fraction of datasets: k-anonymity alone does NOT protect against attribute disclosure.

**Key insight:**
> A dataset can satisfy k-anonymity (all ECs have size ≥ k) and still be 100% vulnerable to attribute disclosure, if every EC is internally homogeneous on a sensitive attribute.

### 1.2 Real-World Example

Consider a health dataset anonymised to k=3:

```
[Target Dataset — k=3 satisfied]
State | District | Age_Group | Disease_Status
MH    | D04      | 30-40     | Diabetic        ← EC A, record 1
MH    | D04      | 30-40     | Diabetic        ← EC A, record 2
MH    | D04      | 30-40     | Diabetic        ← EC A, record 3
UP    | D11      | 50-60     | Healthy         ← EC B, record 1
UP    | D11      | 50-60     | Healthy         ← EC B, record 2
UP    | D11      | 50-60     | Healthy         ← EC B, record 3
```

The dataset satisfies k=3 (every EC has 3 records). But:

- An attacker who knows someone is in EC A (State=MH, District=D04, Age=30-40) **immediately knows they are Diabetic** — without identifying which of the 3 they are.
- This is **Attribute Disclosure** — the sensitive value is disclosed even though re-identification did not occur.

This attack is precisely what **L-Diversity** was designed to prevent — but this spec evaluates how severely the dataset fails it, and which ECs and sensitive attributes are worst.

### 1.3 Distinction from Other Attacks

| Property | Prosecutor Attack | Record Linkage | Attribute Disclosure |
|---|---|---|---|
| Goal | Identify a specific person | Link records via join | Learn a sensitive attribute value |
| Requires re-identification? | Yes (full) | Yes (full) | ❌ No — partial knowledge is enough |
| Threat condition | EC size = 1 | EC size = 1 (unique join) | All records in EC share same SA value |
| Defeated by | Large ECs (k-anonymity) | Large ECs (k-anonymity) | Diverse ECs (l-diversity) |
| Primary metric | Re-ID Risk (ECLR) | ECLR + Amplification | Attribute Disclosure Risk (ADR) |

---

## 2. Core Concepts

### 2.1 Equivalence Class Homogeneity

An EC is **homogeneous** for a sensitive attribute SA if all records in it share the same SA value:

```
is_homogeneous(EC, SA) = True   if  count(distinct SA values in EC) = 1
                        False  otherwise
```

A homogeneous EC causes **guaranteed attribute disclosure** — the attacker knows the SA value of every person in that EC with 100% certainty.

### 2.2 Attribute Disclosure Risk Per Record

For each record `r` with sensitive attribute `SA`:

```
If is_homogeneous(EC(r), SA):
    Disclosure_Risk(r, SA) = 1.0     ← attacker knows SA value with certainty

Else:
    # Attacker's best guess is the most common SA value in the EC
    dominant_freq(EC, SA) = max(count(v) for v in SA values in EC) / |EC|
    Disclosure_Risk(r, SA) = dominant_freq(EC(r), SA)
```

**Intuition:**
- If all 5 records in an EC have `Disease=Diabetic` → Disclosure Risk = 1.0
- If 4 out of 5 records have `Disease=Diabetic` → Attacker guesses Diabetic with 80% confidence = Risk 0.80
- If 2 out of 5 records have each of 2+ values → Risk = 0.40 (balanced)

### 2.3 Dataset-Level Attribute Disclosure Risk (ADR)

```
ADR(SA) = (1/N) × Σᵣ Disclosure_Risk(r, SA)
```

This is the **expected probability** that an attacker who knows a person's QI combination (i.e., their EC) can correctly guess their sensitive attribute value.

### 2.4 Homogeneity Rate

```
Homogeneity_Rate(SA) = (records in homogeneous ECs) / N × 100
```

This is the fraction of the dataset that is **fully vulnerable** to attribute disclosure — not just partially.

### 2.5 Guaranteed Disclosure Count

```
Guaranteed_Disclosure_Count(SA) = records in homogeneous ECs
```

These are records where the attacker knows the SA value with 100% certainty.

---

## 3. Mathematical Model — Attribute Disclosure Attack

### 3.1 Full Formulas

For a target dataset `D` with `N` records, quasi-identifiers `QI`, and sensitive attributes `SA = {sa₁, sa₂, ..., saₘ}`:

**Step 1 — Build Equivalence Classes:**
```
ECs = groupby(D, QI)
```

**Step 2 — Per-EC Dominant Frequency for SA saᵢ:**
```
dominant_freq(EC, saᵢ) = max_value_count(EC[saᵢ]) / |EC|
```

**Step 3 — Per-EC Homogeneity Check:**
```
is_homogeneous(EC, saᵢ) = (distinct_values(EC[saᵢ]) == 1)
```

**Step 4 — Per-Record Disclosure Risk:**
```
disc_risk(r, saᵢ) = dominant_freq(EC(r), saᵢ)
```
(For homogeneous ECs: `disc_risk = 1.0`)

**Step 5 — Dataset-Level ADR per SA:**
```
ADR(saᵢ) = mean(disc_risk(r, saᵢ) for all r in D)
```

**Step 6 — Combined Attribute Disclosure Score (across all SAs):**
```
Overall_ADR = max(ADR(saᵢ) for all saᵢ)
```
(Worst-case SA drives the overall score — one fully disclosed SA is a critical failure.)

**Step 7 — Safe Threshold:**
```
A dataset is SAFE against Attribute Disclosure if:
  ADR(saᵢ) < 1/l   for all sensitive attributes saᵢ
  (i.e., the attacker cannot do better than a 1-in-l guess)
  
  This is equivalent to l-diversity being satisfied.
```

### 3.2 Attribute Disclosure Score (0–100) for Badge Display

```
Attr_Disclosure_Score = Overall_ADR × 100

Badge colour:
  🔴  > 60  — HIGH: Attacker correctly guesses SA value >60% of the time
  🟡  20–60 — MEDIUM: Partial disclosure risk
  🟢  < 20  — LOW: Dataset is reasonably diverse
```

### 3.3 Skewness (Partial Disclosure)

Beyond full homogeneity, **skewed ECs** also pose risk. If one SA value dominates an EC:

```
Skewness(EC, SA) = dominant_freq(EC, SA)

Interpretations:
  1.00   → Fully homogeneous  → Guaranteed disclosure
  0.75+  → Heavily skewed     → Attacker guesses correctly ~75%+ of the time
  0.50+  → Moderately skewed  → Better than random
  < 1/l  → L-diverse          → Safe
```

---

## 4. Full Attribute Disclosure Attack Algorithm (Step by Step)

```python
def attribute_disclosure_attack(dataframe, quasi_identifiers, sensitive_attributes, k, l, t, sample_size_pct):

    # Step 1: Sample
    df = dataframe.sample(frac=sample_size_pct / 100, random_state=42)
    N = len(df)

    # Step 2: Build Equivalence Classes
    ec_groups = df.groupby(quasi_identifiers)
    ec_sizes = ec_groups.size().reset_index(name='ec_size')
    df = df.merge(ec_sizes, on=quasi_identifiers, how='left')

    results_per_sa = {}

    for sa in sensitive_attributes:

        # Step 3: Compute per-EC dominant frequency and homogeneity
        def ec_stats(group):
            value_counts = group[sa].value_counts()
            dominant_val = value_counts.index[0]
            dominant_count = value_counts.iloc[0]
            total = len(group)
            dominant_freq = dominant_count / total
            is_homogeneous = (value_counts.shape[0] == 1)
            distinct_count = value_counts.shape[0]
            return pd.Series({
                f'dominant_freq_{sa}': dominant_freq,
                f'dominant_val_{sa}': dominant_val,
                f'is_homogeneous_{sa}': is_homogeneous,
                f'distinct_sa_count_{sa}': distinct_count
            })

        ec_sa_stats = ec_groups.apply(ec_stats).reset_index()
        df = df.merge(ec_sa_stats, on=quasi_identifiers, how='left')

        # Step 4: Per-record disclosure risk = dominant_freq of its EC
        df[f'disc_risk_{sa}'] = df[f'dominant_freq_{sa}']

        # Step 5: Disclosure label per record
        df[f'disc_label_{sa}'] = df[f'disc_risk_{sa}'].apply(
            lambda r: 'Guaranteed' if r == 1.0
                      else 'High' if r >= 0.75
                      else 'Moderate' if r >= 0.50
                      else 'Low' if r >= (1/l)
                      else 'Safe'
        )

        # Step 6: Dataset-level metrics
        adr = df[f'disc_risk_{sa}'].mean()
        guaranteed_records = df[f'is_homogeneous_{sa}'].sum()
        high_risk_records = (df[f'disc_risk_{sa}'] >= 0.75).sum()
        moderate_risk_records = ((df[f'disc_risk_{sa}'] >= 0.50) & (df[f'disc_risk_{sa}'] < 0.75)).sum()
        safe_records = (df[f'disc_risk_{sa}'] < (1/l)).sum()

        homogeneous_ecs = ec_sa_stats[f'is_homogeneous_{sa}'].sum()
        total_ecs = len(ec_sa_stats)
        l_violating_ecs = (ec_sa_stats[f'distinct_sa_count_{sa}'] < l).sum()

        # Step 7: Global SA distribution (for T-Closeness-style comparison)
        global_dist = df[sa].value_counts(normalize=True).to_dict()

        results_per_sa[sa] = {
            'adr': adr,
            'guaranteed_records': int(guaranteed_records),
            'high_risk_records': int(high_risk_records),
            'moderate_risk_records': int(moderate_risk_records),
            'safe_records': int(safe_records),
            'homogeneous_ecs': int(homogeneous_ecs),
            'l_violating_ecs': int(l_violating_ecs),
            'total_ecs': int(total_ecs),
            'global_dist': global_dist
        }

    # Step 8: Overall score = worst-case SA
    overall_adr = max(v['adr'] for v in results_per_sa.values())
    attr_disclosure_score = overall_adr * 100

    # Step 9: Top vulnerable records (highest disc_risk across any SA)
    df['max_disc_risk'] = df[[f'disc_risk_{sa}' for sa in sensitive_attributes]].max(axis=1)
    top_vulnerable = df.sort_values('max_disc_risk', ascending=False).head(10)

    return {
        'N': N,
        'overall_adr': overall_adr,
        'attr_disclosure_score': attr_disclosure_score,
        'results_per_sa': results_per_sa,
        'df_with_scores': df,
        'top_vulnerable': top_vulnerable
    }
```

---

## 5. UI Results Panel — All Required Sections

The right-hand panel must render all sections below after the assessment runs. All numbers are dynamic — computed from the algorithm above. No hardcoded values.

---

### 5.1 Plain-English Summary Card (Top of Panel)

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔴  Attribute Disclosure Risk: HIGH                                  │
│                                                                      │
│  Even though your dataset may satisfy k-anonymity, an attacker who   │
│  knows which equivalence class a person belongs to can correctly      │
│  guess their [SA name] value [ADR×100]% of the time.                 │
│  [guaranteed_records] records sit in completely homogeneous groups    │
│  — their sensitive attribute is disclosed with 100% certainty.       │
│                                                                      │
│  This attack does NOT require re-identification. Knowing a           │
│  person's quasi-identifiers (e.g., region + age group) is enough     │
│  to learn their sensitive information.                               │
│                                                                      │
│  Results based on [N] rows ([sample_pct]% sample) |                  │
│  QIs used: [QI names] | SAs assessed: [SA names]                    │
└──────────────────────────────────────────────────────────────────────┘
```

**Badge colour rule:**
- 🔴 `Overall_ADR > 0.60` → HIGH
- 🟡 `0.20 ≤ Overall_ADR ≤ 0.60` → MEDIUM
- 🟢 `Overall_ADR < 0.20` → LOW

---

### 5.2 Key Metrics Row (Per SA + Overall)

Display as metric cards — one column per Sensitive Attribute, plus an "Overall" card:

| Metric | Per SA Value | Meaning |
|--------|-------------|---------|
| **ADR (Attr. Disclosure Risk)** | `[ADR(SA) × 100]%` | Avg probability attacker guesses SA correctly |
| **Guaranteed Disclosure** | `[guaranteed_records] records` | 🔴 if > 0 |
| **Homogeneous ECs** | `[homogeneous_ecs] / [total_ecs]` | ECs where all records share same SA |
| **L-Violating ECs** | `[l_violating_ecs] / [total_ecs]` | ECs with fewer than l distinct SA values |
| **Safe Records** | `[safe_records] ([pct]%)` | Records in l-diverse ECs |

**Overall Card:**
```
Overall Attribute Disclosure Score: [attr_disclosure_score]
(Worst-case across all sensitive attributes)
Status: 🔴 / 🟡 / 🟢
```

---

### 5.3 Disclosure Risk Distribution (Per SA — Donut or Stacked Bar)

For **each sensitive attribute**, show a 4-segment distribution of records:

| Segment | Condition | Count | Colour |
|---------|-----------|-------|--------|
| Guaranteed | `disc_risk = 1.00` | `[guaranteed_records]` | 🔴 Red |
| High | `0.75 ≤ disc_risk < 1.00` | `[high_risk_records]` | 🟠 Orange |
| Moderate | `0.50 ≤ disc_risk < 0.75` | `[moderate_risk_records]` | 🟡 Yellow |
| Safe | `disc_risk < 1/l` | `[safe_records]` | 🟢 Green |

**Tooltip per segment:**
- **Guaranteed:** Every record in this group has the same [SA] value. An attacker who knows the person's [QI values] learns their [SA] with absolute certainty.
- **High:** The dominant [SA] value in these groups appears ≥75% of the time. The attacker has a high-confidence guess.
- **Moderate:** The dominant value appears 50–74% of the time — better than random, still risky.
- **Safe:** These groups are sufficiently diverse — attacker cannot do better than a 1-in-l guess.

---

### 5.4 Record-Level Disclosure Trace Table

One row per record, paginated at 50 rows. This is the core diagnostic output.

**Columns:**
| Column | Content |
|--------|---------|
| Row # | Original row index |
| [QI₁] ... [QIₙ] | Actual values of each selected QI |
| EC Size | How many records share this QI combination |
| [SA₁] Value | The actual sensitive attribute value of this record |
| Dominant SA Value in EC | Most common SA value in this record's EC |
| Dominant Frequency | e.g., 1.00, 0.80, 0.50 |
| Disclosure Risk | Same as Dominant Frequency |
| Disclosure Label | Guaranteed / High / Moderate / Safe |
| Status | 🔴 At Risk / 🟢 Safe |

**Header definitions row:**
- **Dominant Frequency**: The fraction of records in this EC sharing the most common [SA] value. If 1.00, all records in the group are identical on [SA].
- **Disclosure Label**: Guaranteed (1.00) / High (≥0.75) / Moderate (≥0.50) / Safe (<1/l).

**Filter bar:**
```
[ Show All ] [ 🔴 Guaranteed ] [ 🟠 High ] [ 🟡 Moderate ] [ 🟢 Safe ]   Search: [___]
```

**Export button:** "Download Full Table (CSV)" — exports all rows with disclosure risk scores and labels.

---

### 5.5 Attack Simulation Narrative — "How the Attack Works on YOUR Data"

Step-by-step walkthrough using **actual values from the most vulnerable EC**:

```
ATTRIBUTE DISCLOSURE SIMULATION — Step by Step

Step 1 — Attacker's Starting Knowledge
  The attacker does NOT need to know who the target is.
  They only need to know the target's quasi-identifier values,
  which are often publicly available (e.g., region, age group, survey round):
    [QI₁] = [val₁]
    [QI₂] = [val₂]
    [QI₃] = [val₃]
    ...

Step 2 — EC Lookup
  The attacker queries: "Which group do people with these QI values belong to?"
  
  Result: EC [ID] — contains [EC_size] records.

Step 3 — Sensitive Attribute Inference
  The attacker looks at the distribution of [SA_name] within this group:
    [SA_value_1]: [count] records ([pct]%)
    [SA_value_2]: [count] records ([pct]%)
    ...
  
  Dominant value: [dominant_val] — appears in [dominant_freq×100]% of records.

  ⚠️ Since all [EC_size] records in this group have [SA_name] = [dominant_val],
  the attacker knows this person's [SA_name] with [dominant_freq×100]% certainty
  — WITHOUT knowing which specific record is theirs.

Step 4 — No Re-identification Required
  The attacker did not learn the person's name, ID, or any unique identifier.
  They only used the QI combination to place the target into a group.
  Yet they now know: [SA_name] = [dominant_val]   ([dominant_freq×100]% confident)

Step 5 — Scale
  Records with guaranteed SA disclosure (EC fully homogeneous): [guaranteed_records]
  Records with high disclosure risk (≥75% dominant freq):       [high_risk_records]
  Total records with some disclosure risk (>50%):               [guaranteed + high + moderate]
  That is [pct]% of your entire dataset.
```

---

### 5.6 Equivalence Class Homogeneity Heatmap (Per SA)

For each sensitive attribute, show a table of ECs sorted by disclosure risk:

**Table (top 20 ECs by disclosure risk):**

| EC ID | QI Combination | EC Size | Distinct SA Values | Dominant SA Value | Dominant Freq | Disclosure Label |
|-------|---------------|---------|-------------------|-------------------|---------------|-----------------|
| EC-1  | [QI vals]     | 5       | 1                 | Diabetic          | 1.00          | 🔴 Guaranteed |
| EC-2  | [QI vals]     | 8       | 2                 | Healthy           | 0.88          | 🟠 High |
| EC-3  | [QI vals]     | 6       | 2                 | Hypertensive      | 0.67          | 🟡 Moderate |
| EC-4  | [QI vals]     | 10      | 4                 | Healthy           | 0.30          | 🟢 Safe |

**Chart:** Horizontal bar chart of Dominant Frequency per EC (top 20 ECs).
- Colour-coded: 1.0 = Red, ≥0.75 = Orange, ≥0.50 = Yellow, <1/l = Green.
- Add a **vertical dashed line** at `x = 1/l` (safe threshold based on user's l setting), labelled "L-Diversity Threshold (1/l)".

---

### 5.7 Sensitive Attribute Value Distribution (Per SA)

For each SA, show two distributions side-by-side:

**Global Distribution** (entire dataset):
```
[SA_name] — Global Distribution
  Diabetic:      32% ████████████████
  Healthy:       45% ██████████████████████
  Hypertensive:  23% ████████████
```

**Per-EC Distribution Summary:**
```
Among [homogeneous_ecs] fully homogeneous ECs:
  Diabetic (all records in EC):      [count] ECs
  Healthy (all records in EC):       [count] ECs
  Hypertensive (all records in EC):  [count] ECs

Meaning: In [count] groups, every member is [value] — this value is
         completely exposed to anyone who knows the group.
```

**Display as:** Two small horizontal bar charts side by side, with a note:
> "If the per-EC distribution differs significantly from the global distribution, attribute inference becomes easy."

---

### 5.8 L-Diversity Results (Per Sensitive Attribute)

```
L-Diversity Check (threshold l = [user_l])

Sensitive Attribute: [SA_NAME]
  Minimum distinct SA values in any EC:  [min_l]
  ECs violating l-diversity:             [l_violating_ecs] out of [total_ecs] ([pct]%)
  Records in l-violating ECs:            [records_in_violating_ecs] ([pct]%)

  Meaning: In [l_violating_ecs] equivalence classes, fewer than [l] distinct
           [SA_NAME] values exist. The attacker can infer [SA_NAME] with
           confidence above 1/[l] for these records.

  Status: 🔴 FAIL   (if l_violating_ecs > 0)
          🟢 PASS   (if all ECs have ≥ l distinct values)
```

---

### 5.9 T-Closeness Results (Per Sensitive Attribute)

```
T-Closeness Check (threshold t = [user_t])

Sensitive Attribute: [SA_NAME]
  Global distribution:           {value₁: X%, value₂: Y%, ...}
  Maximum EC deviation (TVD):    [max_distance]
  ECs violating t-closeness:     [violating_ecs] out of [total_ecs] ([pct]%)

  Meaning: In [violating_ecs] groups, the internal distribution of [SA_NAME]
           is far from the global baseline. This makes attribute inference
           even easier — an attacker can predict [SA_NAME] just from
           knowing which group a person belongs to.

  Status: 🔴 FAIL   (if violating_ecs > 0)
          🟢 PASS   (if all ECs have TVD ≤ t)
```

---

### 5.10 Top Vulnerable Records Table

Show the 10 records with the highest disclosure risk:

| Rank | QI Combination | EC Size | SA Name | SA Value | Dominant Freq | Disclosure Label | Why Vulnerable |
|------|---------------|---------|---------|----------|---------------|-----------------|----------------|
| 1 | [QI vals] | 5 | Disease | Diabetic | 1.00 | 🔴 Guaranteed | All 5 records in this group are Diabetic |
| 2 | [QI vals] | 8 | Disease | Healthy | 0.88 | 🟠 High | 7 of 8 records in this group are Healthy |
| 3 | [QI vals] | 4 | Income | Low | 0.75 | 🟠 High | 3 of 4 records in this group have Income=Low |

**Note below table:**
> "These records do not need to be uniquely re-identified for harm to occur. The attacker only needs to know the person's quasi-identifier combination to infer their sensitive attribute."

---

### 5.11 SA Sensitivity Ranking

This section ranks which **sensitive attributes** are most exposed:

**Table:**
| Rank | Sensitive Attribute | ADR | Guaranteed Records | Homogeneous ECs | Status |
|------|--------------------|----|-------------------|-----------------|--------|
| 1 | Disease_Status | 94% | 180 | 36/40 | 🔴 CRITICAL |
| 2 | Income_Bracket | 72% | 110 | 22/40 | 🔴 HIGH |
| 3 | Religion | 38% | 40 | 8/40 | 🟡 MEDIUM |
| 4 | Age_Group | 12% | 8 | 2/40 | 🟢 LOW |

**Bar chart:** Horizontal bars of ADR per SA. Color: 🔴 > 60%, 🟡 20–60%, 🟢 < 20%.

**Note:** "The most exposed attribute is [top_SA_name] — [ADR×100]% of records can have this value inferred without re-identification."

---

### 5.12 Recommendations Section (Auto-Generated, Conditional)

Generate only blocks where the condition is actually violated:

```
RECOMMENDATIONS (based on Attribute Disclosure Assessment)

🔴 CRITICAL — [guaranteed_records] records are in homogeneous ECs for [SA_name]
   These records' [SA_name] values are fully exposed. Any attacker who
   knows a person's quasi-identifier combination learns their [SA_name]
   with certainty — k-anonymity provides NO protection here.
   Action: Apply l-diversity enforcement. Ensure every EC has at least
   [l] distinct values of [SA_name]. Use data suppression or swapping
   to break up homogeneous groups.

🔴 HIGH — Attribute Disclosure Risk is [ADR×100]% (safe threshold: <20%)
   Action: Increase l parameter and apply l-diversity transformation 
   in Privacy Enhancement. Target: ADR < 20%.

🟠 MEDIUM — [l_violating_ecs] ECs fail l-diversity for [SA_name]
   Action: Each EC must have at least [l] distinct [SA_name] values.
   Either suppress records from over-represented groups or merge 
   small ECs through QI generalisation.

🟡 T-Closeness violated for [SA names]  (if applicable)
   Action: SA distributions inside some ECs diverge strongly from
   the global dataset distribution. Apply t-closeness transformation
   or restrict the release of [SA name].

🟡 MEDIUM — [high_risk_records] records have High disclosure risk (≥75%)
   These records are not in fully homogeneous ECs, but the dominant
   SA value appears ≥75% of the time — the attacker's guess is nearly
   certain.
   Action: Break up these ECs by generalising the top QI or adding
   suppression.

ℹ️ KEY DISTINCTION
   Attribute Disclosure can occur even when k-anonymity is satisfied.
   If your dataset passes the Prosecutor Attack but fails here, you
   need l-diversity — not just larger ECs.

ℹ️ NEXT STEP
   Go to "Privacy Enhancement" to apply l-diversity transformations.
   After enhancement, re-run this assessment to verify improvement.
```

---

### 5.13 Attack Score for Badge Display

```
Attr_Disclosure_Score = Overall_ADR × 100
  = max(ADR(saᵢ) for all saᵢ) × 100

Badge colour:
  🔴  > 60  — HIGH: Attacker guesses SA correctly >60% of the time
  🟡  20–60 — MEDIUM: Partial disclosure risk
  🟢  < 20  — LOW: Dataset is reasonably l-diverse
```

This score feeds into the **Overall Comparison Score** in the top navigation bar:
```
overall_score = mean(all enabled attack scores)
attr_disclosure_contribution = Overall_ADR × 100
```

---

## 6. Data Flow Summary

```
User uploads CSV
       ↓
User selects QIs + SAs + sets k, l, t, sample_size
       ↓
[Run Assessment clicked — Attr. Disclose enabled]
       ↓
1.  Sample dataset at sample_size_pct
2.  Build equivalence classes (groupby selected QIs)
3.  Compute ec_size per record
4.  For each Sensitive Attribute:
    a. Compute dominant frequency per EC
    b. Check EC homogeneity (distinct SA values = 1?)
    c. Assign per-record disclosure risk = dominant_freq
    d. Label records: Guaranteed / High / Moderate / Safe
    e. Compute ADR = mean(disc_risk across all records)
    f. Compute homogeneous_ecs count
    g. Compute l_violating_ecs count
    h. Run L-Diversity check
    i. Run T-Closeness check
5.  Compute Overall_ADR = max(ADR across all SAs)
6.  Rank SAs by ADR (SA Sensitivity Ranking)
7.  Identify top 10 vulnerable records
8.  Generate conditional recommendations
       ↓
Render all 13 result sections in the right-hand panel
```

---

## 7. Key Implementation Notes for Replit Agent

1. **Reuse EC computation** from Prosecutor / Record Linkage modules. All three attacks share the same `groupby(QI)` operation. Compute equivalence classes once per assessment run.
2. **This attack operates per Sensitive Attribute.** If the user has selected 3 SAs, run the algorithm independently for each and display separate result blocks (Sections 5.3, 5.6, 5.7, 5.8, 5.9) for each SA.
3. **The record-level trace table (Section 5.4) is mandatory.** Paginate at 50 rows. Add CSV export.
4. **Attack Narrative (Section 5.5) must use real values** from the most homogeneous EC.
5. **The Homogeneity Heatmap (Section 5.6)** requires iterating over ECs and computing dominant frequency per EC — cache these during the main algorithm pass.
6. **Recommendations (Section 5.12) must be conditional.** Only render blocks whose thresholds are violated.
7. **All charts must use real distributions** — no dummy data.
8. **Key distinction to communicate clearly in UI:** A dataset can pass k-anonymity and still critically fail attribute disclosure. The summary card (Section 5.1) must make this explicit.
9. **Disclosure labels** for this attack: Guaranteed / High / Moderate / Safe (distinct from Prosecutor's At Risk/Protected and Linkage's Certain/Probable/Possible/Protected).
10. **Export:** "Download Full Report (CSV)" exports all records with SA values, EC sizes, dominant frequencies, and disclosure labels.

---

## 8. Comparison: Attribute Disclosure vs Other Attacks (Reference for Agent)

| Property | Prosecutor | Record Linkage | Attribute Disclosure |
|---|---|---|---|
| EC formula | `1/EC_size` | `1/EC_size` | `dominant_freq(EC, SA)` |
| Operates on | QIs only | QIs only | QIs + Sensitive Attributes |
| Key risk metric | Re-ID Risk | ECLR | ADR (per SA) |
| Defeated by | k-anonymity | k-anonymity | l-diversity |
| Outcome label | At Risk / Protected | Certain/Probable/Possible/Protected | Guaranteed/High/Moderate/Safe |
| Unique sections | — | QI Contribution Analysis | SA Sensitivity Ranking, Homogeneity Heatmap, SA Distribution |
| Per-SA analysis? | No | No | ✅ Yes — one result block per SA |

---

*Specification version: 1.0 | For MoSPI Statathon 2025 — SafeData Pipeline*
