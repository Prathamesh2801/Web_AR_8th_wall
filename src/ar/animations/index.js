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
import {createCallouts} from '../callouts'
import {createEnergy} from '../energy'
import {createLabelSpin} from '../labelSpin'
import {createLogoLift} from '../logoLift'
import {createPhotoBurst} from '../photoBurst'
import {createPlanted} from '../planted'
import {createScan} from '../scan'
import {createNutrientSystem} from '../nutrientSystem'
import {createProductOutline} from '../productOutline'
import {createSettleEffect} from '../settleEffect'
import {createSparkle} from '../sparkle'
import {createSpotlight} from '../spotlight'
import {createTechOrbit} from '../techOrbit'
import {createTickerRings} from '../tickerRings'
import {createTypography} from '../typography'

export const ANIMATION_FACTORIES = {
  [AnimationId.PRODUCT_OUTLINE]: createProductOutline,
  [AnimationId.TYPOGRAPHY]: createTypography,
  [AnimationId.CALLOUTS]: createCallouts,
  [AnimationId.TICKER]: createTickerRings,
  [AnimationId.LOGO_LIFT]: createLogoLift,
  [AnimationId.LABEL_SPIN]: createLabelSpin,
  [AnimationId.NUTRIENT_ORBIT]: createNutrientSystem,
  [AnimationId.TECH_ORBIT]: createTechOrbit,
  [AnimationId.PHOTO_BURST]: createPhotoBurst,
  [AnimationId.PLANTED]: createPlanted,
  [AnimationId.SETTLE]: createSettleEffect,
  [AnimationId.SPOTLIGHT]: createSpotlight,
  [AnimationId.ENERGY]: createEnergy,
  [AnimationId.SCAN]: createScan,
  [AnimationId.SPARKLE]: createSparkle,
}
