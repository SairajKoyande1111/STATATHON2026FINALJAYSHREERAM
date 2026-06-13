---
name: Crypto PETs Module Spec
description: Paillier HE + Shamir SMPC implementation details for crypto.ts
---

## Paillier Homomorphic Encryption (crypto.ts)
- Key gen: choose random safe primes p, q; n=p×q; λ=lcm(p-1,q-1); g=n+1 (simplification); μ=λ⁻¹ mod n
- Encrypt: c = (1+mn) · r^n mod n² (using g=n+1 trick to avoid full g^m mod n²)
- Decrypt: m = L(c^λ mod n²) · μ mod n, where L(x)=(x-1)/n
- Homomorphic add: E(m1)·E(m2) mod n² = E(m1+m2)
- Float encoding: PAILLIER_SCALE=1000n; negative via two's complement in Z_n
- Key size → prime bits: 512→20, 1024→26, 2048→32 (browser speed; labeled as spec sizes)
- Primality: Miller-Rabin with deterministic witnesses [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n]

## Shamir SMPC (crypto.ts)
- P = 2^127 - 1 (Mersenne prime for mod arithmetic)
- SHAMIR_SCALE = 1000n for float encoding
- Polynomial: f(x) = s + a₁x + ... + a_{t-1}x^{t-1} mod P (t-1 random coefficients)
- Reconstruction: Lagrange interpolation at x=0 from any t shares
- Homomorphic sum: sum of shares from each party = share of sum

## Signatures
- `applyHomomorphicEncryption(data, targetCols, keySize)` → PrivacyResult
- `applySMPC(data, targetCols, numShares, threshold)` → PrivacyResult
- Both take only numeric targetCols (filtered in privacy-page)

## Target Column Handling
- Left panel label: "Columns to Encrypt / Share" (amber border)
- Filtered to numeric non-DIRECT_ID columns only (numericCols)
- showTC_other = family === "crypto" (crypto tab shows target cols; federated does NOT)

## Reports
- 8-section HTML compliance report for HE; 9-section for SMPC
- Includes key parameters, sample ciphertext, homomorphic verification

## BigInt Requirement
- All BigInt literals (e.g. 0n, 1n, 1000n) require TypeScript target ES2020
- tsconfig.json must have "target": "ES2020" — added in this session
- Vite/esbuild transpiles BigInt fine regardless; the tsc check was the blocker
