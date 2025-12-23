# All Matings Scoring Algorithm

This document explains how the "All Matings" feature calculates scores for ranking potential matings.

## Score Calculation Overview

The final score formula is:
```
Final Score = Base Score - Below Gray Penalty - Extra Gate Penalty
```

## Step-by-Step Process

### Step 1: Calculate Calf EPD for Each Trait

For each trait (e.g., WW, YW, BW, etc.):
```
Calf EPD = (Sire EPD + Cow EPD) / 2
```
This is the expected value for the calf (simple average of parent EPDs).

### Step 2: Determine Color Band from Percentile

1. Use the calf EPD to get a percentile rank (1-100) from percentile data
2. Map the percentile to a color using `color-criteria.json`:
   - **Dark Green** (best percentile ranges)
   - **Green**
   - **Light Green**
   - **Gray** (neutral baseline)
   - **Pink**
   - **Red**
   - **Dark Red** (worst percentile ranges)

3. Map the color to a "goodness" value:
   ```javascript
   Dark Green:  +3
   Green:       +2
   Light Green: +1
   Gray:         0  (baseline)
   Pink:        -1
   Red:         -2
   Dark Red:    -3
   ```

### Step 3: Calculate Base Score

For each trait:
```
traitContribution = weight × goodness
baseScore += traitContribution
```

**Weights:**
- **Weakness traits** (default: WW, YW, CLAW, ANGLE, $M): `weight = 2.0`
- **All other traits**: `weight = 1.0`

**Example:**
- WW (weakness trait) gets Dark Green (+3): `2.0 × 3 = +6`
- BW (regular trait) gets Green (+2): `1.0 × 2 = +2`
- Total base score accumulates across all traits.

### Step 4: Apply Penalties

#### A. Below Gray Penalty

For any trait that is **worse than Gray** (Pink, Red, or Dark Red):
```
rankDiff = colorRank - grayRank
belowGrayPenalty += rankDiff × 0.25 × weight
```

**Color Ranks** (higher = worse):
- Dark Red: 6
- Red: 5
- Pink: 4
- **Gray: 3** (baseline)
- Light Green: 2
- Green: 1
- Dark Green: 0

**Example:** If WW is Red (rank 5):
```
rankDiff = 5 - 3 = 2
penalty = 2 × 0.25 × 2.0 (weakness weight) = 1.0
```

#### B. Extra Gate Penalty

For any **gate trait** (default: WW, YW, CLAW, ANGLE, $M) that is worse than Gray:
```
extraGatePenalty += rankDiff × 0.60 × weight
```

**Example:** Same WW that is Red:
```
penalty = 2 × 0.60 × 2.0 = 2.4
```

This extra penalty is **in addition** to the below-gray penalty, making gate trait failures more costly.

### Step 5: Calculate Final Score

```
finalScore = baseScore - belowGrayPenalty - extraGatePenalty
```

## Complete Example

Let's say we have a mating with these traits:

| Trait | Calf EPD | Percentile | Band | Weight | Goodness | Base Contribution |
|-------|----------|------------|------|--------|----------|-------------------|
| WW (weakness, gate) | +45 | 85% | Light Green | 2.0 | +1 | +2.0 |
| YW (weakness, gate) | +80 | 92% | Green | 2.0 | +2 | +4.0 |
| CLAW (weakness, gate) | -2 | 15% | Pink | 2.0 | -1 | -2.0 |
| BW (regular) | +5 | 50% | Gray | 1.0 | 0 | 0.0 |

**Calculations:**
- **Base Score**: `2.0 + 4.0 - 2.0 + 0.0 = 4.0`
- **Below Gray Penalty**: CLAW is Pink (rank 4)
  - `rankDiff = 4 - 3 = 1`
  - `penalty = 1 × 0.25 × 2.0 = 0.5`
- **Extra Gate Penalty**: CLAW is a gate trait and is Pink
  - `penalty = 1 × 0.60 × 2.0 = 1.2`
- **Final Score**: `4.0 - 0.5 - 1.2 = 2.3`

## Gate Rule

The mating **passes the gate** only if **all gate traits** are Gray or better (no Pink, Red, or Dark Red). 

In the example above, CLAW is Pink, so the gate **fails**.

## Sorting/Ranking Priority

When comparing matings, they're sorted by:

1. **Gate pass status** (gate passers first)
2. **Final score** (higher scores first)
3. **Number of below-gray traits** (fewer bad traits first)
4. **Number of improved weakness traits** (more improved weaknesses first)
5. **Alphabetical** by cow name, then sire name

## Summary

The scoring algorithm:
- **Rewards** good traits (especially weakness traits with 2x weight)
- **Penalizes** bad traits (worse than Gray)
- **Extra penalizes** gate trait failures (0.60 multiplier vs 0.25)
- **Prioritizes** matings that pass the gate

This ensures that matings with better overall traits and especially good weakness traits rank higher, while those with gate failures or many poor traits are ranked lower.
