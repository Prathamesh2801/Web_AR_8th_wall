/**
 * nutrientData.js
 *
 * Nutrient composition for Supradyn Naturals Ginseng (60 tablets).
 *
 * EVERY value below was extracted positionally from the production artwork
 * (label artwork, "Each Film Coated Tablet Contains" table — see brand-assets/). Nothing is invented,
 * and no health claim beyond the packaging's own wording appears here.
 *
 * `amount` and `rda` are exactly as printed. `rda: null` renders as "#", which the
 * label defines as "%RDA not established".
 *
 * `size` is the node's relative size in the orbit.
 */

/** Groups shown on the label. */
export const NutrientGroup = {
  BOTANICAL: 'Botanical Extracts',
  MINERAL: 'Essential Minerals',
  VITAMIN: 'Essential Vitamins',
}

export const NUTRIENTS = [
  // --- Botanical Extracts (label group 1) -----------------------------------
  {id: 'ginseng', label: 'GIN', full: 'Panax Ginseng Extract', amount: '250mg',
    rda: null, group: NutrientGroup.BOTANICAL, size: 1.15},
  {id: 'grape', label: 'GS', full: 'Grape Seed Extract', amount: '60mg',
    rda: null, group: NutrientGroup.BOTANICAL, size: 1.1},

  // --- Essential Minerals (label group 2) -----------------------------------
  {id: 'ca', label: 'Ca', full: 'Calcium', amount: '150mg',
    rda: '15.00', group: NutrientGroup.MINERAL, size: 1.0},
  {id: 'mg', label: 'Mg', full: 'Magnesium', amount: '100mg',
    rda: '22.73', group: NutrientGroup.MINERAL, size: 1.0},
  {id: 'fe', label: 'Fe', full: 'Iron', amount: '17mg',
    rda: '89.47', group: NutrientGroup.MINERAL, size: 1.0},
  {id: 'zn', label: 'Zn', full: 'Zinc', amount: '17mg',
    rda: '100.00', group: NutrientGroup.MINERAL, size: 1.0},
  {id: 'mn', label: 'Mn', full: 'Manganese', amount: '0.60mg',
    rda: '15.00', group: NutrientGroup.MINERAL, size: 0.9},

  // --- Essential Vitamins (label group 3) -----------------------------------
  {id: 'c', label: 'C', full: 'Vitamin C', amount: '40mg',
    rda: '50.00', group: NutrientGroup.VITAMIN, size: 1.05},
  {id: 'b3', label: 'B3', full: 'Vitamin B3', amount: '16mg',
    rda: '88.89', group: NutrientGroup.VITAMIN, size: 0.95},
  {id: 'e', label: 'E', full: 'Vitamin E', amount: '8mg',
    rda: '80.00', group: NutrientGroup.VITAMIN, size: 0.95},
  {id: 'b5', label: 'B5', full: 'Vitamin B5', amount: '5mg',
    rda: '100.00', group: NutrientGroup.VITAMIN, size: 0.95},
  {id: 'b6', label: 'B6', full: 'Vitamin B6', amount: '2mg',
    rda: '83.33', group: NutrientGroup.VITAMIN, size: 0.95},
  {id: 'b2', label: 'B2', full: 'Vitamin B2', amount: '1.4mg',
    rda: '56.00', group: NutrientGroup.VITAMIN, size: 0.9},
  {id: 'b1', label: 'B1', full: 'Vitamin B1', amount: '1mg',
    rda: '55.56', group: NutrientGroup.VITAMIN, size: 0.9},
  {id: 'a', label: 'A', full: 'Vitamin A', amount: '600mcg',
    rda: '60.00', group: NutrientGroup.VITAMIN, size: 0.95},
  {id: 'folic', label: 'B9', full: 'Folic acid', amount: '100mcg',
    rda: '56.67', group: NutrientGroup.VITAMIN, size: 0.9},
  {id: 'biotin', label: 'B7', full: 'Biotin', amount: '30mcg',
    rda: '75.00', group: NutrientGroup.VITAMIN, size: 0.9},
  {id: 'd2', label: 'D2', full: 'Vitamin D2', amount: '8.75mcg (350 IU)',
    rda: '58.33', group: NutrientGroup.VITAMIN, size: 1.0},
  {id: 'b12', label: 'B12', full: 'Vitamin B12', amount: '1mcg',
    rda: '45.45', group: NutrientGroup.VITAMIN, size: 1.0},
]

/**
 * Sparse, intentional connection graph — not every node joined to every other.
 * Chosen to link members of the same label group.
 */
export const CONNECTIONS = [
  ['ginseng', 'grape'],
  ['ca', 'mg'],
  ['fe', 'zn'],
  ['c', 'b3'],
  ['b6', 'b2'],
  ['folic', 'biotin'],
]

/**
 * Colour families per label group. Two tones each (core + glow) give the system depth
 * without a random palette, and harmonise with the pack's teal/gold artwork.
 *   Vitamins  - cyan / aqua
 *   Minerals  - green / teal
 *   Botanical - warm gold / amber
 */
export const GROUP_COLOR = {
  [NutrientGroup.BOTANICAL]: {core: 0xffd08a, glow: 0xffb347},
  [NutrientGroup.MINERAL]: {core: 0x8ff0c4, glow: 0x3fd8a0},
  [NutrientGroup.VITAMIN]: {core: 0xa8e4ff, glow: 0x49b8f0},
}
