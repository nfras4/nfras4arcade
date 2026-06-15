<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import * as THREE from 'three';
  import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
  import {
    NODE_ROOT, NODE_HEAD, NODE_JAW,
    NODE_EYE_L, NODE_EYE_R,
    NODE_BROW_L, NODE_BROW_R,
    NODE_ANCHOR_CROWN, NODE_ANCHOR_BROW, NODE_ANCHOR_MOUTH,
    NODE_HAND_L, NODE_HAND_R,
    EXPRESSION_POSES,
    JAW_MAX_TALK_RAD, JAW_CLAMP_MAX_RAD, JAW_LERP_FACTOR,
    HEAD_BOB_DEG_PER_AMP, SWEAT_TREMOR_DEG, SWEAT_TREMOR_HZ,
    EXPR_LERP_FACTOR,
    HEAD_RADIUS, HEAD_SQUASH, FACE_PLATE_RADIUS, MUZZLE_RADIUS,
    EAR_PARAMS, INNER_EAR_PARAMS, EYE_RADIUS,
    CREAM_COLOUR,
    type ExpressionName, type HatId,
  } from './core/rig.js';

  // ── Props ────────────────────────────────────────────────────────────────────
  let {
    furColor = '#8B5E3C',
    expression = 'neutral' as ExpressionName,
    talkAmplitude = 0,
    hat = 'none' as HatId,
    idle = false,
  }: {
    furColor?: string;
    expression?: ExpressionName;
    talkAmplitude?: number;
    hat?: HatId;
    /** When true, layer subtle ambient idle motion (breathing, look-around
     *  sway, blink) on top of the pose. Suppressed while talking or asleep,
     *  and disabled under reduced motion. */
    idle?: boolean;
  } = $props();

  // ── Reduced-motion detection (listener in $effect with cleanup) ──────────────
  const rmQuery =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  let reducedMotion = $state(rmQuery?.matches ?? false);

  $effect(() => {
    if (!rmQuery) return;
    const handler = (e: MediaQueryListEvent) => { reducedMotion = e.matches; };
    rmQuery.addEventListener('change', handler);
    return () => rmQuery.removeEventListener('change', handler);
  });

  // ── Material helper ───────────────────────────────────────────────────────────
  // Flat shading gives the faceted papercraft look on fur/cream masses.
  // Eyes and the mouth line opt out: they read better smooth and glossy.
  function mat(color: string | number, roughness = 1, flat = true): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, flatShading: flat, roughness, metalness: 0 });
  }

  // ── GPU resource disposal helper ─────────────────────────────────────────────
  // Called before removing a hat group to prevent geometry/material leaks.
  function disposeGroup(group: THREE.Group | null): void {
    if (!group) return;
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      const m = (obj as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) m.dispose();
    });
  }

  // ── Build the full rig hierarchy ─────────────────────────────────────────────
  // All objects built once; $effect handles reactive updates to colour and hats.

  const root = new THREE.Group();
  root.name = NODE_ROOT;

  // Head group (look-at and reaction rotations).
  const headGroup = new THREE.Group();
  headGroup.name = NODE_HEAD;
  root.add(headGroup);

  // Cranium: low-poly sphere, squashed slightly wider than tall.
  // Bounding height ~1.1 keeps the Phase 0 seat/camera framing valid.
  const headMat = mat(0xffffff);
  const headGeo = new THREE.SphereGeometry(HEAD_RADIUS, 12, 9);
  headGeo.scale(HEAD_SQUASH[0], HEAD_SQUASH[1], HEAD_SQUASH[2]);
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.name = 'HeadMesh';
  headGroup.add(headMesh);

  // Cream face plate: flattened sphere hugging the front of the cranium,
  // framing eyes and muzzle (the reference art's lighter face mask).
  const faceMat = mat(CREAM_COLOUR);
  const faceGeo = new THREE.SphereGeometry(FACE_PLATE_RADIUS, 11, 8);
  faceGeo.scale(1.05, 0.95, 0.40);
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  faceMesh.name = 'FacePlate';
  faceMesh.position.set(0, -0.02, 0.36);
  headGroup.add(faceMesh);

  // ── Ears: oversized Mickey-style discs, the marketable silhouette. ───────────
  const earMat = mat(0xffffff);
  const earGeoBase = new THREE.CylinderGeometry(
    EAR_PARAMS[0], EAR_PARAMS[1], EAR_PARAMS[2], EAR_PARAMS[3]
  );
  // Default cylinder axis is Y. rotateX(PI/2) tips it so the axis becomes Z,
  // making the flat disc faces point toward and away from the camera.
  earGeoBase.rotateX(Math.PI / 2);

  const earXOff = HEAD_RADIUS * HEAD_SQUASH[0] + 0.02;
  const earY    = 0.30;

  const earL = new THREE.Mesh(earGeoBase, earMat);
  earL.name = 'EarL';
  earL.position.set(-earXOff, earY, 0);
  headGroup.add(earL);

  const earR = new THREE.Mesh(earGeoBase.clone(), earMat.clone());
  earR.name = 'EarR';
  earR.position.set(earXOff, earY, 0);
  headGroup.add(earR);

  // Inner ears: cream inset in front of outer disc.
  const innerEarMat = mat(CREAM_COLOUR);
  const innerEarGeo = new THREE.CylinderGeometry(
    INNER_EAR_PARAMS[0], INNER_EAR_PARAMS[1], INNER_EAR_PARAMS[2], INNER_EAR_PARAMS[3]
  );
  innerEarGeo.rotateX(Math.PI / 2);

  const innerEarZ = EAR_PARAMS[2] / 2 + 0.01;

  const innerEarL = new THREE.Mesh(innerEarGeo, innerEarMat);
  innerEarL.position.set(-earXOff, earY, innerEarZ);
  headGroup.add(innerEarL);

  const innerEarR = new THREE.Mesh(innerEarGeo.clone(), innerEarMat.clone());
  innerEarR.position.set(earXOff, earY, innerEarZ);
  headGroup.add(innerEarR);

  // Ear spirals: thin dark tube tracing an Archimedean spiral on the cream
  // inset (the reference art's swirl). Chirality mirrors left/right.
  class SpiralCurve extends THREE.Curve<THREE.Vector3> {
    sign: 1 | -1;
    constructor(sign: 1 | -1) { super(); this.sign = sign; }
    getPoint(t: number): THREE.Vector3 {
      const theta = t * 2.1 * Math.PI * 2;
      const r = 0.035 + t * 0.155;
      return new THREE.Vector3(Math.cos(theta) * r * this.sign, Math.sin(theta) * r, 0);
    }
  }
  // Spiral colour derives from furColor (darkened) in the reactive $effect.
  const spiralMat = mat(0xffffff, 1, false);
  const spiralZ   = innerEarZ + INNER_EAR_PARAMS[2] / 2 + 0.012;

  const spiralL = new THREE.Mesh(
    new THREE.TubeGeometry(new SpiralCurve(1), 48, 0.016, 5, false),
    spiralMat
  );
  spiralL.position.set(-earXOff, earY, spiralZ);
  headGroup.add(spiralL);

  const spiralR = new THREE.Mesh(
    new THREE.TubeGeometry(new SpiralCurve(-1), 48, 0.016, 5, false),
    spiralMat
  );
  spiralR.position.set(earXOff, earY, spiralZ);
  headGroup.add(spiralR);

  // ── Muzzle: cream ellipsoid protruding at mouth level. ───────────────────────
  // Smooth-shaded (no facets, no nostrils): flat shading here put distracting
  // seam lines around the nose; the muzzle should read as one soft cream mass.
  const muzzleMat = mat(CREAM_COLOUR, 1, false);
  const muzzleGeo = new THREE.SphereGeometry(MUZZLE_RADIUS, 12, 9);
  muzzleGeo.scale(1.25, 0.72, 0.75);
  const muzzleMesh = new THREE.Mesh(muzzleGeo, muzzleMat);
  muzzleMesh.name = 'MuzzleUpper';
  muzzleMesh.position.set(0, -0.24, 0.42);
  headGroup.add(muzzleMesh);

  // ── Dark mouth cavity: revealed when the jaw swings open. ────────────────────
  const mouthCavityMat = mat(0x140f0c);
  const mouthCavity    = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.24, 0.24, 1, 1, 1),
    mouthCavityMat
  );
  mouthCavity.name = 'MouthCavity';
  mouthCavity.position.set(0, -0.38, 0.40);
  headGroup.add(mouthCavity);

  // ── Jaw group: cream chin ellipsoid hinged at the back of the muzzle. ────────
  const jawGroup = new THREE.Group();
  jawGroup.name = NODE_JAW;
  // Hinge sits deep behind the muzzle: more chin drop per radian of jaw open.
  const JAW_BASE_Y = -0.355;
  jawGroup.position.set(0, JAW_BASE_Y, 0.16);
  headGroup.add(jawGroup);

  const jawMat = mat(CREAM_COLOUR);
  // Flat-ish top (y squash 0.5): a tall dome would occlude the cavity centre
  // and make the open mouth read as two dark corners instead of one window.
  const jawGeo = new THREE.SphereGeometry(0.26, 10, 7);
  jawGeo.scale(1.25, 0.5, 0.7);
  jawGeo.translate(0, -0.07, 0.26);
  const jawMesh = new THREE.Mesh(jawGeo, jawMat);
  jawMesh.name  = 'JawMesh';
  jawGroup.add(jawMesh);

  // Muppet-mouth interior: dark slab capping the chin dome so the open mouth
  // reads as one clean dark window instead of cream poking through the middle.
  // Hidden inside the muzzle when closed; tilts down with the jaw when open.
  const jawInterior = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.025, 0.32, 1, 1, 1),
    mat(0x140f0c)
  );
  jawInterior.name = 'JawInterior';
  jawInterior.position.set(0, 0.055, 0.28);
  jawGroup.add(jawInterior);

  // ── Eyes: big glossy black ovals, smooth-shaded, no separate pupil. ──────────
  const eyeXOff = 0.20;
  const eyeYPos = 0.14;
  const eyeZPos = 0.48;

  function makeEye(): THREE.Group {
    const g = new THREE.Group();
    g.scale.set(1, 1.3, 0.55);
    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(EYE_RADIUS, 14, 10),
      mat(0x080808, 0.15, false)
    ));
    return g;
  }

  const eyeLGroup = makeEye();
  eyeLGroup.name = NODE_EYE_L;
  eyeLGroup.position.set(-eyeXOff, eyeYPos, eyeZPos);
  headGroup.add(eyeLGroup);

  const eyeRGroup = makeEye();
  eyeRGroup.name = NODE_EYE_R;
  eyeRGroup.position.set(eyeXOff, eyeYPos, eyeZPos);
  headGroup.add(eyeRGroup);

  // ── Brows: small rounded bars riding just above the eyes. ────────────────────
  const browGeo = new RoundedBoxGeometry(0.14, 0.04, 0.045, 2, 0.018);
  const browMat = mat(0x3a2510);
  const browBaseY = 0.32;

  const browLGroup = new THREE.Group();
  browLGroup.name = NODE_BROW_L;
  browLGroup.position.set(-eyeXOff, browBaseY, 0.42);
  browLGroup.add(new THREE.Mesh(browGeo, browMat));
  headGroup.add(browLGroup);

  const browRGroup = new THREE.Group();
  browRGroup.name = NODE_BROW_R;
  browRGroup.position.set(eyeXOff, browBaseY, 0.42);
  browRGroup.add(new THREE.Mesh(browGeo.clone(), browMat.clone()));
  headGroup.add(browRGroup);

  // ── Anchor groups ─────────────────────────────────────────────────────────────
  const anchorCrown = new THREE.Group();
  anchorCrown.name = NODE_ANCHOR_CROWN;
  anchorCrown.position.set(0, HEAD_RADIUS * HEAD_SQUASH[1] + 0.01, 0);
  headGroup.add(anchorCrown);

  const anchorBrow = new THREE.Group();
  anchorBrow.name = NODE_ANCHOR_BROW;
  anchorBrow.position.set(0, browBaseY + 0.06, eyeZPos);
  headGroup.add(anchorBrow);

  const anchorMouth = new THREE.Group();
  anchorMouth.name = NODE_ANCHOR_MOUTH;
  anchorMouth.position.set(0, -0.30, 0.68);
  headGroup.add(anchorMouth);

  // ── Sweat droplet prop ────────────────────────────────────────────────────────
  // Pale blue-white smooth sphere stretched into a drop shape.
  // Anchored at the right temple, outside the head silhouette.
  // 0.10 radius reads at table distance; teardrop stretch 1.5x on Y.
  const sweatDropGeo = new THREE.SphereGeometry(0.10, 10, 8);
  sweatDropGeo.scale(1.0, 1.5, 1.0); // taller than wide for teardrop silhouette

  // Pull the top vertex up to suggest a point (move the topmost vertex cluster).
  // The simplest approach: after scale the top ring is already narrowed; nudge
  // the peak vertex up slightly for the teardrop tip.
  const sweatPosAttr = sweatDropGeo.attributes.position;
  let topY = -Infinity;
  for (let i = 0; i < sweatPosAttr.count; i++) {
    const y = sweatPosAttr.getY(i);
    if (y > topY) topY = y;
  }
  for (let i = 0; i < sweatPosAttr.count; i++) {
    if (sweatPosAttr.getY(i) >= topY - 0.001) {
      sweatPosAttr.setY(i, sweatPosAttr.getY(i) + 0.05);
    }
  }
  sweatPosAttr.needsUpdate = true;
  sweatDropGeo.computeVertexNormals();

  const sweatDropMesh = new THREE.Mesh(
    sweatDropGeo,
    mat(0xc8e8f5, 0.2, false)
  );
  sweatDropMesh.name = 'SweatDrop';
  // Outside the ear disc (head half-width ~0.62 + ear radius 0.40), forward of
  // it on Z so the camera at +Z doesn't lose it behind the ear.
  const SWEAT_BASE_X =  0.82;
  const SWEAT_BASE_Y =  0.40;
  const SWEAT_BASE_Z =  0.28;
  sweatDropMesh.position.set(SWEAT_BASE_X, SWEAT_BASE_Y, SWEAT_BASE_Z);
  sweatDropMesh.visible = false;
  sweatDropMesh.scale.set(0, 0, 0);
  headGroup.add(sweatDropMesh);

  // ── Exclamation mark prop ─────────────────────────────────────────────────────
  // Two primitives (stem + dot) parented to a group, floated above anchorCrown.
  const alertMat = mat(0xffd400, 0.5, true);

  const alertGroup = new THREE.Group();
  alertGroup.name = 'AlertGroup';

  // Stem: tall rounded box. Larger to read clearly at table distance.
  const alertStem = new THREE.Mesh(
    new RoundedBoxGeometry(0.16, 0.48, 0.16, 2, 0.04),
    alertMat
  );
  alertStem.position.set(0, 0.28, 0); // offset up so dot sits below
  alertGroup.add(alertStem);

  // Dot: sphere below the stem
  const alertDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 7),
    alertMat.clone()
  );
  alertDot.position.set(0, -0.10, 0);
  alertGroup.add(alertDot);

  // Float above anchorCrown, slightly closer than before so it sits in frame.
  alertGroup.position.set(0, 0.24, 0);
  alertGroup.visible = false;
  alertGroup.scale.set(0, 0, 0);
  anchorCrown.add(alertGroup);

  // ── Zzz sleep-effect props ────────────────────────────────────────────────────
  // Three staggered Z letters that drift upward and to the left above anchorCrown.
  // Each Z is built from three RoundedBoxGeometry bars: top, diagonal, bottom.
  // All three share a single yellow material (same as alertMat for consistency).

  const zzzMat = mat(0xffd400, 0.5, true);

  function buildZGroup(): THREE.Group {
    const g = new THREE.Group();
    // Top bar
    const topBar = new THREE.Mesh(
      new RoundedBoxGeometry(0.16, 0.035, 0.035, 2, 0.008),
      zzzMat.clone()
    );
    topBar.position.set(0, 0.07, 0);
    g.add(topBar);
    // Diagonal bar: rotated so it goes from top-right to bottom-left
    const diagBar = new THREE.Mesh(
      new RoundedBoxGeometry(0.20, 0.035, 0.035, 2, 0.008),
      zzzMat.clone()
    );
    diagBar.position.set(0, 0, 0);
    diagBar.rotation.z = -0.6;
    g.add(diagBar);
    // Bottom bar
    const botBar = new THREE.Mesh(
      new RoundedBoxGeometry(0.16, 0.035, 0.035, 2, 0.008),
      zzzMat.clone()
    );
    botBar.position.set(0, -0.07, 0);
    g.add(botBar);
    return g;
  }

  // Base position relative to anchorCrown: slightly upper-left above the head.
  const ZZZ_BASE_X = -0.20;
  const ZZZ_BASE_Y =  0.05;

  const zGroups: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const zg = buildZGroup();
    zg.position.set(ZZZ_BASE_X, ZZZ_BASE_Y, 0);
    zg.visible = false;
    zg.scale.set(0, 0, 0);
    anchorCrown.add(zg);
    zGroups.push(zg);
  }

  // ── Hands: hidden by default. ────────────────────────────────────────────────
  const handGeo  = new THREE.BoxGeometry(0.32, 0.24, 0.14, 1, 1, 1);
  const handMat  = mat(0xffffff);
  const handRMat = mat(0xffffff);

  const handLGroup = new THREE.Group();
  handLGroup.name = NODE_HAND_L;
  handLGroup.visible = false;
  handLGroup.position.set(-0.8, -0.7, 0);
  handLGroup.add(new THREE.Mesh(handGeo, handMat));
  root.add(handLGroup);

  const handRGroup = new THREE.Group();
  handRGroup.name = NODE_HAND_R;
  handRGroup.visible = false;
  handRGroup.position.set(0.8, -0.7, 0);
  handRGroup.add(new THREE.Mesh(handGeo.clone(), handRMat));
  root.add(handRGroup);

  // ── Hat builders ─────────────────────────────────────────────────────────────
  function buildPartyHat(): THREE.Group {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.44, 7, 1),
      mat(0xd43fa0)
    );
    cone.position.y = 0.22;
    g.add(cone);
    const pom = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 4),
      mat(0xf5e040)
    );
    pom.position.y = 0.46;
    g.add(pom);
    return g;
  }

  function buildCrownHat(): THREE.Group {
    const g    = new THREE.Group();
    const gold = mat(0xd4a017);
    const cyl  = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.14, 8, 1),
      gold
    );
    cyl.position.y = 0.07;
    g.add(cyl);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.18, 5, 1),
        gold.clone()
      );
      spike.position.set(Math.sin(angle) * 0.18, 0.22, Math.cos(angle) * 0.18);
      g.add(spike);
    }
    return g;
  }

  // Dark felt top hat: wide brim disc, tall crown cylinder, thin band ring.
  function buildTopHat(): THREE.Group {
    const g    = new THREE.Group();
    const felt = mat(0x1a1a1a);
    // Wide brim disc
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.04, 24, 1),
      felt.clone()
    );
    brim.position.y = 0.02;
    g.add(brim);
    // Crown cylinder sits atop the brim
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.5, 24, 1),
      felt.clone()
    );
    crown.position.y = 0.04 + 0.25; // brim height + half crown height
    g.add(crown);
    // Thin hat band just above the brim
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.56, 0.06, 24, 1),
      mat(0x3a2f1c)
    );
    band.position.y = 0.04 + 0.03; // sits just above brim surface
    g.add(band);
    return g;
  }

  // Knitted beanie: hemisphere cap tinted from fur colour, cream cuff ring.
  function buildBeanieHat(): THREE.Group {
    const g = new THREE.Group();
    // Hemisphere: thetaLength = PI/2 gives the upper half of the sphere.
    const capColour = new THREE.Color(furColor).multiplyScalar(0.7);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(capColour.getHex())
    );
    cap.position.y = 0.0;
    g.add(cap);
    // Cream cuff ring at the base of the cap
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.64, 0.64, 0.12, 24, 1),
      mat(0xe8d8a8)
    );
    cuff.position.y = 0.06; // centred at the equator of the hemisphere
    g.add(cuff);
    return g;
  }

  // Straw sombrero: shallow cone crown, wide brim, dark hat band.
  function buildSombreroHat(): THREE.Group {
    const g    = new THREE.Group();
    const straw = mat(0xc9a866);
    // Wide flat brim disc
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 0.04, 32, 1),
      straw.clone()
    );
    brim.position.y = 0.02;
    g.add(brim);
    // Shallow cone crown sits at centre of the brim
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 0.35, 20, 1),
      straw.clone()
    );
    crown.position.y = 0.04 + 0.175; // brim height + half cone height
    g.add(crown);
    // Hat band at the base of the crown
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.06, 20, 1),
      mat(0x8b4513)
    );
    band.position.y = 0.04 + 0.03; // just above brim surface
    g.add(band);
    return g;
  }

  function buildWizardHat(): THREE.Group {
    const g = new THREE.Group();
    const purple = mat(0x5b3a9e);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), purple);
    brim.position.y = 0.02;
    g.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.64, 18), purple.clone());
    cone.position.y = 0.34;
    cone.rotation.z = 0.08;
    g.add(cone);
    const star = mat(0xf5d020, 0.4, true);
    const starPos: [number, number, number][] = [[0.06, 0.30, 0.20], [-0.08, 0.46, 0.16], [0.02, 0.58, 0.12]];
    for (const [x, y, z] of starPos) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), star.clone());
      s.position.set(x, y, z);
      g.add(s);
    }
    return g;
  }

  function buildCowboyHat(): THREE.Group {
    const g = new THREE.Group();
    const tan = mat(0x8a5a2b);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.80, 0.80, 0.04, 24), tan);
    brim.position.y = 0.02;
    brim.scale.z = 0.78;
    g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.40, 0.34, 16), tan.clone());
    crown.position.y = 0.21;
    g.add(crown);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), tan.clone());
    dome.position.y = 0.36;
    dome.scale.set(1, 0.5, 1);
    g.add(dome);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.06, 16), mat(0x4a2e16));
    band.position.y = 0.07;
    g.add(band);
    return g;
  }

  function buildHalo(): THREE.Group {
    const g = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffcc33, emissiveIntensity: 0.7, flatShading: true, roughness: 0.4, metalness: 0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.05, 10, 28), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.52;
    g.add(ring);
    return g;
  }

  function buildHornsHat(): THREE.Group {
    const g = new THREE.Group();
    const red = mat(0xb0201c);
    const mk = (sx: number) => {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 12), red.clone());
      h.position.set(0.17 * sx, 0.13, 0.02);
      h.rotation.z = -0.4 * sx;
      h.rotation.x = -0.15;
      g.add(h);
    };
    mk(-1); mk(1);
    return g;
  }

  function buildPropellerCap(): THREE.Group {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd43f3f));
    dome.scale.set(1, 0.7, 1);
    g.add(dome);
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.43, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf5f5f5));
    stripe.scale.set(0.34, 0.71, 1.01);
    g.add(stripe);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), mat(0x2a6fb0));
    btn.position.y = 0.30;
    g.add(btn);
    const spinner = new THREE.Group();
    spinner.name = 'Propeller';
    spinner.position.y = 0.35;
    const bladeMat = mat(0x2a6fb0, 0.5, true);
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.02, 0.1, 2, 0.01), bladeMat.clone());
      blade.rotation.y = (i * Math.PI) / 2;
      spinner.add(blade);
    }
    g.add(spinner);
    return g;
  }

  function buildChefHat(): THREE.Group {
    const g = new THREE.Group();
    const white = mat(0xf5f5f5);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.28, 20), white);
    base.position.y = 0.14;
    g.add(base);
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.40, 16, 12), white.clone());
    puff.scale.set(1, 0.7, 1);
    puff.position.y = 0.42;
    g.add(puff);
    return g;
  }

  function buildGraduationCap(): THREE.Group {
    const g = new THREE.Group();
    const black = mat(0x1a1a1a);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.32, 0.14, 16), black);
    cap.position.y = 0.07;
    g.add(cap);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.04, 0.78), black.clone());
    board.position.y = 0.16;
    g.add(board);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0xe8b84b));
    btn.position.y = 0.19;
    g.add(btn);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6), mat(0xe8b84b));
    cord.position.set(0.28, 0.07, 0.28);
    g.add(cord);
    const tuft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.10, 8), mat(0xe8b84b));
    tuft.position.set(0.28, -0.05, 0.28);
    g.add(tuft);
    return g;
  }

  function buildVikingHelmet(): THREE.Group {
    const g = new THREE.Group();
    const steel = mat(0x9aa3ad);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2), steel);
    g.add(dome);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.07, 18), mat(0x6b727a));
    rim.position.y = 0.03;
    g.add(rim);
    const ivory = mat(0xe8e0c8);
    const mk = (sx: number) => {
      // Point horns up-and-slightly-out above the helmet, inboard of the
      // oversized ears so they read instead of hiding behind them.
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.36, 12), ivory.clone());
      horn.position.set(0.26 * sx, 0.24, 0.06);
      horn.rotation.z = -0.32 * sx;
      g.add(horn);
    };
    mk(-1); mk(1);
    return g;
  }

  function buildFlowerCrown(): THREE.Group {
    const g = new THREE.Group();
    const vine = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 24), mat(0x4a8a3a));
    vine.rotation.x = Math.PI / 2;
    vine.position.y = 0.05;
    g.add(vine);
    const colours = [0xe87ab0, 0xf5f5f5, 0x9a6fd0, 0xf2c14e, 0xe8675a];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(colours[i]));
      petal.scale.set(1, 0.55, 1);
      petal.position.set(Math.sin(a) * 0.42, 0.09, Math.cos(a) * 0.42);
      g.add(petal);
      const centre = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), mat(0xf5d020));
      centre.position.set(Math.sin(a) * 0.42, 0.13, Math.cos(a) * 0.42);
      g.add(centre);
    }
    return g;
  }

  function buildCatEars(): THREE.Group {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.03, 8, 24), mat(0x2a2a2a));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.06;
    g.add(band);
    const outer = new THREE.Color(furColor).multiplyScalar(0.85).getHex();
    const mk = (sx: number) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 12), mat(outer));
      ear.scale.z = 0.45;
      ear.position.set(0.19 * sx, 0.20, 0);
      ear.rotation.z = -0.18 * sx;
      g.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 12), mat(0xe87ab0));
      inner.scale.z = 0.4;
      inner.position.set(0.19 * sx, 0.20, 0.03);
      inner.rotation.z = -0.18 * sx;
      g.add(inner);
    };
    mk(-1); mk(1);
    return g;
  }

  function buildSantaHat(): THREE.Group {
    const g = new THREE.Group();
    const sub = new THREE.Group();
    sub.rotation.z = 0.4;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 16), mat(0xc0252b));
    cone.position.y = 0.30;
    sub.add(cone);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), mat(0xf5f5f5));
    pom.position.y = 0.62;
    sub.add(pom);
    g.add(sub);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.09, 8, 22), mat(0xf5f5f5));
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = 0.05;
    g.add(cuff);
    return g;
  }

  function buildBeretHat(): THREE.Group {
    const g = new THREE.Group();
    const sub = new THREE.Group();
    sub.rotation.z = 0.20;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 0.10, 22), mat(0x2a3a6a));
    disc.position.y = 0.06;
    sub.add(disc);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.40, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x2a3a6a));
    top.scale.set(1, 0.35, 1);
    top.position.y = 0.10;
    sub.add(top);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 6), mat(0x1a2444));
    stub.position.y = 0.18;
    sub.add(stub);
    g.add(sub);
    return g;
  }

  let activeHat: THREE.Group | null = null;
  let hatSpinner: THREE.Object3D | null = null;

  const HAT_BUILDERS: Partial<Record<HatId, () => THREE.Group>> = {
    party: buildPartyHat,
    crown: buildCrownHat,
    top_hat: buildTopHat,
    beanie: buildBeanieHat,
    sombrero: buildSombreroHat,
    wizard: buildWizardHat,
    cowboy: buildCowboyHat,
    halo: buildHalo,
    horns: buildHornsHat,
    propeller: buildPropellerCap,
    chef: buildChefHat,
    graduate: buildGraduationCap,
    viking: buildVikingHelmet,
    flower_crown: buildFlowerCrown,
    cat_ears: buildCatEars,
    santa: buildSantaHat,
    beret: buildBeretHat,
  };


  // ── Reactive prop handlers ────────────────────────────────────────────────────

  $effect(() => {
    headMat.color.set(furColor);
    earMat.color.set(furColor);
    earR.material = earMat;  // earR shares earMat so one set() covers both
    handMat.color.set(furColor);
    handRMat.color.set(furColor);
    // Ear spirals: darkened fur so they theme with the player colour.
    spiralMat.color.set(furColor).multiplyScalar(0.45);
    headMat.needsUpdate   = true;
    earMat.needsUpdate    = true;
    handMat.needsUpdate   = true;
    handRMat.needsUpdate  = true;
    spiralMat.needsUpdate = true;
  });

  $effect(() => {
    if (activeHat) { disposeGroup(activeHat); anchorCrown.remove(activeHat); activeHat = null; }
    hatSpinner = null;
    const builder = HAT_BUILDERS[hat];
    if (builder) {
      activeHat = builder();
      anchorCrown.add(activeHat);
      // Propeller cap exposes a named spinner group the frame loop rotates.
      hatSpinner = activeHat.getObjectByName('Propeller') ?? null;
    }
  });

  // ── Disposal on unmount ───────────────────────────────────────────────────────
  // The root is rendered via <T is={root}> in the template (NOT scene.add):
  // mounting imperatively onto the scene bypasses Threlte's parent transforms,
  // so a wrapping <T.Group position> would silently do nothing and every
  // monkey would stack at the origin. Threlte attaches/detaches the object;
  // this effect only disposes GPU resources.
  $effect(() => {
    return () => {
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    };
  });

  // ── Lerped pose state ─────────────────────────────────────────────────────────
  let curJaw        = 0;
  let curEyeScale   = 1.0;
  let curBrowOff    = 0;
  let curBrowPinch  = 0;
  let curHeadTilt   = 0;
  let curHeadPitch  = 0;
  let curHeadPull   = 0;
  let curMouthCurve = 0;
  let curMouthWave  = 0;
  let curMouthSkew  = 0;
  let elapsed       = 0;

  // ── Effect prop scale state ───────────────────────────────────────────────────
  // Each prop uses a two-phase lerp for a pop-in overshoot on grow, plain lerp
  // on shrink. dropPhase/alertPhase track whether we're in phase 0 (growing to
  // 1.08 overshoot) or phase 1 (settling from 1.08 to 1.0).
  let dropScale  = 0;
  let alertScale = 0;
  let dropPhase  = 0;  // 0 = growing, 1 = settling
  let alertPhase = 0;

  // Zzz: each Z animates on a staggered loop (period 2.4s, phase offsets 0/1/3/2/3).
  const ZZZ_PERIOD = 2.4;

  const EFFECT_LERP = 0.22;

  // ── Frame loop ────────────────────────────────────────────────────────────────
  useTask((delta) => {
    elapsed += delta;

    const pose = EXPRESSION_POSES[expression];
    const amp  = Math.max(0, Math.min(1, talkAmplitude));

    const jawTarget = Math.min(pose.jawRad + amp * JAW_MAX_TALK_RAD, JAW_CLAMP_MAX_RAD);

    if (reducedMotion) {
      curJaw        = jawTarget;
      curEyeScale   = pose.eyeScale;
      curBrowOff    = pose.browOffset;
      curBrowPinch  = pose.browPinch;
      curHeadTilt   = pose.headTiltDeg;
      curHeadPitch  = pose.headPitchDeg;
      curHeadPull   = pose.headPullBack;
      curMouthCurve = pose.mouthCurve;
      curMouthWave  = pose.mouthWave;
      curMouthSkew  = pose.mouthSkew;
    } else {
      curJaw        += (jawTarget          - curJaw)        * JAW_LERP_FACTOR;
      curEyeScale   += (pose.eyeScale      - curEyeScale)   * EXPR_LERP_FACTOR;
      curBrowOff    += (pose.browOffset    - curBrowOff)    * EXPR_LERP_FACTOR;
      curBrowPinch  += (pose.browPinch     - curBrowPinch)  * EXPR_LERP_FACTOR;
      curHeadTilt   += (pose.headTiltDeg   - curHeadTilt)   * EXPR_LERP_FACTOR;
      curHeadPitch  += (pose.headPitchDeg  - curHeadPitch)  * EXPR_LERP_FACTOR;
      curHeadPull   += (pose.headPullBack  - curHeadPull)   * EXPR_LERP_FACTOR;

      curMouthCurve += (pose.mouthCurve - curMouthCurve) * EXPR_LERP_FACTOR;
      curMouthWave  += (pose.mouthWave  - curMouthWave)  * EXPR_LERP_FACTOR;
      curMouthSkew  += (pose.mouthSkew  - curMouthSkew)  * EXPR_LERP_FACTOR;
    }

    // The lower face IS the mouth: the chin carries expression.
    //  curve > 0: chin tucks up and widens (content closed-mouth smile)
    //  curve < 0: chin narrows and cracks open a dark sliver (worry/frown)
    //  skew: chin tilts to one side (smirk)
    //  wave: chin tremble (anxious chatter), suppressed under reduced motion
    const frown = Math.max(0, -curMouthCurve);
    jawGroup.rotation.x = curJaw + frown * 0.20;
    jawGroup.position.y = JAW_BASE_Y + Math.max(0, curMouthCurve) * 0.03;
    jawGroup.scale.x    = 1 + curMouthCurve * 0.10;
    let chinTilt = -curMouthSkew * 0.12;
    if (!reducedMotion && curMouthWave > 0.02) {
      chinTilt += Math.sin(elapsed * 7 * Math.PI * 2) * curMouthWave * 0.02;
    }
    jawGroup.rotation.z = chinTilt;

    // Ambient idle motion: subtle breathing, slow look-around sway, and
    // periodic blinks so a still portrait feels alive. Suppressed while talking
    // (talk has its own bob) or asleep, and disabled under reduced motion.
    let blink = 1;
    let idleHeadPosY = 0;
    let idleHeadRotY = 0;
    let idleHeadRotZ = 0;
    if (idle && !reducedMotion && amp <= 0.05 && !pose.showZzz) {
      idleHeadPosY = Math.sin(elapsed * 1.1) * 0.012;
      idleHeadRotY = Math.sin(elapsed * 0.45) * 0.10;
      idleHeadRotZ = Math.sin(elapsed * 0.7 + 1.0) * 0.02;
      const BLINK_PERIOD = 4.0;
      const BLINK_DUR = 0.14;
      const tb = elapsed % BLINK_PERIOD;
      if (tb < BLINK_DUR) blink = 1 - Math.sin((tb / BLINK_DUR) * Math.PI) * 0.92;
    }

    eyeLGroup.scale.set(1, 1.3 * curEyeScale * blink, 0.55);
    eyeRGroup.scale.set(1, 1.3 * curEyeScale * blink, 0.55);

    browLGroup.position.y = browBaseY + curBrowOff;
    browRGroup.position.y = browBaseY + curBrowOff;
    browLGroup.rotation.z =  curBrowPinch;
    browRGroup.rotation.z = -curBrowPinch;

    const tiltRad   = (curHeadTilt  * Math.PI) / 180;
    const pitchRad  = (curHeadPitch * Math.PI) / 180;
    const pullUnits = curHeadPull * 0.008;

    let headRotZ   = tiltRad + idleHeadRotZ;
    // Pitch (chin-down nod) is the base X rotation; bob adds on top.
    let headRotX   = pitchRad;
    let headRotY   = idleHeadRotY;
    let headPosY   = idleHeadPosY;
    const headPosZ = -pullUnits;

    if (!reducedMotion) {
      if (pose.sweating) {
        const tremorRad = (SWEAT_TREMOR_DEG * Math.PI) / 180;
        headRotZ += Math.sin(elapsed * SWEAT_TREMOR_HZ * Math.PI * 2) * tremorRad;
      }
      if (amp > 0.01) {
        const bobRad = (amp * HEAD_BOB_DEG_PER_AMP * Math.PI) / 180;
        headRotX += Math.sin(elapsed * 4 * Math.PI) * bobRad * 0.25;
      }
    }

    headGroup.rotation.z = headRotZ;
    headGroup.rotation.x = headRotX;
    headGroup.rotation.y = headRotY;
    headGroup.position.z = headPosZ;
    headGroup.position.y = headPosY;

    // ── Effect prop animation ─────────────────────────────────────────────────
    const targetDrop  = pose.showSweatDrop ? 1 : 0;
    const targetAlert = pose.showAlert     ? 1 : 0;

    if (reducedMotion) {
      dropScale  = targetDrop;
      alertScale = targetAlert;
      dropPhase  = targetDrop > 0 ? 1 : 0;
      alertPhase = targetAlert > 0 ? 1 : 0;
    } else {
      // Sweat drop: two-phase lerp with overshoot on grow-in.
      if (targetDrop > 0) {
        if (dropPhase === 0) {
          // Phase 0: grow toward 1.08 (overshoot target)
          dropScale += (1.08 - dropScale) * EFFECT_LERP;
          if (dropScale >= 1.0) dropPhase = 1;
        } else {
          // Phase 1: settle from overshoot to 1.0
          dropScale += (1.0 - dropScale) * EFFECT_LERP;
        }
      } else {
        // Shrinking: plain lerp to 0, reset phase for next show
        dropScale += (0 - dropScale) * EFFECT_LERP;
        if (dropScale < 0.01) { dropScale = 0; dropPhase = 0; }
      }

      // Exclamation mark: same two-phase logic.
      if (targetAlert > 0) {
        if (alertPhase === 0) {
          alertScale += (1.08 - alertScale) * EFFECT_LERP;
          if (alertScale >= 1.0) alertPhase = 1;
        } else {
          alertScale += (1.0 - alertScale) * EFFECT_LERP;
        }
      } else {
        alertScale += (0 - alertScale) * EFFECT_LERP;
        if (alertScale < 0.01) { alertScale = 0; alertPhase = 0; }
      }
    }

    // Apply scale + visibility
    sweatDropMesh.visible = dropScale > 0.01;
    sweatDropMesh.scale.set(dropScale, dropScale, dropScale);

    alertGroup.visible = alertScale > 0.01;
    alertGroup.scale.set(alertScale, alertScale, alertScale);

    // Idle motion when visible (skipped under reduced motion)
    if (!reducedMotion) {
      if (sweatDropMesh.visible) {
        sweatDropMesh.position.y = SWEAT_BASE_Y + Math.sin(elapsed * 3) * 0.015;
      }
      if (alertGroup.visible) {
        const alertBaseY = 0.24;
        alertGroup.position.y = alertBaseY + Math.sin(elapsed * 4) * 0.02;
        alertGroup.rotation.z = Math.sin(elapsed * 3) * 0.05;
      }
    }

    // ── Zzz sleep-effect animation ────────────────────────────────────────────
    const showZzz = !!pose.showZzz;

    if (reducedMotion) {
      // Static: all 3 Z's at fixed staggered positions, no animation.
      for (let i = 0; i < 3; i++) {
        const zg = zGroups[i];
        if (showZzz) {
          const staticScale = 0.7 + i * 0.15;  // Z0 small, Z1 mid, Z2 larger
          zg.scale.set(staticScale, staticScale, staticScale);
          zg.position.set(ZZZ_BASE_X - i * 0.06, ZZZ_BASE_Y + i * 0.18, 0);
          zg.visible = true;
        } else {
          zg.scale.set(0, 0, 0);
          zg.visible = false;
        }
      }
    } else {
      // Animated: staggered loop with drift, scale-up, and fade-out via scale taper.
      const PHASE_OFFSETS = [0, 1 / 3, 2 / 3];

      for (let i = 0; i < 3; i++) {
        const zg = zGroups[i];

        if (!showZzz) {
          // Lerp scale to 0 and hide once fully gone.
          const s = zg.scale.x;
          const next = s + (0 - s) * EFFECT_LERP;
          zg.scale.set(next, next, next);
          zg.visible = next > 0.01;
          continue;
        }

        // Compute this Z's position within its staggered period [0, 1).
        const rawT = ((elapsed / ZZZ_PERIOD) + PHASE_OFFSETS[i]) % 1;
        // t drives the lifecycle: 0=pop-in start, 1=end of cycle.
        const t = rawT;

        let s: number;
        let dx = 0;
        let dy = 0;

        if (t < 0.15) {
          // Pop-in: scale 0 -> 1.0
          s = t / 0.15;
          dx = 0;
          dy = 0;
        } else if (t < 0.85) {
          // Drift: float upward and left, grow gently from 1.0 to ~1.3
          const progress = (t - 0.15) / 0.70;
          s  = 1.0 + progress * 0.30;
          dx = -progress * 0.18;
          dy =  progress * 0.45;
        } else {
          // Fade-out: taper scale to 0
          const fadeProgress = (t - 0.85) / 0.15;
          s  = 1.3 * (1 - fadeProgress);
          // Keep position at drift-end during fade
          dx = -0.18;
          dy =  0.45;
        }

        zg.position.set(ZZZ_BASE_X + dx, ZZZ_BASE_Y + dy, 0);
        zg.scale.set(s, s, s);
        zg.visible = s > 0.01;
      }
    }

    // Spin the propeller cap's blades (no-op for every other hat).
    if (hatSpinner && !reducedMotion) {
      hatSpinner.rotation.y += delta * 6;
    }
  });
</script>

<!-- Attach the imperative rig under Threlte's tree so parent transforms apply. -->
<T is={root} />
