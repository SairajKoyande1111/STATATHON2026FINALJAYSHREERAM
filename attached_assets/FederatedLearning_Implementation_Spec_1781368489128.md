# Federated Learning (FedAvg + DP-FedAvg) — Complete Implementation Specification
### Statathon 2025 | MoE Innovation Cell | AIRAVATA Technologies

---

## 0. Overview & Scope

The **Federated Learning** tab implements a **simulated federated training loop** on the uploaded dataset. The dataset is partitioned into K shards (simulating K distributed clients/nodes). A central model is trained through T rounds of:
1. Local model training on each shard
2. Gradient/weight aggregation at the server (FedAvg)
3. Optional DP-FedAvg: Gaussian noise injected into aggregation for (ε, δ)-DP

The output is a **trained model** that can generate synthetic data (or produce privacy-preserved statistics), never having seen the full dataset in one place.

**Protocol offered:** FedAvg / DP-FedAvg (single protocol, DP is a toggle)

---

## 1. TARGET COLUMNS — DECISION

### Verdict: REMOVE Target Columns panel for Federated Learning tab

**Reasoning:**
- Federated Learning trains a model on the **full dataset schema** (all columns jointly) — it cannot selectively federate individual columns.
- The model architecture depends on the full input dimension.
- Column selection is meaningless here because gradients are computed over all features simultaneously.

**Replace with:** A read-only "Dataset Summary" panel in the sidebar showing total columns, rows, and how the dataset is partitioned (n/K records per node).

---

## 2. FEDERATED AVERAGING (FedAvg) — Full Mathematics

### 2.1 Conceptual Goal

Train a shared global model W without any client sending raw data to the server. Each client:
- Receives the current global model weights W_t
- Trains locally for E epochs on its local shard
- Sends **only the updated weights W_k,t** (not the data) to the server

The server aggregates via weighted average.

### 2.2 Problem Setup

```
Dataset X (n × d) partitioned into K shards:
  X₁, X₂, …, X_K    where |X_k| = n_k,   Σ_k n_k = n

Global objective:
  min_W  F(W) = Σ_k (n_k/n) × F_k(W)

where:
  F_k(W) = (1/n_k) Σ_{x∈X_k} ℓ(W; x)    ← local loss on shard k
  ℓ(W; x) = loss function (cross-entropy for classification, MSE for regression/autoencoder)
```

### 2.3 Model Architecture (Tabular Autoencoder)

Since the goal is **privacy-preserved data representation and synthetic generation**, we use a tabular autoencoder:

```
Encoder:
  Input: x ∈ ℝ^d_enc   (encoded/normalized features, same as CTGAN transformer)
  Layer 1: Linear(d_enc, 128) → BatchNorm → ReLU
  Layer 2: Linear(128, 64)    → BatchNorm → ReLU
  Latent:  Linear(64, z_dim)  → z ∈ ℝ^z_dim,  z_dim = 32

Decoder:
  Layer 1: Linear(z_dim, 64)  → BatchNorm → ReLU
  Layer 2: Linear(64, 128)    → BatchNorm → ReLU
  Output:  Linear(128, d_enc) → column-specific activations (same as SDG)

Total parameters: ~d_enc×128 + 128×64 + 64×z_dim + z_dim×64 + 64×128 + 128×d_enc
```

Reconstruction loss:
```
ℓ(W; x) = Σ_j w_j × loss_j(x̂_j, x_j)

For continuous col j:  loss_j = (x̂_j − x_j)²            ← MSE
For categorical col j: loss_j = CrossEntropy(x̂_j, x_j)  ← one-hot target
w_j = 1.0 (uniform) or user-defined column importance weight
```

---

### 2.4 FedAvg Algorithm (McMahan et al., 2017)

#### Round t (t = 1, …, T):

**Step 1: Server Broadcasts Global Model**
```
For each client k in 1..K:
  W_k,t ← W_t     ← copy current global weights to client k
```

**Step 2: Local Training (at each client k)**
```
Initialize: w_k ← W_t

For epoch e in 1..E:
  For mini-batch B ⊂ X_k:
    grad = ∇_w ℓ(w_k; B)
    w_k ← w_k − η × grad      ← SGD step (or Adam)

Local update: ΔW_k,t = w_k − W_t    ← gradient direction
```

**Step 3: Clients Send Updates to Server**
```
Server receives: {W_{k,t} : k = 1..K}     ← updated local weights
(Only weights are transmitted, never raw data X_k)
```

**Step 4: FedAvg Aggregation**
```
W_{t+1} = Σ_k (n_k / n) × W_{k,t}

Equivalently in terms of updates:
W_{t+1} = W_t + Σ_k (n_k / n) × ΔW_{k,t}
```

**Convergence Condition:**
```
Stop if:
  ‖W_{t+1} − W_t‖_F / ‖W_t‖_F < τ   (relative weight change < threshold τ = 1e-4)
OR
  t = T   (max rounds reached)
```

**Full FedAvg Pseudocode:**
```
ALGORITHM: FedAvg(X, K, T, E, η, batch_size)

INPUT:
  X          ← full dataset (n × d)
  K          ← number of federated nodes
  T          ← communication rounds
  E          ← local epochs per round
  η          ← local learning rate
  batch_size ← local mini-batch size

OUTPUT:
  W*         ← trained global model weights
  history    ← {round → {global_loss, per_client_loss, weight_norm}}

--- INITIALIZATION ---
1. Partition X into K shards: {X₁, …, X_K}
     n_k = ⌊n/K⌋  for k < K;  n_K = n − (K−1)⌊n/K⌋  (remainder to last)
     Strategy: random shuffle then split (IID partition)

2. Initialize global model: W₁ ~ N(0, 0.01²)  (Xavier initialization)

3. DataTransformer T_enc.fit(X)  ← encode full dataset schema
   For each shard k: X_k_enc = T_enc.transform(X_k)

--- FEDERATED LOOP ---
4. For round t in 1..T:

     client_weights = []
     client_losses  = []

     For each client k in 1..K:
       [LOCAL TRAINING]
       w_k = copy(W_t)           ← broadcast global model
       local_loader = DataLoader(X_k_enc, batch_size, shuffle=True)

       For epoch e in 1..E:
         epoch_loss = 0
         For batch B in local_loader:
           ℓ_batch = reconstruction_loss(w_k, B)
           grad    = backprop(ℓ_batch, w_k)
           w_k     ← w_k − η × grad          ← local SGD step
           epoch_loss += ℓ_batch × |B|
         epoch_loss /= n_k

       client_weights.append((n_k, w_k))
       client_losses.append(epoch_loss)

     [FEDAVG AGGREGATION]
     W_{t+1} = Σ_k (n_k/n) × client_weights[k].weights

     history[t] = {
       'global_loss':      Σ_k (n_k/n) × client_losses[k],
       'per_client_loss':  client_losses,
       'weight_change':    ‖W_{t+1} − W_t‖_F
     }

     [CONVERGENCE CHECK]
     If ‖W_{t+1} − W_t‖_F / ‖W_t‖_F < 1e-4:
       break

5. W* = W_T

--- SYNTHETIC GENERATION (if enabled) ---
6. If generate_synthetic:
     For i in 1..n_syn:
       z_i ~ N(0, I_{z_dim})
       x̃_i = Decoder(W*.decoder, z_i)
     X̃ = T_enc.inverse_transform([x̃₁, …, x̃_{n_syn}])
     Return X̃

7. Return W*, history
```

---

## 3. DP-FedAvg — Differentially Private Federated Averaging

### 3.1 Conceptual Goal

Extend FedAvg so that the **aggregated model satisfies (ε, δ)-DP** with respect to any single client's dataset. An adversary who sees the global model W* learns negligibly about any individual shard X_k.

### 3.2 Privacy Model — Client-Level DP

We protect at the **client (shard) level**: the mechanism output (W*) should be (ε, δ)-DP with respect to adding or removing one client's entire shard.

This is different from record-level DP (DP-SGD) — here we add noise to the **aggregated weight update** at the server, not to individual gradients.

### 3.3 DP-FedAvg Algorithm (Geyer et al., 2017; McMahan et al., 2018)

Modify Step 4 of FedAvg as follows:

**Step 4a: Client Weight Clipping**
```
For each client k:
  ΔW_k = W_{k,t} − W_t           ← weight update (gradient direction)
  ΔW̃_k = ΔW_k / max(1, ‖ΔW_k‖_F / C)    ← clip to L2 norm C

This bounds sensitivity: max_k ‖ΔW̃_k‖_F ≤ C
```

**Step 4b: Noisy Aggregation**
```
W_{t+1} = W_t + (1/K) × [Σ_k ΔW̃_k + N(0, σ²C²I)]

where:
  σ = noise multiplier (calibrated from ε, δ, T, K)
  I = identity matrix of same dimension as W (applied element-wise)
  N(0, σ²C²I) is a Gaussian noise matrix of same shape as W
```

**Note:** We use uniform (1/K) weighting instead of (n_k/n) when DP is enabled, because weighted aggregation would reveal information about shard sizes.

### 3.4 Privacy Accounting for DP-FedAvg

Using the **Gaussian Mechanism** with composition over T rounds:

**Sensitivity of one aggregation step:**
```
Δf = C / K    ← after dividing clipped updates by K
```

**Gaussian mechanism per round (ε_round, δ_round):**
```
σ_noise = σ × C / K    ← actual noise standard deviation

For one round: ε_round(δ) ≈ √(2 ln(1.25/δ)) × (C/K) / σ_noise
                           = √(2 ln(1.25/δ)) / σ
```

**Composition over T rounds (Advanced Composition):**
```
ε_total(δ') ≤ √(2T ln(1/δ')) × ε_round + T × ε_round × (e^ε_round − 1)

Simplified (for small ε_round):
ε_total ≈ √(2T) × ε_round = √(2T) × √(2 ln(1.25/δ)) / σ
```

**RDP Accountant (tighter bound):**
```
RDP per round at order α:
  RDP_round(α) = α / (2σ²)    (Gaussian mechanism)

Total RDP over T rounds:
  RDP_total(α) = T × RDP_round(α) = T × α / (2σ²)

Convert to (ε, δ)-DP:
  ε(δ) = min_{α>1} [RDP_total(α) + log(1/δ)/(α−1)]
```

**Calibrating σ from ε:**
```
Binary search: find σ ∈ [0.01, 100] such that
  ε_accountant(σ, T, K, δ) = ε_target
```

### 3.5 Full DP-FedAvg Pseudocode

```
ALGORITHM: DP_FedAvg(X, K, T, E, η, batch_size, ε, δ, C)

[All steps same as FedAvg except Step 4 replaced below]

--- SETUP ADDITIONS ---
2b. Calibrate σ:
      σ = binary_search(ε, δ, C, T, K)
      Display: "Required noise multiplier σ = {σ:.4f}"

--- MODIFIED ROUND t ---
For round t in 1..T:

  [LOCAL TRAINING — same as FedAvg]
  For each client k in 1..K:
    Train w_k locally for E epochs
    ΔW_k = w_k − W_t

  [CLIPPING]
  For each client k in 1..K:
    norm_k = ‖ΔW_k‖_F
    ΔW̃_k  = ΔW_k / max(1, norm_k / C)

  [NOISY AGGREGATION — SERVER SIDE]
  agg_update = (1/K) × Σ_k ΔW̃_k
  noise      = N(0, σ²C²/K² × I)   ← same shape as W
  W_{t+1}   = W_t + agg_update + noise

  history[t]['noise_norm'] = ‖noise‖_F

--- PRIVACY ACCOUNTING ---
After all T rounds:
  ε_actual = RDP_accountant(σ, C, T, K, δ)
  Display: "Actual ε achieved: {ε_actual:.4f}"
```

---

## 4. IID vs NON-IID DATA PARTITION

The partition strategy significantly affects convergence:

```
IID Partition (default):
  Shuffle X randomly → split into K equal shards
  Each shard has similar distribution to the full dataset
  Convergence: fast, few rounds needed

Non-IID Partition (optional):
  Sort X by a categorical column (e.g., State) before splitting
  Each shard has skewed distribution
  Convergence: slower, more rounds needed
  More realistic for real federated scenarios
```

Expose partition strategy as a parameter.

---

## 5. SIDEBAR PARAMETERS

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| Federated Nodes (K) | Slider | 3 | 2–10 | Number of simulated clients |
| Communication Rounds (T) | Slider | 5 | 1–50 | FedAvg aggregation rounds |
| Local Epochs (E) | Number | 3 | 1–20 | Epochs per client per round |
| Local Learning Rate (η) | Number | 1e-3 | 1e-5–1e-1 | Client SGD/Adam learning rate |
| Batch Size | Number | 4 | 2–32 | Local mini-batch (small for tiny datasets) |
| Partition Strategy | Dropdown | IID | IID / Non-IID | Data split strategy |
| Enable DP-FedAvg | Toggle | OFF | — | Add Gaussian noise to aggregation |
| Privacy Budget ε | Slider (DP only) | 2.0 | 0.1–10.0 | Shown only when DP enabled |
| Delta δ (DP only) | Radio | 1×10⁻⁵ | 1e-5/1e-6 | Failure probability |
| Clipping Norm C (DP only) | Slider | 1.0 | 0.1–5.0 | Update norm bound |
| Generate Synthetic Output | Toggle | ON | — | Decode from trained model |
| Synthetic Output Size (%) | Slider | 100 | 10–200 | Shown when Generate ON |
| Random Seed | Number | 42 | — | |

---

## 6. SIDEBAR METRICS PANEL

### 6.1 Training Progress (live-updating during execution)

| Metric | Value | Description |
|--------|-------|-------------|
| Current Round | t / T | Progress |
| Global Loss (current round) | float | Weighted avg reconstruction loss |
| Best Global Loss | float | Minimum loss seen so far |
| Weight Change ‖ΔW‖_F | float | FedAvg convergence indicator |
| Convergence Status | Converged / Training | |

### 6.2 Federated Setup Summary

| Metric | Value | Description |
|--------|-------|-------------|
| Total Records | n | Original dataset size |
| Nodes (K) | K | Simulated clients |
| Records per Node | n/K (approx) | Shard size |
| Partition Strategy | IID / Non-IID | |
| Local Epochs per Round | E | |
| Total Local Training Steps | T × K × ⌈n_k/B⌉ | |
| Model Parameters | count | Total autoencoder params |

### 6.3 Per-Round Loss Table (scrollable)

| Round | Global Loss | Client 1 Loss | Client 2 Loss | … | Weight Change |
|-------|-------------|---------------|---------------|---|---------------|
| 1 | 0.842 | 0.851 | 0.834 | … | — |
| 2 | 0.731 | 0.744 | 0.718 | … | 0.124 |
| … | … | … | … | … | … |

### 6.4 DP-FedAvg Specific Metrics (shown only when DP enabled)

| Metric | Value | Description |
|--------|-------|-------------|
| Target ε | user input | Privacy budget requested |
| Target δ | user input | Failure probability |
| Clipping Norm C | user input | |
| Required σ | computed | Noise multiplier calibrated |
| Actual ε Achieved | computed | From RDP accountant |
| Noise Norm per Round | ‖noise‖_F | Scale of noise injection |
| Privacy-Utility Tradeoff | index 0–1 | 1 = best utility, 0 = maximum noise |

### 6.5 Synthetic Output Quality (if Generate Synthetic enabled)

| Metric | Formula | Description |
|--------|---------|-------------|
| KS Statistic (avg) | avg over columns | Marginal distribution fidelity |
| Wasserstein-1 (avg) | avg over continuous cols | Distribution distance |
| JSD (avg) | avg over all cols | Symmetric divergence |
| Reconstruction Loss on Full X | ℓ(W*, X) | Model fit to original data |
| Distinguishability AUC | RF classifier on real vs syn | 0.5 = indistinguishable |

---

## 7. OUTPUT REPORT STRUCTURE

### 7.1 Download CSV
Synthetic output dataset (if Generate Synthetic is ON) — same format as SDG CSV output.

### 7.2 Download HTML Report

```
FEDERATED LEARNING REPORT
==========================

Section 1: Configuration
  - K nodes, T rounds, E epochs, η, batch size, partition strategy
  - DP settings (if enabled): ε, δ, C, σ

Section 2: Dataset Partition Summary
  Table: Node | Records | Sample Columns Statistics (mean, std)
  Note: In real FL, server never sees this — shown here for educational transparency

Section 3: Training Convergence
  Chart: Global Loss vs. Communication Round (line)
  Chart: Per-Client Loss curves (multi-line, one per client, K lines)
  Chart: Weight Change ‖ΔW‖_F vs Round (convergence diagnostic)

Section 4: FedAvg Weight Analysis
  Per-round weight norms ‖W_t‖_F
  Layer-wise weight statistics (mean, std of each layer's weights)

[DP Section — only if DP-FedAvg enabled]
Section 5: Privacy Accounting
  ε achieved, δ, σ, noise norms per round
  RDP curve: ε(α) vs order α at final round

Section 6: Synthetic Output Quality (if enabled)
  Per-column KS statistic, Wasserstein-1, JSD
  Side-by-side distribution plots (real vs federated-synthetic)
  Correlation matrix comparison

Section 7: Privacy-Utility Summary
  Radar chart / summary table comparing:
    - Reconstruction fidelity
    - Distributional fidelity
    - Formal privacy guarantee (if DP)
    - Convergence speed

Section 8: Recommendations
  IF global_loss not converging: "Increase T (rounds) or E (local epochs)"
  IF weight_change oscillating: "Reduce η or increase batch_size"
  IF ε > 5.0 (DP mode): "Consider lowering ε for stronger guarantees"
  IF KS_avg > 0.2: "Increase training rounds or reduce noise σ"
```

---

## 8. SECURITY & PRIVACY PROPERTIES SUMMARY

| Property | FedAvg | DP-FedAvg |
|----------|--------|-----------|
| Raw data leaves client | Never | Never |
| Gradient inversion attack resistance | Partial (gradients still leak info) | Strong (noise masks gradients) |
| Formal DP guarantee | None | (ε, δ)-DP at client level |
| Model inversion resistance | Low | Medium |
| Communication overhead | K × |W| per round | K × |W| per round |
| Convergence speed | Fast | Slower (noise slows convergence) |

**Gradient Inversion Attack Note (display in UI):**
> "Standard FedAvg is vulnerable to gradient inversion attacks (Zhu et al., 2019) — an adversary controlling the server can approximately reconstruct training data from shared gradients. DP-FedAvg mitigates this by adding calibrated Gaussian noise to the aggregated update."

---

## 9. IMPLEMENTATION ORDER

```
Priority 1 — FedAvg Core:
  [x] DataTransformer (reuse from SDG module)
  [x] Tabular Autoencoder (Encoder + Decoder, PyTorch)
  [x] IID data partition
  [x] FedAvg training loop (local train + weighted aggregate)
  [x] Reconstruction loss (MSE + CrossEntropy per column type)
  [x] History logging (global loss, per-client loss, weight change)
  [x] Convergence check
  [x] Sidebar metrics panel (live update)

Priority 2 — DP-FedAvg:
  [x] Update clipping: ‖ΔW_k‖_F ≤ C
  [x] Gaussian noise injection at server aggregation
  [x] σ calibration via binary search + RDP accountant
  [x] ε_actual computation post-training
  [x] DP metrics in sidebar

Priority 3 — Synthetic Output:
  [x] Decoder sampling z ~ N(0,I) → x̃
  [x] Inverse transform
  [x] Utility metrics (KS, Wasserstein, JSD)

Priority 4 — UI:
  [x] Remove Target Columns panel; replace with Dataset Summary
  [x] Non-IID partition option
  [x] Live loss chart during training (websocket or polling)
  [x] DP parameter panel (conditional on toggle)
  [x] HTML + CSV report download
```

---

## 10. TECH STACK RECOMMENDATIONS

| Component | Library |
|-----------|---------|
| Tabular Autoencoder | `torch` (PyTorch) |
| FedAvg loop | Pure Python + PyTorch |
| DP-FedAvg noise | `torch.distributions.Normal` |
| RDP Accountant | `opacus.accountants.RDPAccountant` (reuse from DP-SDG) |
| DataTransformer | Reuse from SDG module |
| Utility Metrics | `scipy.stats.ks_2samp`, `scipy.stats.wasserstein_distance` |
| Report | Jinja2 + Chart.js (loss curves as inline charts) |

---

*Document Version: 1.0 | Statathon 2025 | AIRAVATA Technologies | MoE Innovation Cell*
