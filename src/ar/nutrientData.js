/**
 * The active brand's nutrient data (src/brands/<brand>/nutrients.js), or empty lists
 * for a brand without any — the effects that need it are then switched off in config.js.
 */
import {BRAND} from '../config'

export const NUTRIENTS = BRAND.nutrients?.NUTRIENTS ?? []
export const CONNECTIONS = BRAND.nutrients?.CONNECTIONS ?? []
export const GROUP_COLOR = BRAND.nutrients?.GROUP_COLOR ?? {}
export const NutrientGroup = BRAND.nutrients?.NutrientGroup ?? {}
