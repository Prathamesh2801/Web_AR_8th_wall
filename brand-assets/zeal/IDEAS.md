# Zeal: ideas board (not built yet)

Notes for us to come back to. Status per idea; move to "Built" when done.
Brand look for everything: deep green `#1C552A`, lime `#9BE23B`, mint `#3FD9A8`, ink `#123D1F`,
label paper `#F6F8F3`. Clean, techy, friendly. No claims beyond what Zeal actually offers
(zealinteractive.in: VR, AR, interactive walls, AI photobooth, gesture tech, sensor games,
robotics hardware, event tech).

## Elements group (lens menu): the set

Today Zeal has NO Elements styles: Supradyn's Orbit and Planted need nutrient data, so they
switch themselves off for Zeal. Agreed set (2026-11-12): all five below. Suggested first
three: **Tech Orbit + Robot Buddy + Photo Burst** (a service, a character, real work).

### 1. Tech Orbit (Meshy models): BUILT; all 5 models in (final set)
- Built 2026-11-12 (`src/ar/techOrbit.js`): the 8 printed badges lift off as 3D coins onto
  one evenly spaced orbit ring (drawn track, names on the near side); tap = the coin rises
  onto a glass info board above the cap (pitch from `brand.js`), tap again = back. To use Meshy models: put the GLB in
  `public/brands/zeal/models/` and add `model: 'models/<name>.glb'` to that item.
- Small 3D service objects circle the bottle on tilted rings, passing behind it (occluder):
  VR headset, game controller, robot, photobooth camera, pointing hand (gesture).
- Tap one: a card with the service name + a one-line pitch (reuse the nutrient-card pattern).
- Mirrors Supradyn's nutrient Orbit, so both brands feel like one product. Build it generic:
  the brand file lists `{model, label, card}` items.
- Needs: 5 GLBs from Meshy (prompts below), card copy per service.

### 2. Robot Buddy (one Meshy model, animated)
- A small robot comes out from behind the bottle on the table, walks round it (occluded on
  the far side), peeks, waves at the camera, hops onto the cap for the photo.
- Robotics Hardware. The most shareable one for socials.
- Needs: robot GLB rigged in Meshy with clips: idle, walk, wave, jump/hop.

### 3. Portal (no Meshy)
- A glowing ring opens on the table beside the bottle; through it, a 360° scene (a real Zeal
  event setup, or a VR world), seen like a window, parallax as the phone moves.
- VR.
- Needs: one 360° photo or video (a phone panorama works), equirectangular.

### 4. Photo Burst (no Meshy)
- Polaroid-style photos of real Zeal events fly out of the cap, fan into an arc round the
  bottle and float; tap one to bring it to the front.
- AI Photobooth; puts real work in every social video.
- Needs: 6–10 event photos (rights cleared for socials), ideally 4:5 or square.

### 5. Arcade (no Meshy)
- Mini game: glowing targets/coins float round the bottle; tap to collect, score counts up,
  the bottle "levels up" with a burst at the end.
- Interactive / Sensor Games. People at a booth will actually play it.
- Needs: nothing external (procedural); maybe a coin/target sound.

## Meshy (meshy.ai) notes

- Colour rule (2026-11-13, after the first headset): REAL product colours (white / black
  tech), brand on the DETAILS. An all-green model on the green board + teal bottle read as a
  dark blob. White body = reads as real tech and pops; lime #9BE23B = thin accent lines;
  deep green #1C552A = soft parts (straps, cushions, grips); black gloss = screens/visors.
- One shared style line on every prompt so the set matches:
  `clean premium consumer-tech product design, glossy white plastic body, thin bright lime
  green accent lines, dark forest green soft parts, black gloss screens, rounded friendly
  shapes, soft studio lighting, isolated on a plain light grey background, no text, no logos`
- Text-to-3D is enough for these (no photos needed). Generate 2–4 variants, pick the cleanest.
- Meshy settings that worked (VR headset, 2026-11-12): symmetry ON, topology triangle,
  ~10k polycount, texture ON, **PBR OFF** (the app shades models with a matcap, so the PBR
  maps are thrown away anyway).
- Pipeline: download GLB -> `brand-assets/zeal/models/<name>-source.glb` (local only,
  git-ignored) -> `node scripts/optimize-model.mjs brand-assets/zeal/models/<name>-source.glb
  public/brands/zeal/models/<name>.glb` -> add `model: 'models/<name>.glb'` to the item in
  `src/brands/zeal/brand.js`. Keeps the FULL mesh (VR headset: 17.9 MB -> 2.3 MB, looks
  identical): every simplification tried (16k, 116k, 193k of 385k triangles) made the
  smooth shell lumpy / tore seams. The start screen preloads it (src/assets.js), so the
  size costs a few seconds on the Start button, not lag in AR.
  Size in the scene: `techOrbit.modelScale` (TUNE).
- Speckles when small (fixed 2026-11-13): Meshy's texture is a mosaic of hundreds of tiny
  islands packed edge to edge; mipmaps averaged white into the black visor and back. The
  app loads model textures without mipmaps (techOrbit.js), and the script median-cleans
  the texture lightly (clean=3) to drop baked-in scratches.
- Models (2026-11-13): VR headset DONE (`vr-headset.glb`, full 385k mesh, 2.2 MB: its glossy
  shell showed lumps at any reduction); game controller DONE (`game-controller.glb`, 40% of
  553k = 220k triangles, 2.2 MB: identical to full at board size, so halve big models when a
  side-by-side shows no difference); robot DONE (`robot.glb`, 40% of 366k = 146k triangles,
  985 KB). Meshy ignored the 10k polycount every time. On the info board a model stands ON
  the top edge (a tall one hung over the text when centred). Camera DONE (`camera.glb`, 20%
  of 1.04M = 208k triangles, 1.7 MB; ours looks cleaner than the source). In orbit models
  SWAY ±35° (modelSwayDeg) instead of spinning: AI models' backs are weak (the camera's is
  a busy panel), being generated from a front view. Interactive wall DONE
  (`interactive-wall.glb`, full 278k triangles, 1.7 MB, `erode` 1: Meshy atlas gaps showed
  as white cracks on its black screen), replacing the gesture hand.
- FINAL (2026-11-13): the orbit shows only the 5 modelled services (VR, Interactive Walls,
  AI Photobooth, VR Games, Robotics), 72° apart, ordered so the VR pair isn't adjacent; the
  AR / Gesture / Sensor badges stay printed (Scan still reads all 8).
- Draft prompts (style line appended to each):
  - VR headset: `compact VR headset with a soft strap`
  - Game controller: `modern game controller, chunky buttons`
  - Robot (orbit): `tiny friendly robot head-and-body, round eyes`
  - Photobooth camera: `retro instant camera, big lens`
  - Interactive wall: `freestanding interactive touchscreen kiosk, glowing touch ripple`
  - Robot Buddy (rig + animate): `small friendly bipedal robot, big round head, short legs,
    T-pose` → Meshy rigging → animations: idle, walk, wave, jump

## Built

- Typography: Lift & Spin (ZEAL), **Logo** (Z mark lifts off, turntable over the cap, tap =
  home), Spin (whole label), Callouts, Ticker.
- Effects: Glow, Spotlight, Energy, Scan (8 services), Sparkle.
- Elements: Tech Orbit (badge coins; Meshy models can replace them per item).
- Start screen: 3D bottle built from the sticker art.
- Polish (2026-11-13, from device shots #3/#4): models sized by their MIDDLE dimension (by the
  largest, the wide headset looked big, the tall wall small; per-item `size` tweaks by eye);
  depth scale subtle (1.1 / 0.9); no orbit line. Tap: the model hovers spinning above the cap,
  the other four shrink back into their prints, and a curved glass panel on the body over the
  logo shows the name + a ~6-word pitch (the old board above the cap crowded the top and read
  blurry: small type on a small card).
- Entry + glow (2026-11-13): sizes MEASURED (screen area averaged over a full spin, equalised;
  the wall covered ~2x the others) into each item's `size`; one badge->slot path with the
  holder on a damped spring (springHz/springDamping: soft overshoot); each model is born as a
  lime scan-line hologram that materializes bottom->top while spinning fast then settling; lime
  fresnel rim glow on every model (rimGlow). Shader patch: patchHolo in techOrbit.js.
