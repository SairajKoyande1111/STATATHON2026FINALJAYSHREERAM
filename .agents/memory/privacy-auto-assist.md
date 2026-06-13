---
name: Privacy Page Auto-Assist Architecture
description: How TECHNIQUE_CONFIG, colProfiles, and the auto-assist engine work in privacy-page.tsx
---

## Key constants

`TECHNIQUE_CONFIG` maps each SDC technique ID to `{ qi, sa, tc, tcFilter }` where:
- `qi`/`sa`/`tc`: `true | false | "cond"` — whether to show that left-panel section
- `tcFilter`: `"numeric" | "categorical" | "any" | null` — filters the target column list
- Explicit suppression uses `"cond"` for all three; actual show/hide depends on `suppCriterion` state

## Column classification (colProfiles useMemo)
Runs from `rawData` + `allCols`. Per column:
- DIRECT_ID: uniqueCount > 80% N OR name matches `\b(id|serial|no|number|code)\b`
- IGNORE: uniqueCount < 2
- SENSITIVE: name matches `income|salary|wage|health|disease|illness|medical|religion|caste`
- QUASI_ID: everything else

## Auto-assist useEffect
- Key: `"${sdcTech}:${rawData.length}"` stored in `autoAssistDoneRef` to prevent re-runs
- Runs when sdcTech, rawData.length, or colProfiles change
- Pre-selects QI (QUASI_ID cols), SA (highest-entropy SENSITIVE col), TC (filtered by tcFilter)
- Computes technique-specific parameter suggestions (k, l, t, swapFrac, microK, pramRet, noiseLambda)
- Sets `autoAssistMsg` (shown as blue banner in left panel) and `autoSuggestions` (drives "Suggested: X" badges)

**Why:** Prevents users from having to manually classify every column; auto-classification is heuristic and always editable.

## Target column filtering
`filteredTargetCols` = allCols filtered by tcFilter:
- numeric → `colProfiles[c].isNum && uniqueCount > 5 && not DIRECT_ID`
- categorical → `!isNum && 2 ≤ uniqueCount ≤ 50 && not DIRECT_ID`  
- any → SENSITIVE cols first, fallback to QUASI_ID

## Pre-flight checks (PreFlightPanel)
Computed in `preFlightChecks` useMemo. Shows pass/warn/fail per criterion:
- QI selected (if required), SA selected (if required), SA unique ≥ l, dataset size ≥ 2k
- Generalisation: at least one colConfig; Cell suppression: all 3 vars selected

## Seed inputs
SeedInput component added to: rank-swapping (swapSeed), PRAM (pramSeed), noise-addition (noiseSeed), data-shuffling (shuffleSeed). State exists but sdc.ts functions don't yet consume seeds — seeds are cosmetic/for future use.
