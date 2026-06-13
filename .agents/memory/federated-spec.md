---
name: Federated Learning Module Spec
description: FedAvg + DP-FedAvg Tabular Autoencoder implementation in federated.ts
---

## Architecture (Tabular Autoencoder)
- Spec-labeled dims: Encoder d→128→64→32, Decoder 32→64→128→d
- Actual simulation dims: d→48→24→12→24→48→d (for browser performance)
- Activation: ReLU on all hidden layers; linear on output
- Input preprocessing: z-score normalization for numeric, one-hot for categorical

## FedAvg (McMahan 2017)
- Each node trains locally for `localEpochs` epochs on its shard
- Global update: W_{t+1} = Σ_k (n_k / n) × W_k (weighted by shard size)
- Partition strategies: IID (random shuffle) and Non-IID (sorted by first column)
- Shard cap: 50 records per node for browser performance

## DP-FedAvg
- Gradient clipping: ΔW̃_k = ΔW_k / max(1, ‖ΔW_k‖_F / C) where C = clipNorm
- Gaussian noise: ΔW̃_k += N(0, σ²C²) after clipping
- σ calibration: binary search to satisfy (ε, δ)-RDP via Rényi divergence accounting
- RDP→DP conversion: ε_DP = min over α of [ε_RDP(α) + log(1/δ)/(α-1)]

## Synthetic Generation
- Decoder takes z~N(0, I₃₂) samples and projects through decoder layers
- Denormalizes numeric columns; picks argmax category for categorical
- synthSize controls number of synthetic records generated

## FLParams Interface (exported from federated.ts)
```
{ nodes, rounds, localEpochs, localLR, batchSize, partition, dp, generateSynthetic, synthSize, seed }
```
- dp: { enabled, epsilon, delta, clipNorm }
- partition: "iid" | "non-iid"

## Privacy Page Integration
- 8 new state vars: fedLocalEpochs, fedLocalLR, fedBatchSize, fedPartition, fedDelta, fedClipNorm, fedSynthSize, fedSeed
- Dataset Summary panel in FL tab left sidebar: shows n, d, shards K, partition label
- Live σ display next to DP delta control
- All 8 vars added to handleRun useCallback dependency array

## Report
- 9-section HTML compliance report
- Includes model architecture, round-by-round loss, DP parameters, RDP accounting detail
