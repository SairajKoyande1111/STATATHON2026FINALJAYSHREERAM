# REPLIT PROMPT — Complete Risk Assessment Module (Statathon 2025)

## CONTEXT & OVERVIEW

You are building a **Risk Assessment Module** for a **Statistical Data Privacy** web application built for **Statathon 2025** (MoE's Innovation Cell, Government of India). The existing app already has a left sidebar with dataset selection, quasi-identifier checkboxes, sensitive attribute checkboxes, K-anonymity threshold slider, sample size slider, and attack scenario checkboxes. The right panel has tabs for Prosecutor, Journalist, and Marketer attacks.

**Your task:** Completely rebuild the Risk Assessment module with **6 attack types**, rigorous mathematical algorithms, detailed per-attack reports, and a cross-attack comparison dashboard.

---

## TECH STACK

- **Frontend:** React + TypeScript + Tailwind CSS (already in project)
- **Charts:** Recharts (already installed) or Chart.js
- **Math utilities:** mathjs or plain JavaScript math
- **State:** React hooks (useState, useReducer, useEffect, useMemo)
- **No backend needed:** All computation runs client-side in the browser

---

## DATASET STRUCTURE

The CSV files have these columns (from Block_3_Household_characteristics dummy test file.csv):
- `Round_Centre_Code`, `FSU_Serial_No`, `Round`, `Sch_No`, `Sample`, `Sector`, `State_Region`, `District`, `Stratum`, `Sub_Stratum`, `Sub_Round`, `FOD_Sub_Region`, `HH_Size`, `NIC_2008`, `NCO_2004`
- Quasi-identifiers: user selects from available columns (usually: FSU_Serial_No, Round, State_Region, District, Stratum, etc.)
- Sensitive attributes: user selects (usually: HH_Size, NIC_2008, NCO_2004)

---

## ARCHITECTURE — FILE STRUCTURE

```
src/
  components/
    RiskAssessment/
      index.tsx                    ← Main page layout
      ConfigPanel.tsx              ← Left sidebar (existing, enhance)
      AttackTabs.tsx               ← Tab navigation for all 6 attacks
      AttackReport.tsx             ← Per-attack detailed report
      ComparisonDashboard.tsx      ← Cross-attack comparison panel
      CompositeScore.tsx           ← NIST composite risk score card
  lib/
    attacks/
      prosecutorAttack.ts          ← Attack 1 math
      journalistAttack.ts          ← Attack 2 math
      marketerAttack.ts            ← Attack 3 math
      singleOutAttack.ts           ← Attack 4 math
      inferenceAttack.ts           ← Attack 5 math
      membershipAttack.ts          ← Attack 6 math
      compositeScore.ts            ← Weighted composite scorer
      utils.ts                     ← Shared math utilities
    dataLoader.ts                  ← CSV parsing + sampling
```

---

## ATTACK 1: PROSECUTOR ATTACK — Record Linkage Simulation

### Concept
The attacker **knows** the target is in the dataset and tries to uniquely identify them by linking quasi-identifiers to an external auxiliary dataset (voter rolls, LinkedIn, public records).

### Mathematical Algorithm

**Step 1: Equivalence Class Computation**
```
For dataset D with quasi-identifiers Q = {q1, q2, ..., qk}:
EC(r) = {r' ∈ D | r'[qi] = r[qi] ∀ qi ∈ Q}  for each record r
k(r) = |EC(r)|  ← equivalence class size for record r
```

**Step 2: Simulate Auxiliary Dataset Generation**
```
aux_D = synthetic dataset with same quasi-identifier distribution
       but independently sampled (mimics public data)
- For categorical columns: sample from empirical distribution P(qi = v) = count(v)/n
- For numeric columns: add Gaussian noise N(μ, σ/4) to original values
- Size: |aux_D| = 3 × |D|  (public data is larger)
```

**Step 3: Record Linkage Scoring**
For each record r in D, attempt to match against aux_D:
```
fingerprint(r) = {qi: r[qi] for all qi ∈ Q}

matches(r) = {r' ∈ aux_D | r'[qi] = r[qi] ∀ qi ∈ Q}

Link score:
  if |matches(r)| = 0  → link_score(r) = 0       (no match, safe)
  if |matches(r)| = 1  → link_score(r) = 1.0      (unique match, fully identified)
  if |matches(r)| > 1  → link_score(r) = 1/|matches(r)|  (ambiguous, fractional risk)
```

**Step 4: Prosecutor Re-ID Risk**
```
Prosecutor_Risk = (1/n) × Σ link_score(r) for all r ∈ D

Equivalently: weighted mean of per-record linkage scores
```

**Step 5: Additional Metrics**
```
Uniqueness_Rate = |{r : k(r) = 1}| / n           ← % of unique records
HighRisk_Rate   = |{r : k(r) < k_threshold}| / n ← % below k-threshold
Avg_EC_Size     = mean(k(r) for all r)
Min_k           = min(k(r) for all r)
```

### What to Show in Report
1. **KPI Cards:** Re-ID Risk %, Unique Records Count, Avg Equivalence Class Size, Min-K value
2. **Equivalence Class Distribution Bar Chart:** X-axis = class sizes (1, 2-4, 5-10, >10), Y-axis = count of records
3. **Linkage Score Distribution Histogram:** distribution of per-record link scores (0 to 1)
4. **Top 10 Most Vulnerable Records Table:** show which records have link_score = 1.0 (masked: show only quasi-identifier combination, not actual IDs)
5. **Risk-Protection Donut:** At Risk% vs Protected%
6. **Recommendations:** If Min-K < threshold → suggest generalization; If Uniqueness > 50% → suggest suppression

---

## ATTACK 2: JOURNALIST ATTACK — Probabilistic Re-identification (Information Theory)

### Concept
The attacker **randomly samples** a person from the population and tries to find them in the dataset. They have limited background knowledge but use statistical properties of the dataset.

### Mathematical Algorithm

**Step 1: Equivalence Classes**
```
Same as Prosecutor: compute EC(r) and k(r) for all records
```

**Step 2: Re-identification Probability per Record**
```
P_reid(r) = 1 / k(r)

Interpretation: If record r is in an equivalence class of size k,
the probability of correctly identifying this specific person = 1/k
```

**Step 3: Journalist Risk (Weighted Average)**
```
Journalist_Risk = Σ [P_record(r) × P_reid(r)]   for all r ∈ D

where P_record(r) = 1/n  (journalist samples uniformly at random)

∴ Journalist_Risk = (1/n) × Σ (1/k(r))

This is equivalent to: mean of (1/k) across all records
```

**Step 4: Information-Theoretic Metrics**
```
Shannon Entropy of EC distribution:
H = -Σ P(k=s) × log2(P(k=s))  for each unique EC size s
P(k=s) = |{r : k(r) = s}| / n

Higher H → more spread in EC sizes → less predictable risk

Normalized Entropy:
H_norm = H / log2(n)   ← 0 = all same size, 1 = maximally diverse

Information Gain from quasi-identifiers:
IG(q) = H(all records) - H(records | q removed)
Sort by IG to find which quasi-identifiers contribute most to risk
```

**Step 5: Violation Count**
```
K_violations = |{r : k(r) < k_threshold}|
Violation_Rate = K_violations / n
```

**Step 6: Baseline Comparison**
```
Random_Guess_Risk = 1/n        ← without quasi-identifiers
Journalist_Risk_Lift = Journalist_Risk / Random_Guess_Risk
← How many times worse than random guessing?
```

### What to Show in Report
1. **KPI Cards:** Journalist Risk %, Violations Count, Entropy H_norm, Risk Lift (×N worse than random)
2. **Equivalence Class Distribution** (same chart as Prosecutor but with 1/k overlay line)
3. **Per-Quasi-Identifier Information Gain Bar Chart:** which QIs contribute most to risk
4. **Risk vs Class Size Scatter:** bubble chart — each bubble = one EC, size = member count, y-axis = 1/k risk
5. **Risk-Protection Donut**
6. **Entropy Gauge:** visual showing current H_norm on a 0-1 scale
7. **Recommendations:** List which QIs to generalize first based on IG ranking

---

## ATTACK 3: MARKETER ATTACK — Attribute Disclosure + L-Diversity

### Concept
The attacker doesn't care about one person. They want to **profile groups** and infer sensitive attributes about entire equivalence classes. This violates l-diversity even if k-anonymity is satisfied.

### Mathematical Algorithm

**Step 1: Group by Quasi-Identifiers**
```
Groups G = {g1, g2, ..., gm}  partitioned by quasi-identifier combinations
Each group gi has:
  - members: all records sharing the same QI values
  - size: |gi|
  - sensitive values: distribution of each sensitive attribute within gi
```

**Step 2: L-Diversity Check**
```
For each group gi and each sensitive attribute S:
  L(gi, S) = number of distinct values of S within gi

l-diversity is satisfied for gi iff:
  L(gi, S) ≥ l_threshold   (usually l_threshold = 3)

Group is l-diverse if ALL sensitive attributes satisfy the above
```

**Step 3: Attribute Disclosure Risk per Group**
```
Dominant_Prob(gi, S) = max_value_count(gi, S) / |gi|
  ← probability that a member of group gi has the most common sensitive value

Attribute_Disclosure_Risk(gi, S):
  if Dominant_Prob ≥ 0.5 → HIGH risk (attacker is right >50% of time)
  if L(gi, S) = 1        → CRITICAL (all members same sensitive value)

Overall group risk:
  Group_Risk(gi) = max over all S of Dominant_Prob(gi, S)
```

**Step 4: T-Closeness Check (Earth Mover's Distance)**
```
For each group gi and sensitive attribute S:
  global_dist = frequency distribution of S across entire dataset D
  local_dist  = frequency distribution of S within gi

T-Closeness uses Earth Mover's Distance (EMD):
  For categorical attribute with m unique values:
  
  EMD(gi, S) = (1/2) × Σ |local_dist(v) - global_dist(v)|  for all values v
             = Total Variation Distance

t-closeness satisfied iff: EMD(gi, S) ≤ t_threshold (usually 0.2)

High EMD → group's sensitive attribute distribution deviates from global
          → attacker learns more than expected from group membership
```

**Step 5: Marketer Overall Risk**
```
Marketer_Risk = weighted average of Group_Risk(gi) weighted by |gi|
             = Σ (|gi|/n) × Group_Risk(gi)

L_Diversity_Score = proportion of groups that satisfy l-diversity
                  = |{gi : L(gi, all S) ≥ l_threshold}| / m

T_Closeness_Score = proportion of groups satisfying t-closeness
                  = |{gi : EMD(gi, all S) ≤ t_threshold}| / m
```

### What to Show in Report
1. **KPI Cards:** Marketer Risk %, L-Diversity Pass Rate %, T-Closeness Pass Rate %, At-risk Groups Count
2. **Group Risk Heatmap:** rows = groups (by QI combination), columns = sensitive attributes, cell = Dominant_Prob (color: green→red)
3. **L-Diversity Distribution Bar Chart:** X = L value (1,2,3,4,5+), Y = group count
4. **T-Closeness (EMD) Distribution Histogram**
5. **Most Dangerous Groups Table:** top 5 groups with highest Dominant_Prob + their QI combination
6. **Risk-Protection Donut** (At Risk = groups failing l-diversity or t-closeness)
7. **Sensitive Attribute Distribution Comparison:** global vs worst-performing group (side-by-side bar)

---

## ATTACK 4: SINGLING OUT ATTACK — GDPR Article 4(1) Standard

### Concept
Can an attacker write a **query** that returns **exactly one record**? Under GDPR Article 4(1) and India's DPDP Act 2023, singling out an individual constitutes a privacy violation even without full re-identification. This is the most **legally relevant** attack.

### Mathematical Algorithm

**Step 1: Single-Attribute Singling Out**
```
For each record r and each attribute a:
  Count(a, r[a]) = |{r' ∈ D : r'[a] = r[a]}|
  
  If Count = 1 → record r is singled out by attribute a alone
```

**Step 2: Multi-Attribute Combination Search**
```
For each record r:
  singled_out = False
  min_combo_size = ∞
  
  For combo_size k from 1 to min(5, |all_columns|):
    For each combination C of k attributes:
      matching = {r' ∈ D : r'[a] = r[a] ∀ a ∈ C}
      
      if |matching| = 1:
        singled_out = True
        min_combo_size = k
        break outer loop
  
  Record r is "singulable" if singled_out = True
  Record r's "privacy footprint" = min_combo_size attributes needed to single it out
```

**Step 3: Singling Out Metrics**
```
Singling_Out_Rate = |{r : r is singulable}| / n

Privacy_Footprint_Distribution = histogram of min_combo_size
  ← how many attributes does an attacker need on average?

Average_Footprint = mean(min_combo_size for singulable records)

Attribute_Singulability_Score(a):
  = proportion of records uniquely identified by attribute a alone
  Sort attributes by this score → identify high-risk attributes
```

**Step 4: Query Complexity Estimate**
```
For an attacker with background knowledge of k attributes:
  P_singling_out(k) = proportion of records singulable with ≤ k attributes
  
  Plot P_singling_out(k) for k = 1, 2, 3, 4, 5
  → "attack effort curve" showing how fast singling out becomes possible
```

### What to Show in Report
1. **KPI Cards:** Singling Out Rate %, Average Attributes Needed, Safest Attribute Combo Count, GDPR Compliance Status (PASS/FAIL)
2. **Privacy Footprint Histogram:** X = combo size needed (1,2,3,4,5), Y = record count — shows how "easy" singling out is
3. **Attack Effort Curve (Line Chart):** X = attacker knowledge (# attributes), Y = % of records singulable — shows risk vs attacker capability
4. **Per-Attribute Singulability Bar Chart:** which individual attributes create the most singling-out risk
5. **GDPR Risk Badge:** prominently show if dataset violates GDPR/DPDP singling-out standard
6. **Recommendations:** For each high-risk attribute, suggest specific suppression or generalization

---

## ATTACK 5: INFERENCE ATTACK — ML-Based Attribute Prediction

### Concept
The attacker trains a **machine learning model** on publicly available data to **predict sensitive attributes** from quasi-identifiers alone. This is how modern real-world attackers operate. Even without re-identification, if sensitive info can be inferred from non-sensitive attributes, privacy is violated.

### Mathematical Algorithm

**Step 1: Feature Engineering**
```
X = quasi-identifier columns (features)
y = sensitive attribute column (target)

Preprocessing:
  - Categorical X columns → frequency encoding (value → count/total)
  - Numeric X columns → min-max normalization to [0, 1]
  - Handle missing values with column mode/mean
```

**Step 2: Attacker Model (Decision Tree Classifier)**
```
Use a Decision Tree (implementable in pure JS without ML libraries):
  
Algorithm (CART — Classification and Regression Tree):
  1. Split criterion: Gini Impurity
     Gini(S) = 1 - Σ P(class_i)²
     
  2. Best split selection:
     For each attribute a and each threshold t:
       Left  = {r ∈ S : r[a] ≤ t}
       Right = {r ∈ S : r[a] > t}
       Gini_split = (|Left|/|S|)×Gini(Left) + (|Right|/|S|)×Gini(Right)
     Choose (a, t) that minimizes Gini_split
  
  3. Build recursively until:
     - Max depth = 8
     - Min samples per leaf = 3
     - Or node is pure (Gini = 0)
```

**Step 3: Cross-Validation (5-Fold)**
```
Shuffle and split D into 5 equal folds F1, F2, F3, F4, F5

For each fold Fi:
  Train on D \ Fi → compute accuracy on Fi

Attack_Accuracy = mean accuracy across all 5 folds

Baseline_Accuracy = max class frequency / n   (best random guess)
  ← if sensitive attr has 3 values with 70/20/10 split, baseline = 0.70

Information_Gain_of_Attack = Attack_Accuracy - Baseline_Accuracy
  ← How much BETTER than random guessing? This is the privacy threat.
```

**Step 4: Feature Importance (Gini Importance)**
```
For each quasi-identifier qi:
  Importance(qi) = Σ [Δ_Gini at each node where qi is the split attribute]
  (weighted by # samples reaching that node)

Normalize: Importance(qi) /= Σ Importance(all qi)
→ shows which quasi-identifiers are most predictive of sensitive values
```

**Step 5: Risk Classification**
```
If Information_Gain > 0.20 → CRITICAL (AI can easily infer sensitive values)
If Information_Gain > 0.10 → HIGH
If Information_Gain > 0.05 → MEDIUM
Else                       → LOW
```

**Step 6: Per-Sensitive-Attribute Analysis**
```
Run the above for EACH sensitive attribute separately
→ gives per-attribute inference risk score
```

### What to Show in Report
1. **KPI Cards:** Attack Accuracy %, Baseline Accuracy %, Information Gain %, Risk Level badge
2. **Feature Importance Bar Chart:** ranked quasi-identifiers by how predictive they are of sensitive values
3. **Accuracy vs Baseline Comparison:** simple paired bar chart showing attack vs random baseline
4. **Confusion Matrix (if binary/small classes):** show where attacker succeeds/fails
5. **Decision Tree Visualization (simplified):** show top 3 levels of the decision tree as a visual — which attribute is split first, what threshold, what classes go where
6. **Per-Sensitive-Attribute Table:** one row per sensitive attribute showing Attack Accuracy, Baseline, Information Gain, Risk Level
7. **Recommendations:** For high-IG attributes, suggest which QI column to suppress/generalize (highest importance score = suppress first)

---

## ATTACK 6: MEMBERSHIP INFERENCE ATTACK — Dataset Presence Detection

### Concept
Can an attacker determine whether a **specific individual's record exists** in the dataset at all? Even knowing someone's data was collected can be a privacy violation (reveals participation in a survey, medical study, etc.). This is a cutting-edge attack type from privacy literature.

### Mathematical Algorithm

**Step 1: Statistical Distance Metric**
```
For a probe record p (not from dataset) and dataset D:
Compute similarity of p to each record r ∈ D:

For categorical attribute a:
  sim_a(p, r) = 1 if p[a] = r[a], else 0

For numeric attribute a:
  sim_a(p, r) = 1 - |p[a] - r[a]| / range(a)
              where range(a) = max(a) - min(a)

Overall similarity:
  sim(p, r) = (1/|Q|) × Σ sim_a(p, r)  for all a ∈ Q
```

**Step 2: Nearest Neighbor Distance**
```
For probe p:
  NN_sim(p) = max{sim(p, r) : r ∈ D}   ← similarity to closest record

Membership Prediction:
  if NN_sim(p) ≥ 0.85 → MEMBER (record p is likely in dataset)
  if NN_sim(p) < 0.85 → NON-MEMBER
  Confidence = NN_sim(p)
```

**Step 3: Threshold Calibration (AUC-Based)**
```
Generate shadow dataset:
  - Members: 30% of actual D (randomly sampled)
  - Non-members: synthetic records with same QI distribution but independently sampled

For each threshold t from 0.5 to 1.0 in steps of 0.05:
  TPR(t) = |{members correctly classified}| / |members|
  FPR(t) = |{non-members misclassified}| / |non-members|

AUC (Area Under ROC Curve):
  AUC = Σ (FPR[i] - FPR[i-1]) × (TPR[i] + TPR[i-1]) / 2

AUC = 0.5  → random guessing (no membership leakage)
AUC = 1.0  → perfect membership inference (full leakage)

Membership_Risk_Score = 2 × (AUC - 0.5)   ← normalized 0→1
```

**Step 4: Dataset-Level Memorization Score**
```
For each record r ∈ D:
  Leave r out: D' = D \ {r}
  Nearest Neighbor similarity within D':
    NN_in_D(r) = max{sim(r, r') : r' ∈ D, r' ≠ r}
  
  If NN_in_D(r) < 0.7:
    Record r is "isolated" = easy to detect as a member via outlier detection
  
Isolation_Rate = |{r : NN_in_D(r) < 0.7}| / n
```

**Step 5: Membership Risk Metrics**
```
Overall_Membership_Risk = (AUC - 0.5) × 2  ← rescaled to 0-1
Isolation_Risk = Isolation_Rate             ← proportion of easily detectable records
Dataset_Memorization = mean(NN_sim for all r ∈ D against itself)
```

### What to Show in Report
1. **KPI Cards:** AUC Score, Membership Risk %, Isolation Rate %, Dataset Memorization Score
2. **ROC Curve (Line Chart):** TPR vs FPR for various thresholds — show AUC area filled in
3. **Similarity Distribution (Dual Histogram):** similarity scores for members vs non-members — ideally they should overlap (good privacy), separation = risk
4. **Isolation Map (Scatter/Bubble):** X = NN similarity within dataset, Y = record index, highlight isolated records (low similarity = high membership leakage risk)
5. **Threshold Sensitivity Table:** for each threshold (0.6, 0.7, 0.8, 0.85, 0.9), show TPR, FPR, Precision
6. **Recommendations:** Increase dataset density (add synthetic records for isolated entries), apply noise addition (differential privacy), use suppression for isolated records

---

## COMPOSITE RISK SCORE — NIST Privacy Framework

### Algorithm
```
Weights (based on NIST Privacy Framework + GDPR severity):
  w_prosecutor = 0.25    (targeted, high severity)
  w_journalist  = 0.20   (random, realistic threat)
  w_marketer    = 0.15   (group-level, lower individual risk)
  w_singling    = 0.20   (legally mandated GDPR/DPDP check)
  w_inference   = 0.15   (modern AI threat)
  w_membership  = 0.05   (supplementary, niche threat)

Composite_Score = Σ w_i × Risk_i  for all 6 attacks
                = weighted average of individual 0-1 risk scores

Scale to 0-100:
  Final_Score = Composite_Score × 100

Risk Level:
  ≥ 70 → CRITICAL  (immediate action required)
  ≥ 50 → HIGH      (significant risk, address urgently)
  ≥ 30 → MEDIUM    (moderate risk, plan mitigation)
  < 30 → LOW       (acceptable privacy risk)
```

---

## COMPARISON DASHBOARD — Cross-Attack Analysis

### What to Show

1. **Composite Score Gauge:** Large circular gauge (0-100) with color zones (green 0-30, yellow 30-50, orange 50-70, red 70-100), animated fill

2. **Radar Chart (Spider Chart):** 6 axes — one per attack — shows relative risk profile at a glance. Filled polygon in red. Reference polygon in green showing "safe" thresholds.

3. **Attack Comparison Bar Chart:** Horizontal bars for all 6 attacks sorted by risk score. Color coded (red = high, orange = medium, green = low). Shows composite score line.

4. **Risk Summary Table:**
   | Attack | Risk Score | Risk Level | Primary Threat | Key Metric | Status |
   |---|---|---|---|---|---|
   | Prosecutor | 87% | CRITICAL | Record linkage | 20 unique records | ❌ FAIL |
   | Journalist | 40% | MEDIUM | QI violations | 20 violations | ⚠️ WARN |
   | Marketer | 100% | CRITICAL | Attribute disclosure | 0% l-diversity | ❌ FAIL |
   | Singling Out | 65% | HIGH | GDPR exposure | 13 singulable | ❌ FAIL |
   | Inference | 35% | MEDIUM | AI prediction | 0.15 info gain | ⚠️ WARN |
   | Membership | 25% | LOW | Presence detection | AUC 0.62 | ✅ PASS |

5. **Priority Action List:** Ordered recommendations by impact × feasibility:
   - 🔴 URGENT: [action] → addresses [attack] reducing risk from X% to ~Y%
   - 🟡 IMPORTANT: [action] → ...
   - 🟢 OPTIONAL: [action] → ...

6. **Privacy Budget Tracker:** Shows how much "privacy budget" (ε in differential privacy terms) is implicitly used by each attack

---

## UI/UX SPECIFICATIONS

### Left Sidebar (Config Panel)
- Same as current: dataset selector, QI checkboxes, sensitive attr checkboxes
- Add: **L-diversity threshold** slider (1-5, default 3)
- Add: **T-closeness threshold** slider (0.05-0.50, default 0.20)
- Keep: K-anonymity threshold slider, sample size slider
- **6 attack checkboxes** (all enabled by default):
  - ☑ Prosecutor Attack (Record Linkage)
  - ☑ Journalist Attack (Probabilistic)
  - ☑ Marketer Attack (Attribute Disclosure)
  - ☑ Singling Out Attack (GDPR Standard)
  - ☑ Inference Attack (ML-Based)
  - ☑ Membership Attack (Presence Detection)
- **Run Assessment button** → triggers all enabled attacks

### Right Panel (Attack Results)
- **Top Navigation:** 7 tabs — [Prosecutor] [Journalist] [Marketer] [Singling Out] [Inference] [Membership] [📊 Comparison]
- Each attack tab = badge showing risk level (HIGH/MEDIUM/LOW/CRITICAL in red/orange/yellow/green)
- **Comparison tab** = always visible, shows composite score + full comparison dashboard

### Loading States
- Show a progress indicator per attack as they compute
- Attacks run sequentially with progress: "Running Prosecutor Attack... (1/6)"
- Show partial results as each attack finishes

### Color Coding (consistent throughout)
- CRITICAL: `#DC2626` (red-600)
- HIGH: `#EA580C` (orange-600)
- MEDIUM: `#D97706` (amber-600)
- LOW: `#16A34A` (green-600)
- PASS: `#16A34A`
- FAIL: `#DC2626`

---

## IMPLEMENTATION NOTES FOR REPLIT

### Performance Optimization
- If dataset > 500 rows, use the sample_size slider to subsample before running attacks
- Run attacks in Web Workers if available, else use setTimeout(0) between attacks to keep UI responsive
- Memoize equivalence class computation since Prosecutor + Journalist + Marketer all need it

### Decision Tree Implementation (Pure JS, No ML Library)
```typescript
// Minimal CART decision tree for Inference Attack
interface TreeNode {
  attribute?: string;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  prediction?: string;
  gini?: number;
}

function gini(labels: string[]): number {
  const counts = new Map<string, number>();
  labels.forEach(l => counts.set(l, (counts.get(l) || 0) + 1));
  const n = labels.length;
  let sum = 0;
  counts.forEach(c => { sum += (c/n) ** 2; });
  return 1 - sum;
}

function buildTree(X: number[][], y: string[], depth: number, maxDepth: number): TreeNode {
  if (depth >= maxDepth || new Set(y).size === 1 || y.length < 6) {
    const counts = new Map<string, number>();
    y.forEach(l => counts.set(l, (counts.get(l) || 0) + 1));
    let best = ''; let bestC = 0;
    counts.forEach((c, l) => { if (c > bestC) { best = l; bestC = c; } });
    return { prediction: best };
  }
  // Find best split...
  // (implement CART split search here)
}
```

### Cross-Validation Utility
```typescript
function kFoldCV(X: number[][], y: string[], k: number = 5): number {
  const n = X.length;
  const foldSize = Math.floor(n / k);
  let totalCorrect = 0;
  
  for (let fold = 0; fold < k; fold++) {
    const valStart = fold * foldSize;
    const valEnd = (fold + 1) * foldSize;
    
    const X_train = [...X.slice(0, valStart), ...X.slice(valEnd)];
    const y_train = [...y.slice(0, valStart), ...y.slice(valEnd)];
    const X_val = X.slice(valStart, valEnd);
    const y_val = y.slice(valStart, valEnd);
    
    const tree = buildTree(X_train, y_train, 0, 8);
    X_val.forEach((x, i) => {
      if (predict(tree, x) === y_val[i]) totalCorrect++;
    });
  }
  return totalCorrect / n;
}
```

### Earth Mover's Distance (Pure JS)
```typescript
function totalVariationDistance(
  localDist: Map<string, number>, 
  globalDist: Map<string, number>
): number {
  const allValues = new Set([...localDist.keys(), ...globalDist.keys()]);
  let tvd = 0;
  allValues.forEach(v => {
    const local = localDist.get(v) || 0;
    const global = globalDist.get(v) || 0;
    tvd += Math.abs(local - global);
  });
  return tvd / 2;  // EMD for categorical = TVD
}
```

---

## FINAL DELIVERABLE CHECKLIST

The completed module must have:
- [ ] 6 attack implementations with correct math
- [ ] Each attack produces: 4 KPI cards + 2-3 charts + recommendations
- [ ] Comparison Dashboard with radar chart + composite score gauge + summary table
- [ ] Left sidebar with all config options including new L-div and T-closeness thresholds
- [ ] Tab navigation with risk level badges
- [ ] Loading states during computation
- [ ] Color-coded risk levels throughout
- [ ] Responsive layout matching existing app design (white theme, MoE branding retained)
- [ ] No crashes on the dummy CSV dataset provided

---

## REFERENCE: CURRENT BUG FIX

In the existing code, Marketer Attack shows Re-ID Risk = 100% AND Success Rate = 0% simultaneously, which displays as contradictory. Fix: rename "Success Rate" to **"Protection Effectiveness"** and set it as `Protection = 1 - ReID_Risk`. This makes 100% ReID Risk → 0% Protection (correct semantics, not a contradiction).

---

*End of prompt. Total attacks: 6. Total report sections per attack: 5-7. Comparison views: 5. Mathematical rigor: full.*
