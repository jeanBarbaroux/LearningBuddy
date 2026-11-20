// Chat: lavender-grey tabby with pointed ears, green eyes, whiskers and a long curling tail. It purrs.
import * as THREE from 'three/webgpu';
import { RigBuilder, type CharacterRig, type EyeRig, type MoodUniforms } from '../rig';
import type { Pose } from '../pose';

const C = {
  fur: 0xa3a8cf,
  furLow: 0x737aa6,
  light: 0xf4f1fa,
  lightLow: 0xd8d2e8,
  stripe: 0x5b6190,
  pink: 0xffa6bb,
  pinkLow: 0xe9798f,
  iris: 0x86d64a,
  whisker: 0xffffff,
};

export function buildCat(mood: MoodUniforms): CharacterRig {
  const b = new RigBuilder(mood, 37);
  const root = b.group();
  const body = b.group();
  root.add(body);

  body.add(b.ball(0.45, C.fur, C.furLow, [0, 0.55, 0], [1, 1.08, 0.9]));
  body.add(b.ball(0.3, C.light, C.lightLow, [0, 0.52, 0.27], [1, 1.15, 0.55]));

  const head = b.group([0, 0.94, 0]);
  body.add(head);
  head.add(b.ball(0.58, C.fur, C.furLow, [0, 0.4, 0], [1.18, 0.92, 0.95]));
  for (const [x, tilt] of [[-0.13, 0.25], [0, 0], [0.13, -0.25]] as const) {
    const stripe = b.ball(0.07, C.stripe, C.stripe, [x, 0.86, 0.28], [0.55, 1.7, 0.6], 0);
    stripe.rotation.set(-0.5, 0, tilt);
    head.add(stripe);
  }

  for (const side of [-1, 1]) {
    head.add(b.ball(0.16, C.light, C.lightLow, [side * 0.08, 0.24, 0.46], [1.1, 0.85, 0.8]));
  }

  head.add(b.cone(0.05, 0.05, 3, C.pink, C.pinkLow, [0, 0.32, 0.6], [Math.PI / 2 + 0.4, 0, 0], b.plain));
  const whiskers = b.group([0, 0.26, 0.4]);
  for (const side of [-1, 1]) {
    for (const row of [-1, 0, 1]) {
      whiskers.add(b.mesh(b.paint(new THREE.BoxGeometry(0.34, 0.012, 0.012), C.whisker, C.whisker, 0), b.plain,
        [side * 0.4, row * 0.045, 0], 1, [0, side * 0.35, side * row * 0.14]));
    }
  }

  head.add(whiskers);

  const eyes = ([-1, 1] as const).map((side) => {
    const eye = b.eye(side, 0.155, C.iris, C.fur, C.furLow, { irisSize: 0.72 });
    eye.group.position.set(side * 0.25, 0.47, 0.44);
    head.add(eye.group);
    return eye.rig;
  }) as [EyeRig, EyeRig];

  const brows = ([-1, 1] as const).map((side) => {
    const brow = b.brow(side, [side * 0.25, 0.67, 0.5], 0.13, C.stripe);
    head.add(brow);
    return brow;
  }) as [THREE.Group, THREE.Group];

  const mouth = b.arcMouth(0.05, [0, 0.15, 0.61]);
  head.add(mouth.group);
  head.add(...b.cheekPair(0.38, 0.3, 0.44, 0.07));

  const ears = ([-1, 1] as const).map((side) => {
    const ear = b.group([side * 0.36, 0.74, 0]);
    ear.userData.baseZ = -side * 0.28;
    ear.add(b.cone(0.2, 0.36, 3, C.furLow, C.fur, [0, 0.16, 0], [0, Math.PI, 0]));
    ear.add(b.cone(0.11, 0.22, 3, C.pink, C.pinkLow, [0, 0.12, 0.07], [0, Math.PI, 0]));
    head.add(ear);
    return ear;
  }) as [THREE.Group, THREE.Group];

  const arms = ([-1, 1] as const).map((side) => {
    const arm = b.group([side * 0.4, 0.8, 0.05]);
    arm.add(b.ball(0.12, C.fur, C.light, [0, -0.2, 0], [0.85, 1.6, 0.85]));
    body.add(arm);
    return arm;
  }) as [THREE.Group, THREE.Group];

  const legs = ([-1, 1] as const).map((side) => {
    const leg = b.group([side * 0.2, 0.13, 0.08]);
    leg.userData.baseY = 0.13;
    leg.add(b.ball(0.12, C.light, C.lightLow, [0, -0.07, 0.06], [1.1, 0.6, 1.35]));
    root.add(leg);
    return leg;
  }) as [THREE.Group, THREE.Group];

  const tailMount = b.group([-0.22, 0.28, -0.28]);
  tailMount.rotation.y = 1.25;
  body.add(tailMount);
  const segments: THREE.Group[] = [];
  const baseAngles = [-1.25, 0.55, 0.5, 0.55];
  let parent: THREE.Object3D = tailMount;
  baseAngles.forEach((baseX, index) => {
    const segment = b.group(index === 0 ? [0, 0, 0] : [0, 0.24, 0]);
    segment.userData.baseX = baseX;
    const tip = index === baseAngles.length - 1;
    segment.add(b.mesh(b.paint(new THREE.CylinderGeometry(0.05, 0.065, 0.28, 5), tip ? C.stripe : C.fur, tip ? C.stripe : C.furLow), b.skin, [0, 0.12, 0]));
    parent.add(segment);
    segments.push(segment);
    parent = segment;
  });

  return {
    root,
    body,
    head,
    arms,
    legs,
    eyes,
    brows,
    mouth: mouth.rig,
    cheeks: b.cheeks,
    ears,
    tail: segments,
    top: 2.15,
    eyeHeight: 1.41,
    accent: 0xb9f27c,
    secondary(pose: Pose, time: number): void {
      // Whiskers twitch with the mouth and when happy.
      whiskers.rotation.z = Math.sin(time * 9) * 0.03 * Math.max(0, pose.smile) + pose.mouthOpen * 0.05;
      whiskers.position.y = 0.26 + pose.mouthOpen * 0.015;
    },
    dispose: () => b.dispose(),
  };
}
