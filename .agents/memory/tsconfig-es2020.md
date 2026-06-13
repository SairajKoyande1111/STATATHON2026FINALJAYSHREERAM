---
name: tsconfig ES2020 Target
description: Why target ES2020 is needed and how to fix stale incremental cache
---

## Rule
`tsconfig.json` must have `"target": "ES2020"` (or higher) for BigInt literal syntax (`0n`, `1n`, etc.) to compile.

**Why:** Without an explicit target, TypeScript defaults to ES3/ES5 which predate BigInt. Even though Vite uses esbuild (which handles BigInt natively and ignores the TypeScript target setting), `tsc --noEmit` type checks against the target and reports TS2737 errors for every BigInt literal.

**How to apply:** Any file using `BigInt` literals (the `n` suffix, e.g. `2n ** 127n - 1n`) requires the tsconfig change. After changing tsconfig.json, the incremental build cache becomes stale — TypeScript won't re-read settings until the cache is cleared:
```bash
rm -f node_modules/typescript/tsbuildinfo
npx tsc --noEmit
```

## Current tsconfig.json state
- `"target": "ES2020"` — added alongside existing `"module": "ESNext"`, `"lib": ["esnext", "dom", "dom.iterable"]`
- The `lib` array already had `esnext` so BigInt types were always available; only the syntax target was missing
