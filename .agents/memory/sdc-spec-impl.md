---
name: SDC Enhancement Module Spec Implementation
description: Key decisions for the full SDC Privacy Enhancement Module — 7 techniques with spec-exact metrics, PrivacyResult fields, and UI patterns
---

## PrivacyResult new fields (types.ts)
- `colStats?: Record<string, Record<string, string | number>>` — per-column metric breakdown
- `interpretation?: string` — auto-generated plain-English paragraph
- `compliancePassed?: boolean | null` — PASS/FAIL for the technique
- `report?: string` — full HTML report string, downloadable

## Per-technique compliance thresholds
- K-Anonymity: `minEC >= k && suppressedRecords <= ceil(suppressionLimit × N)`
- L-Diversity: `violatingClasses === 0`
- T-Closeness: `violatingClasses === 0`
- Rank Swapping: `avgSpearmanRho >= 0.85`
- Microaggregation: `il (SSE/SST) < 0.30 && avgPearsonR >= 0.80`
- PRAM: `avgTVD < 0.10 && all chi-square p-values > 0.05`
- Top/Bottom Coding: `avgMeanShift < 5%`

## Key metric implementations
- **GIL (K-Anon)**: `GIL[col] = Σ_partitions (partRange/globalRange × partSize) / N`; overall = mean across QI cols
- **Spearman ρ (RankSwap)**: `ρ = 1 - 6×Σd² / (N×(N²-1))` where d = rank_orig - rank_result
- **SSE/SST (Microagg)**: `IL = SSE/SST`; SSE = within-cluster sum of squares vs cluster centroid; SST = total vs global mean
- **TVD (PRAM)**: `TVD = 0.5 × Σ|P_orig(s) - P_new(s)|` over all category values
- **Chi-square p-value (PRAM)**: Wilson-Hilferty normal approximation to chi-square CDF
- **Per-col capping (TopBottom)**: `n_top_capped`, `n_bot_capped`, mean/std shift % per column

## New parameters in privacy-page.tsx
- L-Diversity: `lKBase` (underlying k, default 3), `cRecursive` (c param for recursive, default 0.5)
- T-Closeness: `tKBase` (underlying k, default 3)
- Microaggregation: `microDist` ("euclidean" | "manhattan")
- PRAM: `pramVariant` ("simple" | "unbiased")

## ResultCard UI order
1. Compliance badge (PASS=emerald, FAIL=rose) — only when compliancePassed is not null
2. KPI row (InfoLoss, Records Retained, Suppressed, Execution)
3. Interpretation box (blue tinted)
4. Algorithm Statistics table (YES/NO highlighted green/red)
5. Per-Column Statistics table (if colStats present)
6. Warnings
7. Sample Output table
8. Download CSV + Download Report (HTML) buttons

**Why:** Spec §1.4–§7.4 requires these specific metrics; compliance PASS/FAIL is the top-level signal for judges; HTML report per spec §D template.
