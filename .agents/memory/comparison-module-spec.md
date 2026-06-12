---
name: Comparison Module Spec
description: NIST_CRS computation, UI sections, and call-site conventions for the Comparison Dashboard
---

## NIST_CRS Computation

- **Raw score**: `riskScore * 100` for all attacks (all riskScores are 0-1 fractions)
- **Normalisation (§2.3)**: `N_i = clip((S_i - safe_i) / (80 - safe_i) * 100, 0, 100)` — threshold-relative, not raw %
- **Weights (§2.2)**: Prosecutor/Marketer/ModelInversion = 1.5; SinglingOut/Inference/AttrDisclose = 1.2; RecLinkage/Differencing = 1.0; Journalist/Membership = 0.8
- **NIST_CRS thresholds**: 0–24 LOW, 25–49 MEDIUM, 50–69 HIGH, 70–100 CRITICAL (NOT 30/50/70)
- **Safe thresholds**: Prosecutor/Journalist/Marketer/SinglingOut/Membership/RecLinkage = 5; Inference = 40; AttrDisclose/Differencing = 20; ModelInversion = 30

## Call Site

`computeCompositeScore` in `client/src/lib/attacks/compositeScore.ts` accepts `RawAttackResults` — the full result objects, NOT just `.riskScore` scalars. The call site in `risk-page.tsx` passes `newResults` sub-objects directly plus `kVal`, `lVal`, `tVal`.

## UI Sections (§4.1–§4.9)

1. §4.9 Plain-English Summary paragraph (top of card)
2. §4.1 NIST gauge bar with markers at 25, 50, 70
3. §4.2 6-axis radar (6 axes group 10 attacks: Re-ID, Pop.Linkage, AttrDisc, SinglingOut, Membership, ModelInv)
4. §4.3 Normalised score breakdown bars (side-by-side with §4.2)
5. §4.4 Raw score horizontal bar chart (with reference lines at 5/20/50)
6. §4.5 Risk summary table (raw, norm, per-attack level, pass/fail, key metric)
7. §4.8 Priority action list (rich cards with mechanism + attacks addressed)
8. §4.6 Cross-attack comparison table (static threat model)
9. §4.7 Protection coverage matrix (static, ✅/⚠️/❌ per mechanism×attack)

**Why:** Spec §1–§10. Normalisation makes scores comparable across attacks with different natural ranges.
**How to apply:** Any change to NIST_CRS thresholds or weights must update ATTACK_WEIGHTS/SAFE_THRESHOLDS constants at top of compositeScore.ts. The `riskScore * 100` extraction works for all 10 attacks since their riskScore fields are all 0-1 fractions.
