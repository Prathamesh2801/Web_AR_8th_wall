import {useSyncExternalStore} from 'react'
import {trackingStore} from '../ar/trackingStore'

/**
 * Subscribes React to the AR layer's tracking state.
 *
 * `useSyncExternalStore` is the correct primitive here: the AR loop is an external,
 * non-React source of truth, and this keeps reads tear-free without React ever
 * owning or blocking the tracking data.
 */
export const useTracking = () => useSyncExternalStore(
  trackingStore.subscribe,
  trackingStore.getSnapshot
)
