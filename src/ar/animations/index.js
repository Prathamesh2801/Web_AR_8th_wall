/**
 * animations/index.js
 *
 * Registry mapping an animation id from src/config.js to the factory that builds it.
 *
 * This indirection is what keeps bottleScene.js free of any specific animation: it
 * looks the factory up by id rather than importing modules directly. Adding an
 * animation means adding one line here and one entry in config.js.
 *
 * Each factory must satisfy the ANIMATION MODULE CONTRACT documented in src/config.js.
 * It receives that animation's config object, so per-animation options can be read
 * without reaching back into the config module.
 */
import {AnimationId} from '../../config'
import {createNutrientSystem} from '../nutrientSystem'
import {createProductOutline} from '../productOutline'
import {createSettleEffect} from '../settleEffect'
import {createTypography} from '../typography'

export const ANIMATION_FACTORIES = {
  [AnimationId.PRODUCT_OUTLINE]: createProductOutline,
  [AnimationId.TYPOGRAPHY]: createTypography,
  [AnimationId.NUTRIENT_ORBIT]: createNutrientSystem,
  [AnimationId.SETTLE]: createSettleEffect,
}
