/**
 * Applies a config colour to a THREE.Color only when it changed, so per-frame code can
 * follow live dashboard edits without parsing a string (and allocating) every frame.
 */
export const liveColor = (color, hex) => {
  if (color.userHex !== hex) {
    color.set(hex)
    color.userHex = hex
  }
}
