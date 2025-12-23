# All Matings Scoring Algorithm

This document explains how the "All Matings" feature calculates scores for ranking potential matings.

## Core Principles

1. **No traits are ignored** - Every trait always contributes to the score
2. **Emphasis controls relative importance** - Not absolute dominance
3. **Color bands remain the source of truth** - From percentile → color mapping
4. **Gates are optional and user-configurable** - Default: none
5. **Uniform, balanced animals are preferred** - Over extreme "freaks"

## Step 0: Input Data Definitions

### A. Emphasis Values

Emphasis values are **NOT multipliers**. They control relative importance of traits.

```javascript
const emphasisByTrait = {
  CED: 4,
  BW: 1,
  WW: 6,
  YW: 4,
  RADG: 1,
  DMI: 2,
  YH: 0,
  SC: 0,
  DOC: 3,
  CLAW: 4,
  ANGLE: 0,
  PAP: 1,
  HS: 1,
  HP: 3,
  CEM: 0,
  MILK: 0,
  TEAT: 0,
  UDDR: 0,
  FL: 0,
  MW: 2,
  MH: 2,
  $EN: 0,
  CW: 3,
  MARB: 6,
  RE: 3,
  FAT: 0,
  $M: 8,
  $B: 6,
  $C: 8
};
```

Traits not listed default to emphasis = 0.

### B. Gate Traits

There are **NO default gate traits**. Gate traits are defined by the user via UI. An empty array means NO gates are active.

Example configuration:
```javascript
const gateTraits = ["WW", "YW", "CLAW", "ANGLE", "$M"]; // user-selected
// OR
const gateTraits = []; // no gates
```

## Step 1: Normalize Emphasis into Safe Weights

Directly multiplying by raw emphasis would over-exaggerate traits. Instead, normalize emphasis into a bounded weight range.

```javascript
const alpha = 0.7; // tuning parameter (0.5–0.8 recommended)

const maxEmphasis = Math.max(...Object.values(emphasisByTrait));

function getTraitWeight(trait) {
  const raw = emphasisByTrait[trait] ?? 0;
  const normalized = raw / maxEmphasis; // 0..1
  return 1 + (normalized * alpha); // final range: 1.0 → 1.7
}
```

This guarantees:
- **No trait is ignored** (minimum weight = 1.0)
- High-emphasis traits matter more but cannot dominate
- Balanced animals score best

**Examples:**
- Trait with emphasis 0: `weight = 1.0 + (0/8 * 0.7) = 1.0`
- Trait with emphasis 4: `weight = 1.0 + (4/8 * 0.7) = 1.35`
- Trait with emphasis 8 (max): `weight = 1.0 + (8/8 * 0.7) = 1.7`

## Step 2: Calculate Calf EPD for Each Trait

For each trait (e.g., WW, YW, BW, etc.):
```
Calf EPD = (Sire EPD + Cow EPD) / 2
```
This is the expected value for the calf (simple average of parent EPDs).

## Step 3: Determine Color Band from Percentile

1. Use the calf EPD to get a percentile rank (1-100) from percentile data
2. Map the percentile to a color using `color-criteria.json`:
   - **Dark Green** (best percentile ranges)
   - **Green**
   - **Light Green**
   - **Gray** (neutral baseline)
   - **Pink**
   - **Red**
   - **Dark Red** (worst percentile ranges)

## Step 4: Map Color → Goodness & Rank

```javascript
const colorGoodness = {
  "Dark Green":  +3,
  "Green":       +2,
  "Light Green": +1,
  "Gray":         0,  (baseline)
  "Pink":        -1,
  "Red":         -2,
  "Dark Red":    -3
};

const colorRank = {
  "Dark Green":  0,
  "Green":       1,
  "Light Green": 2,
  "Gray":        3,  (baseline)
  "Pink":        4,
  "Red":         5,
  "Dark Red":    6
};
```

## Step 5: Base Score Calculation

For each trait:

```
weight = getTraitWeight(trait)  // 1.0 to 1.7 based on emphasis
traitContribution = goodness × weight
baseScore += traitContribution
```

**All traits contribute** - no trait is ignored. The weight determines how much each trait matters relative to others.

**Example:**
- WW (emphasis 6, gets Green +2): `weight = 1.525`, `contribution = 2 × 1.525 = 3.05`
- BW (emphasis 1, gets Gray 0): `weight = 1.0875`, `contribution = 0 × 1.0875 = 0.0`
- $M (emphasis 8, max, gets Dark Green +3): `weight = 1.7`, `contribution = 3 × 1.7 = 5.1`

## Step 6: Penalties for Below-Gray Traits

### A. Below-Gray Penalty

For any trait that is **worse than Gray** (Pink, Red, or Dark Red):

```
rankDiff = colorRank - grayRank
belowGrayPenalty += rankDiff × 0.25 × weight
```

**What does 0.25 represent?**

The `0.25` is a **scaling factor** (penalty multiplier) that determines how many points are deducted per rank worse than Gray. It converts the rank difference into a score penalty:

- For each rank worse than Gray, you lose **0.25 points** (multiplied by the trait weight)
- This is a tuning parameter that balances the scoring - moderate enough to not dominate, but meaningful enough to penalize poor traits
- The penalty scales linearly: Pink = 0.25×weight, Red = 0.50×weight, Dark Red = 0.75×weight

**Example:** If WW (emphasis 6, weight 1.525) is Red (rank 5):
```
rankDiff = 5 - 3 = 2
penalty = 2 × 0.25 × 1.525 = 0.7625 points deducted
```

## Step 7: Configurable Gates

### A. Gate Selection

There are **NO default gate traits**. Gate traits are defined by the user via UI:
```javascript
const gateTraits = ["WW", "YW", "CLAW", "ANGLE", "$M"]; // example only
```

An empty array means NO gates are active.

### B. Extra Gate Penalty

If a trait is a gate trait AND worse than Gray:

```
extraGatePenalty += rankDiff × 0.60 × weight
```

**What does 0.60 represent?**

The `0.60` is a **stricter penalty multiplier** for gate traits. It's **2.4× higher** than the below-gray penalty (0.60 vs 0.25), making gate trait failures significantly more costly than non-gate trait failures. This emphasizes the importance of gate traits meeting the minimum threshold (Gray or better).

**Example:** Same WW that is Red and is a gate trait:
```
penalty = 2 × 0.60 × 1.525 = 1.83 points deducted
```

This extra penalty is **in addition** to the below-gray penalty, so a gate trait that fails:
- Loses points from the below-gray penalty (0.25 per rank)
- **Plus** loses additional points from the gate penalty (0.60 per rank)
- **Total gate penalty = 0.85 per rank** (0.25 + 0.60) for gate traits

### C. Gate Pass / Fail Rule

A mating **passes the gate** if:
- All gate traits are Gray or better
- **OR** no gate traits are selected (empty array)

Gate status affects sorting priority, not score calculation.

## Step 8: Final Score

```
finalScore = baseScore - belowGrayPenalty - extraGatePenalty
```

## Step 9: Sorting / Ranking

Matings are ranked by:

1. **Gate pass status** (gate passers first)
2. **Final score** (higher scores first)
3. **Number of below-gray traits** (fewer bad traits first)
4. **Number of improved emphasis traits** (more improved emphasis traits first)
5. **Alphabetical** by cow name, then sire name

## Complete Example

Let's say we have a mating with these traits:

| Trait | Emphasis | Weight | Calf EPD | Percentile | Band | Goodness | Base Contribution |
|-------|----------|--------|----------|------------|------|----------|-------------------|
| WW (gate) | 6 | 1.525 | +45 | 85% | Light Green | +1 | +1.525 |
| YW (gate) | 4 | 1.35 | +80 | 92% | Green | +2 | +2.70 |
| CLAW (gate) | 4 | 1.35 | -2 | 15% | Pink | -1 | -1.35 |
| BW | 1 | 1.0875 | +5 | 50% | Gray | 0 | 0.0 |

**Calculations:**
- **Base Score**: `1.525 + 2.70 - 1.35 + 0.0 = 2.875`
- **Below Gray Penalty**: CLAW is Pink (rank 4, one rank worse than Gray)
  - `rankDiff = 4 - 3 = 1`
  - `penalty = 1 × 0.25 × 1.35 = 0.3375` (0.25 points per rank × weight)
- **Extra Gate Penalty**: CLAW is a gate trait and is Pink
  - `penalty = 1 × 0.60 × 1.35 = 0.81` (0.60 points per rank × weight, in addition to below-gray penalty)
- **Final Score**: `2.875 - 0.3375 - 0.81 = 1.7275`

## Summary

The scoring algorithm:
- **Uses emphasis-based weighting** - All traits contribute, with relative importance based on emphasis values
- **Normalizes weights safely** - Prevents over-weighting of high-emphasis traits (range: 1.0 to 1.7)
- **Rewards good traits** - Especially high-emphasis traits with higher weights
- **Penalizes bad traits** - Worse than Gray gets penalties
- **Extra penalizes gate trait failures** - 0.60 multiplier vs 0.25 for non-gates
- **Prioritizes matings that pass the gate** - If gates are configured
- **Rewards uniform green animals** - Balanced animals score best

This ensures that matings with better overall traits (especially high-emphasis traits) rank higher, while those with gate failures or many poor traits are ranked lower.
