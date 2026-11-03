/**
 * Picks which of several simultaneously tracked targets drives the pose.
 *
 * The label is split into overlapping crops (config TRACKING.targets), so two can be
 * tracked in the same frame. Letting both write the anchor makes it flip between two
 * slightly different estimates every frame. Instead the first one found leads until
 * it is lost; then any other still-tracked crop takes over without a visible loss.
 */
export const createLeadTarget = () => {
  const tracked = new Set()
  let lead = null

  return {
    /** Target found/updated. Returns true if its pose should be applied. */
    seen(name) {
      tracked.add(name)
      lead ??= name
      return name === lead
    },
    /** Target lost. Returns true only when this loss leaves NOTHING tracked. */
    lost(name) {
      if (!tracked.delete(name)) return false   // never tracked: nothing changes
      if (name === lead) lead = tracked.values().next().value ?? null
      return lead === null
    },
    get lead() {
      return lead
    },
  }
}
