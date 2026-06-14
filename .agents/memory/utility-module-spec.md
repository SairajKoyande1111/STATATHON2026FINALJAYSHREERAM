---
name: Utility Measurement Module Spec
description: Full implementation details for the Utility Measurement Module — math engine, backend route, and frontend UI
---

## Architecture

- **Math engine**: `server/utility-compute.ts` — pure TypeScript, no extra deps
- **Backend route**: `POST /api/utility/measure` in `server/routes.ts` — calls computeUtilityMetrics, stores result in `metrics` jsonb of `utilityMeasurements` table
- **Frontend**: `client/src/pages/utility-page.tsx` — full rewrite, ~750 lines

## OUS Formula (Section 6.1)
OUS = (SFS×0.30 + DS×0.25 + IC×0.20 + CP×0.15 + PU×0.10) × 100

Grades: ≥90=A+, ≥80=A, ≥70=B, ≥60=C, ≥50=D, <50=F

## Component Scores
- **SFS** (Statistical Fidelity): NMAE×0.30 + RelBias×0.25 + VarRatio×0.25 + MPS×0.10 + PP×0.10
- **DS** (Distribution Similarity): mean(1 − JSD) for numeric, mean(HI) for categorical
- **IC** (Information Content): mean(1 − |1 − EPR|) across all columns
- **CP** (Correlation Preservation): 1 − Frobenius distance (normalised Pearson matrix diff)
- **PU** (Predictive Utility): mean R² retention via pairwise correlation proxy

## Key Implementation Notes
- Non-aligned rows (suppressed by k-anonymity): uses mean-based NMAE proxy, not row-by-row
- Generalised values ("30-40" strings): parsed as midpoints via `parseMidpoint()`
- Correlation capped at 10 numeric columns for performance
- riskBefore fetched from latest risk assessment for original dataset
- riskAfter is estimated as riskBefore × sfs reduction (not re-computed)

## Frontend Structure (6 tabs + always-visible Section A)
- **Summary (A)**: OUS score, grade badge, 5 component score bars, balance bar, verdict banner
- **Statistical (B)**: FidelityRow with expandable detail (mean/std/percentiles/entropy)
- **Distributions (C)**: HistChart (BarChart with two Bar series), distribution divergence table
- **Correlations (D)**: Frobenius distance + ΔCorrelation heatmap (color-coded table)
- **Privacy-Utility (E)**: RadarOUS (RadarChart) + risk-utility ScatterChart + technique cards
- **Attack Impact (F)**: 3-attack table with before/after/reduction (requires riskBefore)
- **Compliance (G)**: DPDP Act 2023 + NSO checklists

## Export Features
- HTML report: generated client-side from `generateReport(m)`, downloaded as .html
- CSV export: per-column metrics (nmae, ks, jsd, wasserstein, epr, uvrr, sfs)

**Why:** Spec required academic-grade utility measurement for Government of India / Statathon 2025 compliance reporting. Backend computation handles non-aligned data from k-anonymity suppression.
