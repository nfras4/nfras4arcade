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
    MOUTH_HALF_WIDTH, MOUTH_TUBE_RADIUS,
    CREAM_COLOUR,
    type ExpressionName, type HatId,
  } from './core/rig.js';

  // ── Props ────────────────────────────────────────────────────────────────────
  let {
    furColor = '#8B5E3C',
    expression = 'neutral' as ExpressionName,
    talkAmplitude = 0,
    hat = 'none' as HatId,
  }: {
    furColor?: string;
    expression?: ExpressionName;
    talkAmplitude?: number;
    hat?: HatId;
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

  const DARK_BROWN = 0x3b2314;

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

  // ── Mouth line: deformable dark tube on the muzzle front. ────────────────────
  // A straight tube along X whose ring vertices are displaced each frame by
  // three lerped params: curve (smile/frown parabola), wave (worried squiggle),
  // skew (one-sided smirk). This is what gives the mouth its dimensionality
  // beyond the jaw flap.
  const mouthMat = mat(DARK_BROWN, 0.85, false);
  const mouthGeo = new THREE.TubeGeometry(
    new THREE.LineCurve3(
      new THREE.Vector3(-MOUTH_HALF_WIDTH, 0, 0),
      new THREE.Vector3(MOUTH_HALF_WIDTH, 0, 0)
    ),
    32, MOUTH_TUBE_RADIUS, 5, false
  );
  mouthGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const mouthBasePos = (mouthGeo.attributes.position.array as Float32Array).slice();
  const mouthMesh = new THREE.Mesh(mouthGeo, mouthMat);
  mouthMesh.name = 'MouthLine';
  mouthMesh.position.set(0, -0.285, 0.633);
  headGroup.add(mouthMesh);

  function updateMouthShape(curve: number, wave: number, skew: number): void {
    const pos = mouthGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const bx = mouthBasePos[i * 3];
      const by = mouthBasePos[i * 3 + 1];
      const bz = mouthBasePos[i * 3 + 2];
      const t = (bx + MOUTH_HALF_WIDTH) / (2 * MOUTH_HALF_WIDTH); // 0..1 across mouth
      const c = 2 * t - 1;                                        // -1..1
      let dy = curve * 0.10 * (c * c - 0.5);      // parabola: ends up, centre down
      dy += wave * 0.020 * Math.sin(t * Math.PI * 3); // w-shaped wiggle
      dy += skew * 0.045 * c;                     // linear tilt: smirk
      const dz = -0.02 * c * c;                   // ends tuck back to hug the muzzle
      pos.setXYZ(i, bx, by + dy, bz + dz);
    }
    pos.needsUpdate = true;
  }

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
  jawGroup.position.set(0, -0.355, 0.16);
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

  let activeHat: THREE.Group | null = null;

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
    if (activeHat) { anchorCrown.remove(activeHat); activeHat = null; }
    if (hat === 'party') {
      activeHat = buildPartyHat();
      anchorCrown.add(activeHat);
    } else if (hat === 'crown') {
      activeHat = buildCrownHat();
      anchorCrown.add(activeHat);
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

  // Force the first updateMouthShape call even if the pose targets are zero.
  let mouthDirty = true;

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
      mouthDirty    = true;
    } else {
      curJaw        += (jawTarget          - curJaw)        * JAW_LERP_FACTOR;
      curEyeScale   += (pose.eyeScale      - curEyeScale)   * EXPR_LERP_FACTOR;
      curBrowOff    += (pose.browOffset    - curBrowOff)    * EXPR_LERP_FACTOR;
      curBrowPinch  += (pose.browPinch     - curBrowPinch)  * EXPR_LERP_FACTOR;
      curHeadTilt   += (pose.headTiltDeg   - curHeadTilt)   * EXPR_LERP_FACTOR;
      curHeadPitch  += (pose.headPitchDeg  - curHeadPitch)  * EXPR_LERP_FACTOR;
      curHeadPull   += (pose.headPullBack  - curHeadPull)   * EXPR_LERP_FACTOR;

      const dCurve = (pose.mouthCurve - curMouthCurve) * EXPR_LERP_FACTOR;
      const dWave  = (pose.mouthWave  - curMouthWave)  * EXPR_LERP_FACTOR;
      const dSkew  = (pose.mouthSkew  - curMouthSkew)  * EXPR_LERP_FACTOR;
      if (Math.abs(dCurve) > 1e-4 || Math.abs(dWave) > 1e-4 || Math.abs(dSkew) > 1e-4) {
        curMouthCurve += dCurve;
        curMouthWave  += dWave;
        curMouthSkew  += dSkew;
        mouthDirty = true;
      }
    }

    if (mouthDirty) {
      updateMouthShape(curMouthCurve, curMouthWave, curMouthSkew);
      mouthDirty = false;
    }

    jawGroup.rotation.x = curJaw;

    eyeLGroup.scale.set(1, 1.3 * curEyeScale, 0.55);
    eyeRGroup.scale.set(1, 1.3 * curEyeScale, 0.55);

    browLGroup.position.y = browBaseY + curBrowOff;
    browRGroup.position.y = browBaseY + curBrowOff;
    browLGroup.rotation.z =  curBrowPinch;
    browRGroup.rotation.z = -curBrowPinch;

    const tiltRad   = (curHeadTilt  * Math.PI) / 180;
    const pitchRad  = (curHeadPitch * Math.PI) / 180;
    const pullUnits = curHeadPull * 0.008;

    let headRotZ   = tiltRad;
    // Pitch (chin-down nod) is the base X rotation; bob adds on top.
    let headRotX   = pitchRad;
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
    headGroup.position.z = headPosZ;
  });
</script>

<!-- Attach the imperative rig under Threlte's tree so parent transforms apply. -->
<T is={root} />
