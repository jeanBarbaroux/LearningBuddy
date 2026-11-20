// Renard: orange fur, white muzzle and cheek tufts, dark-tipped ears and a big bushy tail.
import * as THREE from 'three/webgpu';
import { RigBuilder, type CharacterRig, type EyeRig, type MoodUniforms } from '../rig';

const C = {
  fur: 0xf6913c,
  furLow: 0xd9641c,
  white: 0xfff7ec,
  whiteLow: 0xefd9bf,
  dark: 0x3d2a25,
  darkLow: 0x241815,
  brow: 0x8c3d12,
  iris: 0xc8781a,
  nose: 0x1d1416,
};

export function buildFox(mood: MoodUniforms): CharacterRig {
  const b = new RigBuilder(mood, 23);
  const root = b.group();
  const body = b.group();
  root.add(body);

  body.add(b.ball(0.46, C.fur, C.furLow, [0, 0.56, 0], [1, 1.1, 0.9]));
  body.add(b.ball(0.3, C.white, C.whiteLow, [0, 0.62, 0.27], [1, 1.2, 0.55]));

  const head = b.group([0, 0.95, 0]);
  body.add(head);
  head.add(b.ball(0.56, C.fur, C.furLow, [0, 0.4, 0], [1.15, 0.92, 0.95]));
  for (const side of [-1, 1]) {
    head.add(b.ball(0.21, C.white, C.whiteLow, [side * 0.43, 0.24, 0.17], [1.15, 0.8, 0.9], 0));
  }

  head.add(b.ball(0.22, C.white, C.whiteLow, [0, 0.24, 0.42], [1.05, 0.78, 1.15]));
  head.add(b.ball(0.065, C.nose, C.nose, [0, 0.31, 0.67], [1.2, 0.85, 1], 0, b.plain));

  const eyes = ([-1, 1] as const).map((side) => {
    const eye = b.eye(side, 0.135, C.iris, C.fur, C.furLow);
    eye.group.position.set(side * 0.22, 0.47, 0.44);
    head.add(eye.group);
    return eye.rig;
  }) as [EyeRig, EyeRig];

  const brows = ([-1, 1] as const).map((side) => {
    const brow = b.brow(side, [side * 0.22, 0.64, 0.5], 0.15, C.brow);
    head.add(brow);
    return brow;
  }) as [THREE.Group, THREE.Group];

  const mouth = b.arcMouth(0.06, [0, 0.12, 0.64]);
  head.add(mouth.group);
  head.add(...b.cheekPair(0.36, 0.3, 0.44, 0.07));

  const ears = ([-1, 1] as const).map((side) => {
    const ear = b.group([side * 0.32, 0.78, -0.02]);
    ear.userData.baseZ = -side * 0.32;
    ear.add(b.cone(0.17, 0.46, 4, C.dark, C.fur, [0, 0.21, 0], [0, Math.PI / 4, 0]));
    ear.add(b.cone(0.09, 0.28, 4, C.white, C.whiteLow, [0, 0.15, 0.07], [0, Math.PI / 4, 0]));
    head.add(ear);
    return ear;
  }) as [THREE.Group, THREE.Group];

  const arms = ([-1, 1] as const).map((side) => {
    const arm = b.group([side * 0.4, 0.82, 0.05]);
    arm.add(b.ball(0.12, C.fur, C.dark, [0, -0.2, 0], [0.85, 1.65, 0.85]));
    body.add(arm);
    return arm;
  }) as [THREE.Group, THREE.Group];

  const legs = ([-1, 1] as const).map((side) => {
    const leg = b.group([side * 0.2, 0.14, 0.08]);
    leg.userData.baseY = 0.14;
    leg.add(b.ball(0.12, C.dark, C.darkLow, [0, -0.07, 0.06], [1.1, 0.62, 1.4]));
    root.add(leg);
    return leg;
  }) as [THREE.Group, THREE.Group];

  // The tail curls out on the viewer's right so it stays visible from the front.
  const tailMount = b.group([0.22, 0.32, -0.28]);
  tailMount.rotation.y = -1.25;
  body.add(tailMount);
  const segments: THREE.Group[] = [];
  const specs = [
    { radius: 0.19, length: 0.34, baseX: -1.15, top: C.fur, bottom: C.furLow },
    { radius: 0.24, length: 0.4, baseX: 0.55, top: C.fur, bottom: C.furLow },
    { radius: 0.18, length: 0.3, baseX: 0.45, top: C.white, bottom: C.whiteLow },
  ];
  let parent: THREE.Object3D = tailMount;
  for (const spec of specs) {
    const segment = b.group(parent === tailMount ? [0, 0, 0] : [0, (parent.userData.length as number) * 0.8, 0]);
    segment.userData.baseX = spec.baseX;
    segment.userData.length = spec.length;
    segment.add(b.ball(spec.radius, spec.top, spec.bottom, [0, spec.length * 0.5, 0], [1, 1.35, 1]));
    parent.add(segment);
    segments.push(segment);
    parent = segment;
  }

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
    top: 2.2,
    eyeHeight: 1.42,
    accent: 0xffd27a,
    dispose: () => b.dispose(),
  };
}
