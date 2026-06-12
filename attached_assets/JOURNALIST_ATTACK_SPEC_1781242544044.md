# Risk Assessment Module — Journalist Attack: Complete Specification

> **For Replit Agent**: Replace all existing mock/placeholder logic for the Journalist Attack with the accurate implementations described below. This document covers: the Journalist threat model, the math behind it, how it differs from the Prosecutor attack, the per-record/dataset algorithm, and the required result sections.

---

## 1. What is the Journalist Attack?

The **Journalist Attack** models an adversary who:

1. Does **NOT** know for certain that their specific target is in the dataset (unlike the Prosecutor).
2. Has access to an **external population register / sampling frame** (e.g., Census, electoral rolls, full administrative population) that is **larger** than the released sample.
3. Tries to match a target's known quasi-identifier (QI) values against records in the released dataset, knowing the dataset is only a **sample** of the full population.

**Key difference from Prosecutor:**

| | Prosecutor | Journalist |
|---|---|---|
| Knows target is in dataset? | Yes (certain) | No — only knows target is in the **population** |
| Risk basis | EC size **within the sample** | EC size within sample **relative to** EC size in the population |
| Worst case | `1 / |EC_sample(r)|` | `1 / |EC_population(r)|` (bounded by sample EC) |

This is a **less severe** attack than Prosecutor for the same dataset, because the attacker's uncertainty about whether the target was even sampled reduces their confidence.

---

## 2. Population Size & Sampling Fraction

Since this dataset has **no separate population file uploaded**, the Journalist Attack must **estimate** the population using the **Sampling Fraction**, derived from the `Multiplier_comb` column (already present in the survey microdata — it represents the inverse sampling probability / expansion factor for each household).

```
sampling_fraction(r) = 1 / Multiplier_comb(r)

population_ec_size(r) ≈ Σ Multiplier_comb(r') for all r' in EC(r)
                       (i.e., the weighted/expanded count of the EC in the population)
```

If `Multiplier_comb` is not selected/available, fall back to a **user-supplied global sampling fraction** (default = `sample_size_pct / 100` from the Configuration panel), and estimate:

```
population_ec_size(r) ≈ |EC_sample(r)| / sampling_fraction
```

---

## 3. Journalist Re-Identification Risk: The Math

For a record `r` belonging to equivalence class `EC(r)` of size `|EC_sample(r)|` in the released sample, with estimated population EC size `F(r) = population_ec_size(r)`:

```
Journalist_Risk(r) = 1 / F(r)
```

**Intuition:**
- If the population EC size is large (many people in the real world share this QI combination), even if the sample EC is a singleton, the attacker cannot be sure their target — rather than someone else sharing the same QI combo — is the one in the sample.
- If `F(r) == |EC_sample(r)|` (i.e., the sample EC fully represents the population EC — happens when sampling fraction = 100% or the population genuinely only has that many people), `Journalist_Risk = Prosecutor_Risk`. This is the **upper bound**.

**Dataset-level Re-ID Risk:**

```
Re_ID_Risk_Journalist = (1/N) × Σ (1 / F(r))   for all records r in sample
```

**Relationship to Prosecutor:**

```
Journalist_Risk(r) ≤ Prosecutor_Risk(r)   ALWAYS
       (since F(r) ≥ |EC_sample(r)|)
```

So **Journalist Re-ID Risk must always be ≤ Prosecutor Re-ID Risk** for the same QI selection. This is the key sanity check.

---

## 4. Link Score Per Record (Journalist)

```
link_score_journalist(r) = 1 / F(r)
```

- Range: `(0, 1]`
- A score of 1.00 still means "uniquely identifiable" — but now it means the QI combination is unique in the **estimated population**, not just the sample. This is a much stronger (rarer) condition than sample-uniqueness.

---

## 5. Full Journalist Attack Algorithm (Step by Step)

```python
def journalist_attack(dataframe, quasi_identifiers, sensitive_attributes, k, l, t, sample_size_pct):

    # Step 1: Sample
    df = dataframe.sample(frac=sample_size_pct/100, random_state=42)
    N = len(df)

    # Step 2: Build Equivalence Classes (sample-level)
    ec_groups = df.groupby(quasi_identifiers)
    ec_sizes = ec_groups.size().reset_index(name='ec_size_sample')
    df = df.merge(ec_sizes, on=quasi_identifiers, how='left')

    # Step 3: Estimate population EC size using Multiplier_comb
    if 'Multiplier_comb' in df.columns:
        pop_ec = df.groupby(quasi_identifiers)['Multiplier_comb'].sum().reset_index(name='ec_size_population')
        df = df.merge(pop_ec, on=quasi_identifiers, how='left')
    else:
        sampling_fraction = sample_size_pct / 100
        df['ec_size_population'] = df['ec_size_sample'] / sampling_fraction

    # Ensure population EC size is never smaller than sample EC size
    df['ec_size_population'] = df[['ec_size_sample', 'ec_size_population']].max(axis=1)

    # Step 4: Per-record link score (journalist)
    df['link_score_journalist'] = 1.0 / df['ec_size_population']

    # Step 5: Per-record risk label
    df['at_risk_journalist'] = df['ec_size_population'] < k

    # Step 6: Dataset-level metrics
    re_id_risk_journalist = df['link_score_journalist'].mean()
    min_population_ec = df['ec_size_population'].min()
    avg_population_ec = df['ec_size_population'].mean()
    num_pop_unique = (df['ec_size_population'] <= 1).sum()

    # Step 7 & 8: L-Diversity and T-Closeness — IDENTICAL to Prosecutor
    # (these are properties of the SAMPLE's equivalence classes and sensitive
    #  attribute distributions; the attacker model — prosecutor vs journalist —
    #  does not change l-diversity/t-closeness, only the re-identification risk)

    # Step 9: Comparison to Prosecutor
    df['prosecutor_link_score'] = 1.0 / df['ec_size_sample']
    df['risk_reduction'] = df['prosecutor_link_score'] - df['link_score_journalist']

    return {
        'N': N,
        're_id_risk_journalist': re_id_risk_journalist,
        're_id_risk_prosecutor': df['prosecutor_link_score'].mean(),
        'num_population_unique': num_pop_unique,
        'avg_population_ec_size': avg_population_ec,
        'min_population_ec_size': min_population_ec,
        'at_risk_count': df['at_risk_journalist'].sum(),
        'protected_count': N - df['at_risk_journalist'].sum(),
        # ... l_diversity, t_closeness same as prosecutor ...
        'sampling_fraction_used': sample_size_pct / 100,
        'multiplier_used': 'Multiplier_comb' in dataframe.columns,
        'all_records': df[quasi_identifiers + [
            'ec_size_sample', 'ec_size_population',
            'link_score_journalist', 'prosecutor_link_score', 'at_risk_journalist'
        ]].to_dict('records')
    }
```

---

## 6. What the Results Panel Should Display

### 6.1 Attack Summary Banner (Top)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  🟡  JOURNALIST ATTACK RESULTS                          RISK LEVEL: [X]       │
│  Dataset: [filename]  |  Rows analysed: [N]  |  QIs used: [list of QI names] │
│  Population estimation method: [Multiplier_comb-based | Sampling-fraction]  │
└──────────────────────────────────────────────────────────────────────────────┘

Plain-English Summary:
"A journalist who has access to a public population register (but does NOT
know for certain their target is in THIS dataset) can correctly identify
[X]% of individuals using only [QI1], [QI2], [QI3]. This is [lower/equal]
than the Prosecutor risk of [Y]%, because [Z] records that look unique in
this sample correspond to combinations that are actually shared by multiple
people in the wider population."
```

### 6.2 Key Metrics Row (5 cards — one more than Prosecutor)

| Card | Value | Label | Status |
|---|---|---|---|
| Journalist Re-ID Risk | `X%` | Avg chance a journalist correctly matches a person, accounting for sampling | 🔴 if >20%, 🟡 if 5-20%, 🟢 if <5% |
| Prosecutor Re-ID Risk (reference) | `Y%` | Shown for comparison — the worst-case if attacker DOES know target is sampled | (grey/reference styling) |
| Population-Unique Records | `N` | Records whose QI combo is estimated unique even in the full population | 🔴 if >0 |
| Avg Population EC Size | `Z` | Mean estimated group size sharing same QIs in the population | 🔴 if <k |
| Min Population-EC | `M` | Smallest estimated population group — worst-case exposure | 🔴 if <user_k |

**This 5th card / comparison is mandatory** — without it, the user cannot see *why* the Journalist score differs from Prosecutor.

### 6.3 Record-Level Attack Trace Table

Same columns as Prosecutor, **plus two new columns**:

| Row # | [QI columns...] | Sample EC Size | Est. Population EC Size | Prosecutor Link Score | Journalist Link Score | Status |
|---|---|---|---|---|---|---|
| 1 | ... | 1 | 14.2 | 1.00 | 0.07 | 🟢 PROTECTED (journalist) / 🔴 AT RISK (prosecutor) |

**Status logic**: a record can now have a **dual status** — e.g. "Looks unique in this sample (Prosecutor: 100%) but common in the population (Journalist: 7%)". This dual-status view is the single most important new insight of this attack type and MUST be shown.

### 6.4 Attack Narrative — "How the Attack Works on YOUR Data"

```
Step 1 — Attacker's Knowledge
  The journalist knows person X exists in the general population (e.g., via
  Census/voter records) with:
    [QI1] = [value]
    [QI2] = [value]
    ...
  They do NOT know if X is in this particular survey sample.

Step 2 — Population Estimate
  Using Multiplier_comb (expansion weights), an estimated [F] people in the
  full population share this exact QI combination.

Step 3 — Sample Match
  In the released sample, [S] record(s) match this QI combination.

Step 4 — Re-identification Confidence
  Even if the journalist finds [S]=1 matching record in the sample, they can
  only be [1/F]% confident this record corresponds to person X, because [F-1]
  other people in the population share the same QI combination and could
  equally be (or not be) in the sample.

Step 5 — Scale
  [X] out of [N] records have an estimated population EC size of 1
  (i.e., remain at Prosecutor-level risk even under the Journalist model).
  [Y]% of the dataset shows reduced risk under the Journalist model
  compared to the Prosecutor model.
```

### 6.5 Risk Comparison Chart (NEW — Journalist-specific)

A **side-by-side / overlaid bar chart** comparing Prosecutor vs Journalist link score distributions:

| Score Range | # Records (Prosecutor) | # Records (Journalist) | Δ (Risk Reduction) |
|---|---|---|---|
| 1.00 (certain) | 14 | [X] | [14-X] |
| 0.51–0.99 (high) | 0 | [X] | ... |
| 0.26–0.50 (med) | 6 | [X] | ... |
| 0.01–0.25 (low) | 0 | [X] | ... |
| 0.00 (safe) | 0 | [X] | ... |

This is the **core value-add** of the Journalist attack output — it visually demonstrates "sampling provides plausible deniability."

### 6.6 Population EC Size Distribution (NEW)

Same format as Prosecutor's "EC Size Distribution" but using **estimated population EC sizes** instead of sample EC sizes:

| Population EC Size | # ECs | # Records | % Dataset |
|---|---|---|---|
| 1 (Unique in population) | ... | ... | ...% |
| 2–4 | ... | ... | ...% |
| 5–10 | ... | ... | ...% |
| 11–20 | ... | ... | ...% |
| >20 | ... | ... | ...% |

### 6.7 L-Diversity Results (Per Sensitive Attribute)

**Identical to Prosecutor** — l-diversity is a property of the sample's equivalence classes and is independent of the attacker model. Reuse the same section verbatim (do not duplicate computation).

### 6.8 T-Closeness Results (Per Sensitive Attribute)

**Identical to Prosecutor** — same reasoning as above. Reuse verbatim.

### 6.9 Sampling Fraction / Methodology Disclosure (NEW — mandatory)

```
ℹ️ METHODOLOGY NOTE

Population EC sizes in this report are ESTIMATES based on:
  [✓] Multiplier_comb column (NSS survey expansion factors)
      OR
  [ ] Global sampling fraction = [sample_size_pct]% (Multiplier_comb not available)

These estimates assume the sampling design is uniform across QI groups.
Actual population uniqueness may differ. Treat Journalist Re-ID Risk as an
INDICATIVE LOWER BOUND, not an exact figure.
```

This disclosure is **mandatory** because, unlike the Prosecutor attack (which is exact, computed entirely from the released data), the Journalist attack relies on an estimation assumption. Hiding this would mislead a non-technical reviewer into thinking the number is as precise as the Prosecutor figure.

### 6.10 Risk–Protection Donut (Real Numbers)

Same as Prosecutor, but based on `ec_size_population < k` instead of `ec_size_sample < k`. Should show a **smaller** "At Risk" slice than the Prosecutor donut for the same dataset/QIs (or equal, in the edge case where every EC is already population-unique).

### 6.11 Top Vulnerable Records Table

Same format as Prosecutor's section 4.10, but ranked by `journalist_link_score` descending, and including both the Sample EC Size and Estimated Population EC Size columns so the officer can see which "sample-unique" records remain genuinely population-unique.

### 6.12 Recommendations Section (Auto-generated, Journalist-specific)

```
RECOMMENDATIONS (Journalist Attack)

🔴 CRITICAL — [N] records remain unique even at population level
   Action: These cannot be protected by relying on "the dataset is just a
   sample" — they need direct suppression or generalisation, same as the
   Prosecutor recommendation.

🟡 MEDIUM — Journalist Re-ID Risk is [X]% vs Prosecutor Re-ID Risk of [Y]%
   Interpretation: Sampling provides a [Y-X] percentage-point risk
   reduction for this dataset. If [sample_size_pct]% sampling is not
   guaranteed in the final release (e.g., if a larger sample is later
   published), this protection may not hold.

ℹ️ NOTE — Population estimates rely on Multiplier_comb / sampling fraction.
   If this column is dropped before release, re-run with a manually
   specified sampling fraction.

ℹ️ NEXT STEP — Go to "Privacy Enhancement" to apply fixes. Note that
   fixes targeting Prosecutor risk (suppression, generalisation) will also
   reduce Journalist risk, but the reverse is not guaranteed.
```

---

## 7. Validation / Sanity Checks (for testing this implementation)

When testing this module, verify:

1. **`Journalist Re-ID Risk ≤ Prosecutor Re-ID Risk`** for the same QI selection — always. If Journalist risk is ever higher, the implementation is wrong.
2. **If `sample_size_pct = 100%` AND `Multiplier_comb` is constant across all records** (i.e., a self-weighting design), `Journalist Risk == Prosecutor Risk` exactly — the population estimate collapses to the sample.
3. **L-diversity and T-closeness numbers must be IDENTICAL** between the Prosecutor run and Journalist run for the same QI/SA/k/l/t configuration — these checks don't depend on the attacker model.
4. **Population EC Size ≥ Sample EC Size** for every record, always (you can't have fewer people in the population than in your sample for the same group).
5. If `Multiplier_comb` is selected as a Sensitive Attribute or Quasi-Identifier by the user, it should be **excluded from being used simultaneously as the population-weighting column** to avoid circular logic — flag this as a configuration warning.

---

## 8. Attack Score for Top Navigation Bar

```
journalist_score = (re_id_risk_journalist) × 100
```

Display alongside the existing `prosecutor_score` in the Comparison tab. Color: 🔴 >20, 🟡 5-20, 🟢 <5 (same thresholds as Prosecutor).

---

## 9. Data Flow Summary

```
User uploads CSV
       ↓
User selects QIs + SAs + sets k, l, t, sample_size
       ↓
[Run Assessment clicked, "Journalist" checked]
       ↓
1. Sample dataset (sample_size_pct)
2. Build sample-level equivalence classes (groupby QIs)
3. Compute ec_size_sample per record
4. Estimate ec_size_population per record (via Multiplier_comb or sampling fraction)
5. Compute link_score_journalist = 1/ec_size_population
6. Compute re_id_risk_journalist = mean(link_score_journalist)
7. Compute re_id_risk_prosecutor for comparison (reuse Prosecutor logic)
8. Run k-anonymity check using ec_size_population
9. Run l-diversity / t-closeness (SAME as Prosecutor — sample-based, no change)
10. Build Prosecutor-vs-Journalist comparison chart
11. Identify top vulnerable records (by journalist link score)
12. Generate recommendations (Journalist-specific + shared)
       ↓
Render results panel with ALL sections in §6 above
```

---

## 10. Implementation Notes for Replit Agent

1. **Do not recompute L-Diversity/T-Closeness from scratch** — these are sample-based and identical to the Prosecutor module's output for the same QI/SA/k/l/t config. Reuse the existing computation/component.
2. **The Prosecutor-vs-Journalist comparison (§6.2, §6.5) is the defining feature** of this attack type — without it, the Journalist tab is indistinguishable from Prosecutor and provides no additional insight.
3. **The Methodology Disclosure (§6.9) is mandatory** and must clearly state whether `Multiplier_comb` was used or a fallback sampling-fraction estimate.
4. **Run the sanity checks in §7** as automated assertions during development — particularly check #1 (`Journalist ≤ Prosecutor`), since a violation indicates a sign/inversion bug in `ec_size_population`.
5. **All new charts/tables must be built from real computed distributions**, not dummy arrays — same standard as the Prosecutor spec.
6. Status badges in the top nav should reflect `journalist_score` independently of `prosecutor_score`.

---

*Specification version: 1.0 | For MoSPI Statathon 2025 — SafeData Pipeline*
