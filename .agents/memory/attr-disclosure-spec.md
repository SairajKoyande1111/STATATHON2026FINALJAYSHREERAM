---
name: Attribute Disclosure Spec
description: Core formulas, interface shape, and runner signature for the Attribute Disclosure Attack
---

## Core formula
disc_risk(r, SA) = dominant_freq(EC(r), SA) = max_count_in_EC / EC_size
ADR(SA) = mean(disc_risk) across all N records
overall_ADR = max(ADR per SA)   ← worst-case SA drives the score

## Disclosure labels
Guaranteed: freq >= 1.0   (homogeneous EC — 100% certain)
High:       freq >= 0.75
Moderate:   freq >= 0.50
Safe:       freq <  0.50

## Badge thresholds (overall_ADR)
> 0.60  → HIGH    🔴
0.20–0.60 → MEDIUM 🟡
< 0.20  → LOW     🟢

## Runner signature
runAttributeDisclosureAttack(data, quasiIdentifiers, sensitiveAttributes, lThreshold=3, tThreshold=0.2)

## Key result fields
overallAdr, perSAResults[], recordTable[], topVulnerable[], saSensitivityRanking[], mostVulnerableEc

## UI — 13 sections (§5.1–§5.12 + §5.13 badge)
§5.1 Summary banner with risk level + narrative
§5.2 KPI row per SA (ADR, Guaranteed, Homogeneous ECs, L-Violating ECs, Safe Records)
§5.3 Disclosure risk donut per SA (Guaranteed/High/Moderate/Safe)
§5.4 Record-level trace table — paginated 50/page, filter bar, CSV export
§5.5 Attack simulation narrative — uses mostVulnerableEc real values
§5.6 EC homogeneity heatmap — table + horizontal bar chart, dashed 1/l threshold line
§5.7 Global SA distribution — horizontal bar chart
§5.8 L-Diversity check per SA (PASS/FAIL, min distinct, violating ECs)
§5.9 T-Closeness check per SA (PASS/FAIL, max TVD, violating ECs)
§5.10 Top 10 vulnerable records table
§5.11 SA sensitivity ranking — table + bar chart (only if >1 SA)
§5.12 Conditional recommendations

## Why
A dataset can satisfy k-anonymity and still be 100% vulnerable to attribute disclosure
if every EC is internally homogeneous on a sensitive attribute. This is what l-diversity
was designed to prevent. The spec explicitly surfaces this distinction in the summary card.
