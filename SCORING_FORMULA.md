# Scoring Formula - Mathematical Definition

This document provides the exact mathematical formula used to calculate the "score" for animals and matings.

## Constants

### Emphasis Values (by trait)
```
CED: 4,  BW: 1,  WW: 6,  YW: 4,  RADG: 1,  DMI: 2,  YH: 0,  SC: 0,
DOC: 3,  CLAW: 4,  ANGLE: 0,  PAP: 1,  HS: 1,  HP: 3,  CEM: 0,
MILK: 0,  TEAT: 0,  UDDR: 0,  FL: 0,  MW: 2,  MH: 2,  $EN: 0,
CW: 3,  MARB: 6,  RE: 3,  FAT: 0,  $M: 8,  $B: 6,  $C: 8
```

Traits not listed default to emphasis = 0.

### Color Goodness Values
```
Dark Green:  +3
Green:       +2
Light Green: +1
Gray:         0  (baseline)
Pink:        -1
Red:         -2
Dark Red:    -3
```

### Color Ranks (for penalty calculations)
```
Dark Green:  0
Green:       1
Light Green: 2
Gray:        3  (baseline)
Pink:        4
Red:         5
Dark Red:    6
```

### Tuning Parameters
- **α (alpha)**: 0.7 (weight normalization factor)
- **Below-Light-Green Penalty Multiplier**: 0.25
- **Gate Penalty Multiplier**: 0.60

## Step 1: Calculate Trait Weight

For each trait `t`:

```
maxEmphasis = max(emphasisByTrait)  // Maximum emphasis value across all traits (currently 8)

weight(t) = 1 + (emphasis(t) / maxEmphasis) × α
         = 1 + (emphasis(t) / 8) × 0.7
```

**Range**: 1.0 ≤ weight(t) ≤ 1.7

**Examples**:
- Trait with emphasis 0: `weight = 1.0 + (0/8) × 0.7 = 1.0`
- Trait with emphasis 4: `weight = 1.0 + (4/8) × 0.7 = 1.35`
- Trait with emphasis 8: `weight = 1.0 + (8/8) × 0.7 = 1.7`

## Step 2: Determine Color Band from EPD

For each trait `t` with EPD value `epd(t)`:

1. Convert EPD to percentile rank: `percentile(t) = percentileFromEpd(t, epd(t))`
2. Map percentile to color band using color-criteria.json:
   - Dark Green, Green, Light Green, Gray, Pink, Red, or Dark Red

## Step 3: Calculate Base Score

For each trait `t`:

```
goodness(t) = COLOR_GOODNESS[band(t)]  // From color band mapping above
contribution(t) = weight(t) × goodness(t)
```

**Base Score**:
```
baseScore = Σ(contribution(t)) for all traits t
          = Σ(weight(t) × goodness(t))
```

## Step 4: Calculate Below-Light-Green Penalty

For each trait `t` where `band(t)` is worse than Light Green (Gray, Pink, Red, or Dark Red):

```
rank(t) = COLOR_RANK[band(t)]
lightGreenRank = 2  // COLOR_RANK[LIGHT_GREEN]

if rank(t) > lightGreenRank:
    rankDiff(t) = rank(t) - lightGreenRank
    penalty(t) = rankDiff(t) × 0.25 × weight(t)
else:
    penalty(t) = 0
```

**Total Below-Light-Green Penalty**:
```
belowLightGreenPenalty = Σ(penalty(t)) for all traits t where rank(t) > 2
```

## Step 5: Calculate Gate Penalty (if applicable)

Gate traits are user-configurable. If `gateTraits` is not empty:

For each trait `t` where:
- `t ∈ gateTraits` (t is a gate trait)
- `band(t)` is worse than Gray (Pink, Red, or Dark Red)

```
rank(t) = COLOR_RANK[band(t)]
grayRank = 3  // COLOR_RANK[GRAY]

if t ∈ gateTraits AND rank(t) > grayRank:
    gateRankDiff(t) = rank(t) - grayRank
    gatePenalty(t) = gateRankDiff(t) × 0.60 × weight(t)
else:
    gatePenalty(t) = 0
```

**Total Gate Penalty**:
```
extraGatePenalty = Σ(gatePenalty(t)) for all gate traits t where rank(t) > 3
```

**Note**: Gray traits pass the gate but still receive the below-light-green penalty.

## Step 6: Final Score

```
finalScore = baseScore - belowLightGreenPenalty - extraGatePenalty
```

## Complete Formula (Single Expression)

```
finalScore = Σ(weight(t) × goodness(t)) 
           - Σ(rankDiff(t) × 0.25 × weight(t)) [for t where rank(t) > 2]
           - Σ(gateRankDiff(t) × 0.60 × weight(t)) [for t ∈ gateTraits AND rank(t) > 3]

where:
  weight(t) = 1 + (emphasis(t) / 8) × 0.7
  goodness(t) = COLOR_GOODNESS[band(t)]
  rankDiff(t) = COLOR_RANK[band(t)] - 2
  gateRankDiff(t) = COLOR_RANK[band(t)] - 3
```

## Example Calculation

**Given**:
- WW (emphasis=6, band=Green): weight=1.525, goodness=+2
- YW (emphasis=4, band=Light Green): weight=1.35, goodness=+1
- CLAW (emphasis=4, gate trait, band=Pink): weight=1.35, goodness=-1
- BW (emphasis=1, band=Gray): weight=1.0875, goodness=0

**Base Score**:
```
= (1.525 × 2) + (1.35 × 1) + (1.35 × -1) + (1.0875 × 0)
= 3.05 + 1.35 - 1.35 + 0
= 3.05
```

**Below-Light-Green Penalty**:
- CLAW: rank=4, rankDiff=4-2=2, penalty=2 × 0.25 × 1.35 = 0.675
- BW: rank=3, rankDiff=3-2=1, penalty=1 × 0.25 × 1.0875 = 0.271875
- Total = 0.675 + 0.271875 = 0.946875

**Gate Penalty** (CLAW is gate trait and Pink):
- CLAW: gateRankDiff=4-3=1, penalty=1 × 0.60 × 1.35 = 0.81

**Final Score**:
```
= 3.05 - 0.946875 - 0.81
= 1.293125
```

## Notes

1. **All traits contribute** - No trait is ignored, even those with emphasis=0 (they have weight=1.0)
2. **Light Green is the baseline** - Traits better than Light Green add positive points; traits worse subtract points
3. **Gate traits are optional** - If no gate traits are selected, `extraGatePenalty = 0`
4. **Weight normalization** - The α=0.7 parameter ensures high-emphasis traits don't dominate (max weight is 1.7×, not 8×)
5. **Penalty scaling** - The 0.25 and 0.60 multipliers are tuning parameters that balance the scoring system

