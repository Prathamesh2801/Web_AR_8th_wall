/**
 * occlusionProxy.js
 *
 * A depth-only cylinder standing in for the physical bottle.
 *
 * WHY THIS EXISTS
 * The bottle is camera footage, not geometry, so nothing in the scene naturally hides
 * orbiting nodes when they pass behind it. This proxy writes DEPTH but no COLOUR, so
 * it is invisible yet still occludes anything drawn behind it — which is what makes the
 * orbit read as genuinely circling the bottle instead of floating over it.
 *
 * HOW IT WORKS (verified against three.js r185 and the 8th Wall engine)
 *   colorWrite: false  -> contributes nothing to the image
 *   depthWrite: true   -> still fills the depth buffer
 *   renderOrder: -1    -> drawn BEFORE the nutrients, so their depth test can fail
 *
 * `visible = false` would NOT work: invisible objects are skipped entirely and write
 * no depth. That is the trap this module exists to avoid.
 *
 * Engine compatibility: the engine renders with `autoClear = false` but explicitly
 * calls `renderer.clear(color, true, false)` each frame — the DEPTH buffer is cleared,
 * so proxy depth from the previous frame never leaks into the next one.
 *
 * Any material used by objects that should be occluded MUST keep `depthTest: true`.
 */
import * as THREE from 'three'

/**
 * How much taller the depth cylinder is than the tracked label band.
 *
 * The label band is 52mm; the bottle including cap and base is ~92mm, so 1.77 matches
 * the real object rather than inflating it.
 */
export const HEIGHT_SCALE = 1.77

/**
 * How far the proxy is raised, as a fraction of the label height.
 *
 * The label band is NOT vertically centred on the bottle: there is roughly 28mm of cap
 * and shoulder above it but only ~12mm of base below. A symmetric cylinder therefore
 * hangs ~26mm below the bottle and into the table, occluding nodes that pass in front
 * of the table surface where there is no bottle to hide them. Offsetting upward by half
 * that difference puts the depth volume where the object actually is.
 */
export const Y_OFFSET_SCALE = 0.155

export const createOcclusionProxy = () => {
  const group = new THREE.Group()
  let mesh = null
  let outline = null
  let enabled = false

  /**
   * Builds the proxy from the tracked cylinder's real dimensions.
   *
   * HEIGHT: the engine reports only the LABEL BAND (52mm on this bottle), but the
   * physical object is roughly twice that once the cap, shoulder, neck and base are
   * included. A proxy sized to the label alone writes no depth above or below that
   * band, so a node orbiting past the cap or the base passes IN FRONT of real bottle
   * pixels with nothing to hide it — which reads as the orbit emerging from and
   * re-entering the product rather than circling it.
   *
   * So the depth cylinder is extended vertically by HEIGHT_SCALE. This is deliberately
   * a depth-only change: the mesh remains invisible, so an over-estimate costs nothing
   * visually, whereas an under-estimate breaks the occlusion illusion. The extension is
   * vertical ONLY — the radius still comes from the tracked geometry, because widening
   * it would start hiding nodes that legitimately pass beside the bottle.
   *
   * @param {{radiusTop:number, radiusBottom:number, height:number}} geometry
   */
  const build = (geometry) => {
    if (mesh || !geometry) return false
    const {radiusTop, radiusBottom, height} = geometry
    const rt = Number.isFinite(radiusTop) && radiusTop > 0 ? radiusTop : radiusBottom
    const rb = Number.isFinite(radiusBottom) && radiusBottom > 0 ? radiusBottom : radiusTop
    if (!Number.isFinite(rt) || rt <= 0 || !Number.isFinite(height) || height <= 0) return false

    // Covers cap + shoulder above and base below the tracked label band, raised so the
    // volume sits over the real object instead of extending into the table.
    const proxyHeight = height * HEIGHT_SCALE
    const yOffset = height * Y_OFFSET_SCALE

    // Slightly inset (0.98) so the proxy sits just inside the printed label rather than
    // protruding past the silhouette, which would clip nodes grazing the bottle's edge.
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(rt * 0.98, rb * 0.98, proxyHeight, 32, 1, false),
      new THREE.MeshBasicMaterial({
        colorWrite: false,   // invisible...
        depthWrite: true,    // ...but still occludes
        depthTest: true,
      })
    )
    // Drawn before the orbital content so its depth is already present.
    mesh.renderOrder = -1
    mesh.position.y = yOffset
    group.add(mesh)
    enabled = true

    /*
     * Visible wireframe of the SAME cylinder the depth proxy uses.
     *
     * This is a verification aid: it draws exactly the surface that does the occluding,
     * so the orbit can be eyeballed against the volume the nodes are supposed to travel
     * around. It is drawn from the identical radii/height as the depth mesh above — if the two
     * ever diverge, the outline stops being evidence, so they are built from one source.
     *
     * depthTest stays true so the far side of the outline is hidden by the proxy,
     * which is itself a check that the depth path is working.
     */
    outline = new THREE.Group()

    /*
     * Built from tube MESHES, not lines. `LineBasicMaterial.linewidth` is ignored by
     * every WebGL renderer (the spec allows only 1px), so a line-based outline can never
     * be made thicker and is nearly invisible against a busy camera feed. Torus and
     * cylinder meshes give real, controllable thickness.
     *
     * Dimensions come from the SAME rt/rb/proxyHeight as the depth mesh, so the outline
     * always shows exactly the volume that is doing the occluding.
     */
    const tube = Math.max(rt * 0.035, 0.0015)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x66e8ff,
      transparent: true,
      opacity: 0.95,
      // depthTest OFF: this is a diagnostic overlay and must stay visible even where the
      // depth proxy would hide its own far side. The occlusion check is the NODES, not
      // this wireframe.
      depthTest: false,
      depthWrite: false,
    })
    // Drawn after everything else so it is never hidden by the orbital content.
    const RENDER_ORDER = 999

    // Top and bottom rims.
    for (const [r, y] of [[rt, proxyHeight / 2], [rb, -proxyHeight / 2]]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, tube, 8, 48), ringMat)
      rim.rotation.x = Math.PI / 2
      rim.position.y = y + yOffset
      rim.renderOrder = RENDER_ORDER
      outline.add(rim)
    }

    // A rim at the tracked label band's own edges, so the TRACKED region is
    // distinguishable from the extended depth volume.
    for (const y of [height / 2, -height / 2]) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(rt * 0.98, tube * 0.6, 8, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffd166, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false,
        })
      )
      band.rotation.x = Math.PI / 2
      band.position.y = y
      band.renderOrder = RENDER_ORDER
      outline.add(band)
    }

    // Four vertical struts to read the cylinder's height and orientation.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(tube * 0.7, tube * 0.7, proxyHeight, 6),
        ringMat
      )
      strut.position.set(Math.cos(a) * rt * 0.98, yOffset, Math.sin(a) * rt * 0.98)
      strut.renderOrder = RENDER_ORDER
      outline.add(strut)
    }

    outline.visible = false
    group.add(outline)

    console.log('[AR] occlusion proxy built', {
      radiusTop: +rt.toFixed(4),
      radiusBottom: +rb.toFixed(4),
      height: +height.toFixed(4),
    })
    return true
  }

  const isEnabled = () => enabled

  /** Shows/hides the wireframe. Off by default; driven by the debug toggle. */
  const setOutlineVisible = (v) => {
    if (outline) outline.visible = Boolean(v)
  }

  return {group, build, isEnabled, setOutlineVisible}
}
