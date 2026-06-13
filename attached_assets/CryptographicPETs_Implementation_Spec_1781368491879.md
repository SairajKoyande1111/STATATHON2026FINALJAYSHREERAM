# Cryptographic Privacy-Enhancing Technologies (PETs) — Complete Implementation Specification
### Statathon 2025 | MoE Innovation Cell | AIRAVATA Technologies

---

## 0. Overview & Scope

The **Cryptographic PETs** tab exposes two cryptographic privacy protocols:

| # | Protocol | Cryptographic Model | Best For |
|---|----------|-------------------|----------|
| 1 | **Homomorphic Encryption (HE)** | Paillier Additive HE | Compute aggregate statistics on encrypted data without decryption |
| 2 | **Secure Multi-Party Computation (SMPC)** | Additive Secret Sharing (Shamir) | Split data across k parties; reconstruct only with t-of-k shares |

**Note:** Both protocols are implemented as **educational simulations** — they demonstrate exact cryptographic mathematics on the dataset and produce real cryptographically-valid outputs, but run in a single-node simulation context (no distributed network). This is explicitly communicated in the UI via the orange "Educational Simulation" banner.

---

## 1. TARGET COLUMNS — DECISION

### Verdict: KEEP but rename and restrict scope

**Cryptographic PETs work on numeric columns only.** The Target Columns panel should remain but with the following changes:

- **Rename** "Target Columns" → **"Columns to Encrypt / Share"**
- **Auto-filter**: only show numeric (int/float) columns in the list — categorical columns cannot be encrypted via Paillier or secret-shared as integers without encoding.
- **Default**: All numeric columns selected.
- **Tooltip**: "Select which columns to apply the cryptographic protocol to. Categorical columns are excluded."

**Why keep it:** Unlike SDG (which needs all columns for coherent record generation), cryptographic PETs are column-wise operations. A user might want to encrypt only sensitive numeric columns (e.g., income, household size) while leaving identifiers out of scope.

---

## 2. PROTOCOL 1 — HOMOMORPHIC ENCRYPTION (Paillier)

### 2.1 Conceptual Goal

Encrypt every selected numeric value in the dataset such that:
- An analyst can compute **sums, means, and dot products** directly on ciphertexts.
- The **plaintext is never revealed** to the analyst.
- Only the key holder can decrypt the final aggregated result.
- The mathematical property: `E(m₁) · E(m₂) ≡ E(m₁ + m₂) (mod n²)`

---

### 2.2 Paillier Cryptosystem — Full Mathematics

#### 2.2.1 Key Generation

```
1. Choose two large distinct primes p, q:
     |p| = |q| = key_size / 2   bits
     (key_size ∈ {512, 1024, 2048})

2. Compute:
     n   = p × q                         ← RSA modulus
     λ   = lcm(p−1, q−1)                ← Carmichael's totient
           = (p−1)(q−1) / gcd(p−1, q−1)
     n²  = n × n

3. Choose generator:
     g   = n + 1                         ← standard choice for Paillier
     (avoids needing random g search; provably valid)

4. Compute:
     L(x) = (x − 1) / n                 ← L-function (integer division)
     μ    = L(g^λ mod n²)^(−1) mod n    ← modular inverse
           = λ^(−1) mod n               ← since g = n+1

5. Public key:  pk = (n, g)
   Private key: sk = (λ, μ)
```

#### 2.2.2 Encryption

For plaintext integer `m ∈ {0, 1, …, n−1}`:

```
1. Choose random r ∈ Z*_n  (i.e., gcd(r, n) = 1)
2. Ciphertext:
     c = g^m · r^n  mod n²
       = (n+1)^m · r^n  mod n²

Expanded using binomial theorem:
     (n+1)^m = 1 + mn  (mod n²)         ← key mathematical simplification
Therefore:
     c = (1 + mn) · r^n  mod n²
```

**Randomness r ensures semantic security** — same plaintext encrypted twice gives different ciphertexts.

**Encoding real values to integers:**
```
For float value v in column j:
  scale_j = 10^(decimal_places_j)     ← e.g., 2 decimal places → scale = 100
  m = round(v × scale_j)              ← integer plaintext
  m = m mod n                         ← ensure m ∈ [0, n)

  Note negative values: if v < 0, m = n + round(v × scale_j)  (mod n arithmetic)
```

#### 2.2.3 Decryption

```
Given ciphertext c, private key (λ, μ):

1. x = c^λ  mod n²
2. Apply L-function: L(x) = (x − 1) / n
3. Plaintext: m = L(x) · μ  mod n

Recover float: v = m / scale_j   (if m < n/2, else v = (m − n) / scale_j for negatives)
```

**Proof of correctness:**
```
c^λ = (g^m · r^n)^λ  mod n²
    = g^(mλ) · r^(nλ)  mod n²
    = (1 + mn)^λ · (r^λ)^n  mod n²

By Carmichael's theorem: r^λ ≡ 1 (mod n)  →  r^(nλ) ≡ 1 (mod n²)
And: (1 + mn)^λ ≡ 1 + mnλ  (mod n²)

Therefore: L(c^λ mod n²) = mλ  mod n
           m = mλ · λ^(−1) = mλ · μ  mod n  ✓
```

#### 2.2.4 Homomorphic Addition

```
Given E(m₁) = c₁,  E(m₂) = c₂:

E(m₁ + m₂) = c₁ · c₂  mod n²

Proof:
  c₁ · c₂ = g^m₁ · r₁^n · g^m₂ · r₂^n  mod n²
           = g^(m₁+m₂) · (r₁r₂)^n  mod n²
           = E(m₁ + m₂)  with randomness r₁r₂  ✓
```

#### 2.2.5 Homomorphic Scalar Multiplication

```
Given E(m), scalar k:

E(k·m) = c^k  mod n²

This allows computing weighted sums on encrypted data.
```

---

### 2.3 Statistical Aggregations on Encrypted Data

The system computes the following **without ever decrypting individual values**:

#### Encrypted Sum
```
For column j, records {c₁, c₂, …, cₙ}:
  E(Σ mᵢ) = c₁ · c₂ · … · cₙ  mod n²   ← n-1 multiplications
  Σ mᵢ = Decrypt(E(Σ mᵢ)) / scale_j
```

#### Encrypted Mean
```
E(Σ mᵢ) computed as above
mean_j = Decrypt(E(Σ mᵢ)) / (n × scale_j)
```

#### Encrypted Variance (via Sum of Squares)
```
E(mᵢ²) = cᵢ^mᵢ  mod n²   ← HE scalar mult  [requires knowing mᵢ at encryption time]

Alternative (simulation context):
  Compute Σ mᵢ² and Σ mᵢ in encrypted domain
  Var = (Σ mᵢ²)/n − (Σ mᵢ / n)²

Note: True HE variance requires two-level homomorphism (BGV/BFV).
In Paillier (additive-only), we compute on encoded squares during encryption.
```

---

### 2.4 Full Algorithm (Pseudocode)

```
ALGORITHM: PaillierHE(X, target_cols, key_size)

INPUT:
  X            ← dataset (n × d)
  target_cols  ← list of numeric column indices to encrypt
  key_size     ← {512, 1024, 2048}

OUTPUT:
  results      ← {column → {encrypted_values, decrypted_sum, decrypted_mean}}
  report       ← HTML/CSV report

--- KEY GENERATION ---
1. p, q = generate_safe_primes(key_size // 2)
2. n = p × q;  n² = n × n
3. λ = lcm(p−1, q−1)
4. g = n + 1
5. μ = modular_inverse(λ, n)
6. pk = (n, g);  sk = (λ, μ)

--- ENCODING ---
7. For each col j in target_cols:
     scale_j = 10 ^ infer_decimal_places(X[:,j])
     M[:,j]  = round(X[:,j] × scale_j).astype(int)  mod n

--- ENCRYPTION ---
8. C = {}
   For each col j in target_cols:
     C[j] = []
     For each record i:
       r = random_coprime(n)
       cᵢⱼ = ((1 + M[i,j] × n) × pow(r, n, n²)) mod n²
       C[j].append(cᵢⱼ)

--- HOMOMORPHIC AGGREGATION ---
9. For each col j in target_cols:
     enc_sum[j] = C[j][0]
     For i in 1..n-1:
       enc_sum[j] = (enc_sum[j] × C[j][i]) mod n²

--- DECRYPTION OF AGGREGATE ONLY ---
10. For each col j in target_cols:
      x     = pow(enc_sum[j], λ, n²)
      Lx    = (x − 1) // n
      m_sum = (Lx × μ) mod n
      if m_sum > n // 2:  m_sum = m_sum − n   ← handle negatives
      dec_sum[j]  = m_sum / scale_j
      dec_mean[j] = dec_sum[j] / n

--- OUTPUT ---
11. For each col j:
      Display: original values (first 5), their ciphertexts (hex), decrypted aggregate
      Verify: dec_sum[j] ≈ numpy.sum(X[:,j])   ← correctness check

12. Generate report
13. Return results
```

---

### 2.5 Sidebar Parameters (Paillier HE)

| Parameter | Type | Default | Options | Description |
|-----------|------|---------|---------|-------------|
| Key Size | Radio | 1024-bit | 512 / 1024 / 2048 | Larger = stronger security, slower |
| Aggregations | Multi-checkbox | Sum, Mean | Sum / Mean / Count | Which encrypted stats to compute |
| Show Ciphertext Preview | Toggle | ON | — | Show first 3 ciphertexts in hex |
| Decimal Precision | Number | auto | 0–6 | Manual override for scale factor |

---

### 2.6 Sidebar Metrics Panel (Paillier HE)

Display these after "Apply Technique":

**Security Metrics:**
| Metric | Value | Description |
|--------|-------|-------------|
| Key Size | 1024-bit | RSA modulus bit length |
| n (modulus) | [hex, truncated] | Public modulus n |
| Security Level | ~80 bits (512) / ~112 bits (1024) / ~128 bits (2048) | NIST equivalence |
| Semantic Security | ✓ Decisional Composite Residuosity | Hardness assumption |
| Columns Encrypted | k | Count of selected numeric cols |
| Records Encrypted | n | Total ciphertexts generated |
| Total Ciphertexts | n × k | |
| Ciphertext Expansion | ~×2 | Ciphertext size vs plaintext |

**Computation Metrics:**
| Metric | Value | Description |
|--------|-------|-------------|
| Encryption Time (s) | — | Wall clock for all encryptions |
| Aggregation Time (s) | — | Homomorphic mult time |
| Decryption Time (s) | — | Aggregate decryption |
| Aggregate Verification | PASS / FAIL | |Decrypted sum − plaintext sum| < 1e-6 |

**Per-Column Results Panel:**
| Column | Plaintext Sum | HE-Computed Sum | Plaintext Mean | HE-Computed Mean | Error |
|--------|--------------|----------------|---------------|-----------------|-------|
| HH_Size | 87.0 | 87.0 | 4.35 | 4.35 | 0.000 |
| … | … | … | … | … | … |

---

## 3. PROTOCOL 2 — SECURE MULTI-PARTY COMPUTATION (Shamir Secret Sharing)

### 3.1 Conceptual Goal

Split every selected numeric value into **k additive shares** over a prime field ℤ_p such that:
- Any **t shares** can **reconstruct** the original value (t-of-k threshold).
- Any **t−1 or fewer shares reveal zero information** about the original value (information-theoretic security).
- Statistical aggregations (sum, mean) can be computed **party-locally** and then combined.

---

### 3.2 Shamir Secret Sharing — Full Mathematics

#### 3.2.1 Setup

```
Choose prime P > max(|values|) × scale × n    ← prime field modulus
  (ensures all values fit in Z_P)

Standard choice: P = 2^127 − 1  (Mersenne prime, 127-bit)
  or smallest prime > max_encoded_value × safety_factor

Parameters:
  k = total shares (number of parties)
  t = reconstruction threshold  (2 ≤ t ≤ k)
```

#### 3.2.2 Share Generation (Dealer Phase)

For secret integer `s ∈ Z_P`:

```
1. Choose random polynomial f of degree (t−1):
     f(x) = s + a₁x + a₂x² + … + a_{t-1}x^{t-1}  (mod P)

   where a₁, …, a_{t-1} ~ Uniform(Z_P) are random coefficients
   Note: f(0) = s  ← the secret is the constant term

2. Compute k shares:
     sᵢ = f(i)  mod P   for i = 1, 2, …, k

3. Distribute: Party i receives share sᵢ
```

**Security:** Any t−1 points on a degree-(t−1) polynomial reveal nothing about f(0) = s. By Lagrange interpolation, exactly t points uniquely determine f.

#### 3.2.3 Secret Reconstruction (Lagrange Interpolation)

Given any t shares {(i₁, s_{i₁}), …, (iₜ, s_{iₜ})}:

```
f(0) = Σ_{j=1}^{t} s_{iⱼ} × L_j(0)  (mod P)

Lagrange basis polynomial evaluated at 0:
  L_j(0) = Π_{m≠j} (0 − iₘ) / (iⱼ − iₘ)  (mod P)
          = Π_{m≠j} (−iₘ) × modular_inverse(iⱼ − iₘ, P)  (mod P)

Secret recovered: s = f(0) mod P
```

#### 3.2.4 Additive Secret Sharing (Simplified Variant, t=k)

For the case t = k (all shares needed), a simpler additive scheme:

```
Split s into k shares:
  s₁, s₂, …, s_{k-1} ~ Uniform(Z_P)    ← random
  s_k = (s − s₁ − s₂ − … − s_{k-1}) mod P   ← last share computed

Reconstruct: s = (s₁ + s₂ + … + s_k) mod P

Verification: Σ sᵢ = s (mod P)
```

The system uses **Shamir** (general t-of-k) by default but falls back to additive when t=k for speed.

#### 3.2.5 Secure Aggregation (Sum Computation)

Each party i holds shares of all n values in column j: `{s_{i,1,j}, s_{i,2,j}, …, s_{i,n,j}}`

```
Local sum at party i:
  local_sum_i = Σ_{r=1}^{n} s_{i,r,j}  mod P    ← party computes on its own shares only

Global reconstruction:
  enc_total = Lagrange_reconstruct({local_sum_i : i in 1..t})  mod P
  actual_sum = enc_total / scale_j   ← decode

Proof of correctness:
  Σᵢ local_sum_i = Σᵢ Σᵣ s_{i,r,j}
                 = Σᵣ Σᵢ s_{i,r,j}
                 = Σᵣ secret_r,j           ← sum of secrets  ✓
```

This means parties **never send raw values** — only their partial sums.

---

### 3.3 Full Algorithm (Pseudocode)

```
ALGORITHM: ShамирSMPC(X, target_cols, k, t)

INPUT:
  X            ← dataset (n × d)
  target_cols  ← list of numeric column indices
  k            ← number of shares (parties)
  t            ← reconstruction threshold (t ≤ k)

OUTPUT:
  shares       ← {party_i → {col_j → [share values]}}
  aggregates   ← {col_j → {sum, mean}} computed via SMPC
  report       ← HTML/CSV

--- SETUP ---
1. P = next_prime(max(|encoded_values|) × 10)
   P should be > max(abs(X[:,j] × scale_j)) × n × k   for safety
   Use P = 2^127 − 1 if data fits

2. For each col j in target_cols:
     scale_j = 10 ^ infer_decimal_places(X[:,j])
     M[:,j]  = round(X[:,j] × scale_j).astype(int)    ← encoded integers

--- SHAMIR SHARE GENERATION ---
3. shares = {i: {j: [] for j in target_cols} for i in 1..k}

4. For each col j in target_cols:
     For each record r in 1..n:
       s = M[r, j] mod P
       
       # Generate random polynomial of degree t-1
       coeffs = [s] + [random.randint(0, P-1) for _ in range(t-1)]
       # f(x) = coeffs[0] + coeffs[1]×x + … + coeffs[t-1]×x^(t-1)
       
       For each party i in 1..k:
         share_val = Σ_{d=0}^{t-1} coeffs[d] × pow(i, d, P)  mod P
         shares[i][j].append(share_val)

--- SIMULATED MPC AGGREGATION ---
5. For each col j in target_cols:
     
     # Each party computes local partial sum
     local_sums = {}
     For each party i in 1..k:
       local_sums[i] = sum(shares[i][j]) mod P
     
     # Collect t parties' local sums (simulating communication round)
     # Use first t parties
     points = [(i, local_sums[i]) for i in 1..t]
     
     # Reconstruct via Lagrange interpolation
     enc_total = lagrange_at_zero(points, P)
     
     # Decode
     if enc_total > P // 2:  enc_total = enc_total − P   # handle negatives
     aggregates[j]['sum']  = enc_total / scale_j
     aggregates[j]['mean'] = (enc_total / scale_j) / n

--- LAGRANGE INTERPOLATION (subroutine) ---
lagrange_at_zero(points, P):
  result = 0
  for j, (xⱼ, yⱼ) in enumerate(points):
    num = 1;  den = 1
    for m, (xₘ, _) in enumerate(points):
      if m != j:
        num = (num × (−xₘ)) mod P
        den = (den × (xⱼ − xₘ)) mod P
    Lⱼ = (num × modular_inverse(den, P)) mod P
    result = (result + yⱼ × Lⱼ) mod P
  return result

--- VERIFICATION ---
6. For each col j:
     plaintext_sum = numpy.sum(X[:,j])
     smpc_sum      = aggregates[j]['sum']
     error         = abs(smpc_sum − plaintext_sum)
     assert error < 1e-6  ← correctness verification

--- OUTPUT ---
7. For each party i:
     Export share table: Party_i_shares.csv  ← rows=records, cols=target columns
8. Generate HTML report
9. Return shares, aggregates
```

---

### 3.4 Security Properties

| Property | Value |
|----------|-------|
| Security model | Information-theoretic (unconditional) |
| Adversary tolerance | t−1 corrupted parties learn ZERO information |
| Hardness assumption | None — purely combinatorial |
| Reconstruction | Requires exactly t shares |
| Share size | Same as secret size (mod P) |
| Prime field | ℤ_P, P = 2^127 − 1 (default) |

**Information-theoretic proof sketch:**
For any set of t−1 shares and any two candidate secrets s, s':
```
Pr[observe these t−1 shares | secret = s]  =  Pr[observe these t−1 shares | secret = s']
```
Because for any t−1 points there exists a polynomial of degree t−1 passing through them with any desired f(0). The distribution of t−1 shares is uniform over ℤ_P^(t−1) regardless of s.

---

### 3.5 Sidebar Parameters (SMPC)

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| Number of Shares (k) | Slider | 3 | 2–10 | Total parties |
| Reconstruction Threshold (t) | Slider | 2 | 2–k | Minimum shares to reconstruct |
| Prime Field P | Dropdown | 2^127−1 | Auto / 2^61−1 / 2^127−1 / custom | Finite field modulus |
| Show Share Preview | Toggle | ON | — | Display first 3 share values per column |
| Export Share Files | Toggle | OFF | — | Download each party's shares as separate CSV |

**Constraint enforced in UI:** t ≤ k always; t ≥ 2 always.

---

### 3.6 Sidebar Metrics Panel (SMPC)

**Security Metrics:**
| Metric | Value | Description |
|--------|-------|-------------|
| Total Shares (k) | 3 | Parties |
| Threshold (t) | 2 | Minimum for reconstruction |
| Security Level | Information-theoretic | No computational assumption needed |
| Corruption Tolerance | t−1 = 1 | How many corrupt parties are tolerated |
| Prime P | 2^127 − 1 | Field modulus |
| Bit Length of P | 127 bits | |
| Privacy Guarantee | Perfect — t−1 shares reveal nothing | |

**Computation Metrics:**
| Metric | Value | Description |
|--------|-------|-------------|
| Total Shares Generated | n × d_selected × k | |
| Share Generation Time (s) | — | |
| MPC Aggregation Time (s) | — | Simulated communication rounds |
| Reconstruction Time (s) | — | Lagrange interpolation |

**Aggregate Verification Panel:**
| Column | Plaintext Sum | SMPC Sum | Plaintext Mean | SMPC Mean | Error |
|--------|--------------|----------|---------------|-----------|-------|
| HH_Size | 87.0 | 87.0 | 4.35 | 4.35 | 0.000 |

**Party Share Summary:**
| Party | Columns Covered | Share Size (bytes) | Received Shares |
|-------|-----------------|--------------------|----------------|
| Party 1 | k cols | n × 16 bytes | n × k |
| Party 2 | k cols | n × 16 bytes | n × k |
| … | | | |

---

## 4. OUTPUT REPORT STRUCTURE (Both Protocols)

### 4.1 Download CSV
For **Paillier HE**: Export ciphertext values (hex) per column as a CSV — one row per record, one column per encrypted column, plus decrypted aggregate rows at the bottom.

For **SMPC**: Export one CSV per party (Party_1_shares.csv, Party_2_shares.csv, …) containing that party's shares for all selected columns.

### 4.2 Download HTML Report

```
CRYPTOGRAPHIC PETs REPORT
==========================

Section 1: Configuration
  - Protocol selected, dataset, key parameters, columns processed

Section 2: Cryptographic Protocol Summary
  [HE]   - Key size, security level, homomorphic property demonstrated
  [SMPC] - k, t, prime P, security model

Section 3: Correctness Verification
  Table: Column | True Sum | Protocol-Computed Sum | True Mean | Protocol Mean | Error
  Status badge: ✓ ALL PASS or ✗ FAILED columns listed

Section 4: Per-Column Ciphertext / Share Preview
  [HE]   - First 3 ciphertexts per column (truncated hex), modulus size
  [SMPC] - First 3 shares per party per column (decimal or hex)

Section 5: Security Analysis
  [HE]   - Semantic security argument, key hardness assumption, ciphertext expansion ratio
  [SMPC] - Information-theoretic security argument, adversary model, corruption bound

Section 6: Performance Metrics
  - Key generation time, encryption/sharing time, computation time, decryption/reconstruction time

Section 7: Aggregated Statistics (Encrypted Computation Results)
  - Table of computed sums and means per column

Section 8: Mathematical Summary
  [HE]   - Paillier equations rendered
  [SMPC] - Shamir polynomial + Lagrange equations rendered

Section 9: Recommendations & Limitations
  [HE]   - "Paillier supports only addition on encrypted data. For multiplication, consider BFV/BGV (future work)."
  [SMPC] - "Full MPC requires a secure communication channel between parties. This simulation assumes an honest dealer."
```

---

## 5. EDUCATIONAL SIMULATION BANNER — CONTENT

Keep the amber "Educational Simulation" banner. Suggested text updates:

**For Paillier HE:**
> "This simulation demonstrates real Paillier homomorphic encryption mathematics on your dataset. All ciphertexts are cryptographically valid. In production, key generation and decryption would occur on separate air-gapped systems."

**For SMPC:**
> "This simulation demonstrates Shamir's Secret Sharing with real modular arithmetic. In production, each party would receive their shares over a secure channel and never see other parties' shares or the original data."

---

## 6. TECH STACK RECOMMENDATIONS

| Component | Library |
|-----------|---------|
| Paillier HE | `python-paillier` (`phe`) or pure Python implementation |
| Large integer arithmetic | Python built-in `int` (arbitrary precision) |
| Modular inverse | `pow(a, -1, P)` (Python 3.8+) |
| Prime generation | `sympy.isprime`, `sympy.nextprime` |
| Shamir Secret Sharing | Pure Python (simple enough to implement directly) |
| Random field elements | `secrets.randbelow(P)` |
| HTML Report | Jinja2 + inline MathJax for equations |

---

## 7. IMPLEMENTATION ORDER

```
Priority 1 — Paillier HE:
  [x] Key generation (safe prime generation for p, q)
  [x] Encoding: float → integer with scale
  [x] Encryption: c = (1 + mn) × r^n mod n²
  [x] Homomorphic aggregation: product of ciphertexts
  [x] Decryption of aggregate
  [x] Correctness verification
  [x] Sidebar metrics panel
  [x] HTML + CSV report

Priority 2 — SMPC (Shamir):
  [x] Prime field setup
  [x] Polynomial generation (degree t-1, random coefficients)
  [x] Share generation: f(i) mod P for i = 1..k
  [x] Local sum computation per party
  [x] Lagrange interpolation at x=0
  [x] Correctness verification
  [x] Sidebar metrics panel
  [x] HTML + per-party CSV report

Priority 3 — UI:
  [x] Rename "Target Columns" → "Columns to Encrypt / Share"
  [x] Filter to numeric columns only
  [x] Educational simulation banner (updated text)
  [x] Live t ≤ k enforcement for SMPC sliders
  [x] Security level badge next to key size selector
```

---

*Document Version: 1.0 | Statathon 2025 | AIRAVATA Technologies | MoE Innovation Cell*
