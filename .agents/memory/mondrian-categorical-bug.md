---
name: Mondrian Categorical Bug
description: Two root-cause bugs that made K-Anonymity show 0% information loss for categorical QI columns, and the backend persistence fix
---

## Bug 1: mondrianPartition skipped categorical QI columns entirely
**Symptom:** K-Anonymity showed 0% information loss and 100% records retained — made it look like the algorithm did nothing.

**Root cause:** `mondrianPartition` converted all QI values to `Number(...)`. Non-numeric codes (e.g. "Round_Centre_Code", "FSU_Serial_No" stored as strings) produced NaN → `vals` was empty → `bestRange === 0` → the function returned `[partition]` with ALL records in one group. No splits happened at all.

**Fix:** Added categorical branch:
- Score = `(partD - 1) / (globalD - 1)` (normalised diversity)
- Split by sorting distinct values alphabetically and assigning the first half to the left partition
- Numeric columns still use the original range-based score

## Bug 2: Categorical GIL was always 0
**Root cause:** The GIL update (`gilPerCol.set(...)`) only ran inside the `isNumericCol` branch. Categorical QI columns silently contributed 0, so overall GIL = 0%.

**Fix:** Added categorical GIL formula in the `else` branch:
```
gilPerCol[col] += ((localDistinct - 1) / (globalDistinct - 1)) × partitionSize
```
Pre-computed `globalDistinctCounts` map avoids redundant Set construction.

## Backend persistence fix
Operations were never saved — `GET /api/privacy/operations` always returned `[]`.

**Fix:** Added `POST /api/privacy/save-result` endpoint in routes.ts that calls `storage.createPrivacyOperation(...)`. Frontend `handleRun` now fire-and-forgets a save call after each algorithm run and invalidates the operations query cache. A "Recent Operations" history card appears in the left panel once operations exist.

**Why:** Without backend persistence, the system looked non-functional even when algorithms ran correctly.

**How to apply:** Any future SDC algorithm additions must also handle categorical columns in both the partition scoring and the GIL computation.
