---
name: Form B Rarity Scoring
description: How to compute Form B membership score from Multiplier_comb without boundary artifacts
---

## Rule
Use **sigmoid on log z-score** — never min-max normalization (even in log-space).

```
logMults = validMultipliers.map(v => log(v))
meanLog  = mean(logMults)
stdLog   = std(logMults)
z_i      = (meanLog - log(mult_i)) / stdLog    # inverted: low mult → rare → positive z
score_i  = 1 / (1 + exp(-z_i))
```

## Why
Any min-max normalization (linear or log-space) mathematically forces the boundary records to exactly 0 and 1. Soft-clamping to 0.001/0.999 only masks this — the min/max records still land at those exact boundary values. The sigmoid on a z-score has no normalization arithmetic, so no record is forced to a boundary unless it is genuinely many standard deviations from the mean.

Threshold properties:
- sigmoid(0) = 0.500 → median-multiplier record
- sigmoid(±2) ≈ 0.88 / 0.12 → 2 std-devs from mean in log space
- sigmoid(±3) ≈ 0.95 / 0.05 → only genuine outliers exceed 0.95/0.05

## How to apply
File: `client/src/lib/attacks/membershipAttack.ts`, Step 5 (Form B block). If you ever need to renormalize Multiplier_comb or any other ratio-scale quantity that spans orders of magnitude, use this pattern.
