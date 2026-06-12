<script lang="ts">
  import { useTask, useThrelte } from '@threlte/core';
  import * as THREE from 'three';
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
    HEAD_SIZE, MUZZLE_SIZE, JAW_SIZE, EAR_PARAMS, INNER_EAR_PARAMS,
    EYE_SPHERE_PARAMS, PUPIL_PARAMS, CREAM_COLOUR,
    type ExpressionName, type HatId,
  } from './rig.js';

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

  // ── Threlte context ──────────────────────────────────────────────────────────
  const { scene } = useThrelte();

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

  // ── Material helper (item 10) ─────────────────────────────────────────────────
  // MeshToonMaterial does not accept flatShading; use MeshStandardMaterial
  // with flatShading throughout. The faceted look comes from flat-shaded normals.
  function mat(color: string | number, roughness = 1): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness, metalness: 0 });
  }

  // ── Build the full rig hierarchy ─────────────────────────────────────────────
  // All objects built once; $effect handles reactive updates to colour and hats.

  const root = new THREE.Group();
  root.name = NODE_ROOT;

  // Head group (look-at and reaction rotations).
  const headGroup = new THREE.Group();
  headGroup.name = NODE_HEAD;
  root.add(headGroup);

  // Head mesh: box wider than tall (1.2:1).
  // Initialised with placeholder colour; $effect sets furColor reactively.
  const headMat = mat(0xffffff);
  const headMesh = new THREE.Mesh(
    new THREE.BoxGeometry(HEAD_SIZE[0], HEAD_SIZE[1], HEAD_SIZE[2], 1, 1, 1),
    headMat
  );
  headMesh.name = 'HeadMesh';
  headGroup.add(headMesh);

  // ── Ears (item 5): Mickey-style, cylinder axis along Z so disc faces camera. ──
  // Positioned at upper corners of head. From the front they read as two circles.
  const earMat = mat(0xffffff);
  const earGeoBase = new THREE.CylinderGeometry(
    EAR_PARAMS[0], EAR_PARAMS[1], EAR_PARAMS[2], EAR_PARAMS[3]
  );
  // Default cylinder axis is Y. rotateX(PI/2) tips it so the axis becomes Z,
  // making the flat disc faces point toward and away from the camera.
  earGeoBase.rotateX(Math.PI / 2);

  const earL = new THREE.Mesh(earGeoBase, earMat);
  earL.name = 'EarL';
  earL.position.set(-(HEAD_SIZE[0] / 2 + 0.01), 0.42, 0.1);
  headGroup.add(earL);

  const earR = new THREE.Mesh(earGeoBase.clone(), earMat.clone());
  earR.name = 'EarR';
  earR.position.set(HEAD_SIZE[0] / 2 + 0.01, 0.42, 0.1);
  headGroup.add(earR);

  // Inner ears: cream inset, a few mm in front of outer ear (item 5).
  const innerEarMat = mat(CREAM_COLOUR);
  const innerEarGeo = new THREE.CylinderGeometry(
    INNER_EAR_PARAMS[0], INNER_EAR_PARAMS[1], INNER_EAR_PARAMS[2], INNER_EAR_PARAMS[3]
  );
  innerEarGeo.rotateX(Math.PI / 2);

  const innerEarL = new THREE.Mesh(innerEarGeo, innerEarMat);
  innerEarL.position.set(
    -(HEAD_SIZE[0] / 2 + 0.01),
    0.42,
    0.1 + EAR_PARAMS[2] / 2 + 0.01
  );
  headGroup.add(innerEarL);

  const innerEarR = new THREE.Mesh(innerEarGeo.clone(), innerEarMat.clone());
  innerEarR.position.set(
    HEAD_SIZE[0] / 2 + 0.01,
    0.42,
    0.1 + EAR_PARAMS[2] / 2 + 0.01
  );
  headGroup.add(innerEarR);

  // ── Muzzle (item 1): shrunk and repositioned. ─────────────────────────────────
  // Top of muzzle sits just below the eye line; protrudes ~0.18 past head face.
  // Head front face is at HEAD_SIZE[2]/2 = 0.5.
  // Front face of muzzle = 0.5 + 0.18 = 0.68; muzzle centre Z = 0.68 - MUZZLE_SIZE[2]/2.
  const muzzleZ   = HEAD_SIZE[2] / 2 + 0.18 - MUZZLE_SIZE[2] / 2;
  const eyeYPos   = 0.12;
  const muzzleTopY    = eyeYPos - 0.06;
  const muzzleCentreY = muzzleTopY - MUZZLE_SIZE[1] / 2;

  const muzzleUpperMat = mat(CREAM_COLOUR);
  const muzzleUpper = new THREE.Mesh(
    new THREE.BoxGeometry(MUZZLE_SIZE[0], MUZZLE_SIZE[1], MUZZLE_SIZE[2], 1, 1, 1),
    muzzleUpperMat
  );
  muzzleUpper.name = 'MuzzleUpper';
  muzzleUpper.position.set(0, muzzleCentreY, muzzleZ);
  headGroup.add(muzzleUpper);

  // ── Dark mouth cavity (item 2): near-black inset below upper muzzle. ──────────
  // When the jaw opens a dark gap is revealed, making the flap legible at distance.
  const mouthCavityH   = 0.10;
  const mouthCavityMat = mat(0x140f0c);
  const mouthCavity    = new THREE.Mesh(
    new THREE.BoxGeometry(
      MUZZLE_SIZE[0] - 0.04,
      mouthCavityH,
      MUZZLE_SIZE[2] - 0.02,
      1, 1, 1
    ),
    mouthCavityMat
  );
  mouthCavity.name = 'MouthCavity';
  mouthCavity.position.set(
    0,
    muzzleCentreY - MUZZLE_SIZE[1] / 2 - mouthCavityH / 2,
    muzzleZ
  );
  headGroup.add(mouthCavity);

  // ── Jaw group (items 1+2): thin slab hinged at back edge. ────────────────────
  const jawGroup = new THREE.Group();
  jawGroup.name = NODE_JAW;
  const jawHingeY = mouthCavity.position.y - mouthCavityH / 2;
  const jawHingeZ = muzzleZ - MUZZLE_SIZE[2] / 2;
  jawGroup.position.set(0, jawHingeY, jawHingeZ);
  headGroup.add(jawGroup);

  // Geometry offset so the back-top edge sits at the hinge origin.
  const jawGeo = new THREE.BoxGeometry(JAW_SIZE[0], JAW_SIZE[1], JAW_SIZE[2], 1, 1, 1);
  jawGeo.translate(0, -JAW_SIZE[1] / 2, JAW_SIZE[2] / 2);
  const jawMat  = mat(CREAM_COLOUR);
  const jawMesh = new THREE.Mesh(jawGeo, jawMat);
  jawMesh.name  = 'JawMesh';
  jawGroup.add(jawMesh);

  // ── Eyes (items 3+4): 10x7 sphere, flattened on Z, pupils fixed. ─────────────
  // Pupil fix (item 3): CylinderGeometry default axis is Y; flat caps face +Y/-Y.
  // To make the disc face +Z (toward camera) we rotate the pupil mesh -90 deg
  // around X (so the +Y cap tilts to face +Z). The eye group's scale(1,1,0.45)
  // then compresses everything uniformly along Z. This is the correct approach:
  // the earlier rotateX(PI/2) on the geometry was being applied before the group
  // scale, causing the flattened cap to appear as a vertical slit.
  const eyeWhiteMat = mat(0xffffff, 0.3);

  const eyeXOff = 0.24;
  const eyeZPos = HEAD_SIZE[2] / 2 + 0.03;

  function makeEye(): THREE.Group {
    const g = new THREE.Group();
    g.scale.set(1, 1, 0.45);

    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(EYE_SPHERE_PARAMS[0], EYE_SPHERE_PARAMS[1], EYE_SPHERE_PARAMS[2]),
      eyeWhiteMat.clone()
    ));

    // Pupil disc: rotate mesh so the flat face looks toward +Z.
    const pupilGeo = new THREE.CylinderGeometry(
      PUPIL_PARAMS[0], PUPIL_PARAMS[0], PUPIL_PARAMS[1], PUPIL_PARAMS[2]
    );
    const pupil = new THREE.Mesh(pupilGeo, mat(0x111111));
    pupil.rotation.x = -Math.PI / 2;  // +Y cap now faces +Z
    pupil.position.z  = EYE_SPHERE_PARAMS[0] * 0.9;
    g.add(pupil);
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

  // ── Brows (item 6): lowered to +0.16 from eye centre. ────────────────────────
  const browGeo = new THREE.BoxGeometry(0.22, 0.06, 0.06, 1, 1, 1);
  const browMat = mat(0x3a2510);

  const browLGroup = new THREE.Group();
  browLGroup.name = NODE_BROW_L;
  browLGroup.position.set(-eyeXOff, eyeYPos + 0.16, eyeZPos - 0.01);
  browLGroup.add(new THREE.Mesh(browGeo, browMat));
  headGroup.add(browLGroup);

  const browRGroup = new THREE.Group();
  browRGroup.name = NODE_BROW_R;
  browRGroup.position.set(eyeXOff, eyeYPos + 0.16, eyeZPos - 0.01);
  browRGroup.add(new THREE.Mesh(browGeo.clone(), browMat.clone()));
  headGroup.add(browRGroup);

  // ── Anchor groups (item 11: crown gap reduced to near-scalp). ────────────────
  const anchorCrown = new THREE.Group();
  anchorCrown.name = NODE_ANCHOR_CROWN;
  anchorCrown.position.set(0, HEAD_SIZE[1] / 2 + 0.01, 0);
  headGroup.add(anchorCrown);

  const anchorBrow = new THREE.Group();
  anchorBrow.name = NODE_ANCHOR_BROW;
  anchorBrow.position.set(0, eyeYPos + 0.20, eyeZPos);
  headGroup.add(anchorBrow);

  const anchorMouth = new THREE.Group();
  anchorMouth.name = NODE_ANCHOR_MOUTH;
  anchorMouth.position.set(0, jawHingeY, muzzleZ + MUZZLE_SIZE[2] / 2 + 0.02);
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
    headMat.needsUpdate  = true;
    earMat.needsUpdate   = true;
    handMat.needsUpdate  = true;
    handRMat.needsUpdate = true;
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

  // ── Mount / unmount with geometry+material disposal ───────────────────────────
  $effect(() => {
    scene.add(root);
    return () => {
      scene.remove(root);
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
  let curJaw       = 0;
  let curEyeScale  = 1.0;
  let curBrowOff   = 0;
  let curBrowPinch = 0;
  let curHeadTilt  = 0;
  let curHeadPull  = 0;
  let elapsed      = 0;

  const browBaseY = eyeYPos + 0.16;

  // ── Frame loop ────────────────────────────────────────────────────────────────
  useTask((delta) => {
    elapsed += delta;

    const pose = EXPRESSION_POSES[expression];
    const amp  = Math.max(0, Math.min(1, talkAmplitude));

    const jawTarget = Math.min(pose.jawRad + amp * JAW_MAX_TALK_RAD, JAW_CLAMP_MAX_RAD);

    if (reducedMotion) {
      curJaw       = jawTarget;
      curEyeScale  = pose.eyeScale;
      curBrowOff   = pose.browOffset;
      curBrowPinch = pose.browPinch;
      curHeadTilt  = pose.headTiltDeg;
      curHeadPull  = pose.headPullBack;
    } else {
      curJaw       += (jawTarget         - curJaw)       * JAW_LERP_FACTOR;
      curEyeScale  += (pose.eyeScale     - curEyeScale)  * EXPR_LERP_FACTOR;
      curBrowOff   += (pose.browOffset   - curBrowOff)   * EXPR_LERP_FACTOR;
      curBrowPinch += (pose.browPinch    - curBrowPinch) * EXPR_LERP_FACTOR;
      curHeadTilt  += (pose.headTiltDeg  - curHeadTilt)  * EXPR_LERP_FACTOR;
      curHeadPull  += (pose.headPullBack - curHeadPull)  * EXPR_LERP_FACTOR;
    }

    jawGroup.rotation.x = curJaw;

    eyeLGroup.scale.set(1, curEyeScale, 0.45);
    eyeRGroup.scale.set(1, curEyeScale, 0.45);

    browLGroup.position.y = browBaseY + curBrowOff;
    browRGroup.position.y = browBaseY + curBrowOff;
    browLGroup.rotation.z =  curBrowPinch;
    browRGroup.rotation.z = -curBrowPinch;

    const tiltRad   = (curHeadTilt * Math.PI) / 180;
    const pullUnits = curHeadPull * 0.008;

    let headRotZ = tiltRad;
    let headRotX = 0;
    const headPosZ = -pullUnits;

    if (!reducedMotion) {
      if (pose.sweating) {
        const tremorRad = (SWEAT_TREMOR_DEG * Math.PI) / 180;
        headRotZ += Math.sin(elapsed * SWEAT_TREMOR_HZ * Math.PI * 2) * tremorRad;
      }
      if (amp > 0.01) {
        const bobRad = (amp * HEAD_BOB_DEG_PER_AMP * Math.PI) / 180;
        headRotX = Math.sin(elapsed * 4 * Math.PI) * bobRad * 0.25;
      }
    }

    headGroup.rotation.z = headRotZ;
    headGroup.rotation.x = headRotX;
    headGroup.position.z = headPosZ;
  });
</script>
