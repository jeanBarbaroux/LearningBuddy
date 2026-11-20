// Hibou: round, feathered, big amber eyes in pale facial discs, ear tufts that act like eyebrows.
import * as THREE from 'three/webgpu';
import { RigBuilder, type CharacterRig, type EyeRig, type MoodUniforms } from '../rig';

const C = {
  top: 0x67a6f5,
  mid: 0x417dd6,
  deep: 0x2a539c,
  belly: 0xf8eed8,
  bellyLow: 0xe2cca2,
  face: 0xeaf3fe,
  faceLow: 0xc6daf1,
  beak: 0xffbf3a,
  beakLow: 0xe9861a,
  brow: 0x1d3a70,
  iris: 0xffa51f,
};

export function buildOwl(mood: MoodUniforms): CharacterRig {
  const b = new RigBuilder(mood, 11);
  const root = b.group();
  const body = b.group();
  root.add(body);

  body.add(b.ball(0.5, C.mid, C.deep, [0, 0.56, 0], [1, 1.02, 0.9]));
  body.add(b.ball(0.36, C.belly, C.bellyLow, [0, 0.5, 0.25], [1, 1.12, 0.6]));
  // A few darker chevron feathers on the belly.
  for (const [x, y] of [[-0.1, 0.62], [0.1, 0.62], [0, 0.46], [-0.16, 0.38], [0.16, 0.38]] as const) {
    body.add(b.cone(0.045, 0.07, 3, 0xd8bf92, 0xc3a473, [x, y, 0.45], [Math.PI + 0.3, 0, 0], b.plain));
  }

  const head = b.group([0, 0.92, 0]);
  body.add(head);
  head.add(b.ball(0.6, C.top, C.mid, [0, 0.42, 0], [1.1, 0.95, 0.95]));
  const eyes = ([-1, 1] as const).map((side) => {
    head.add(b.ball(0.26, C.face, C.faceLow, [side * 0.25, 0.45, 0.39], [1, 1.05, 0.45]));
    const eye = b.eye(side, 0.18, C.iris, C.top, C.mid, { irisSize: 0.7 });
    eye.group.position.set(side * 0.25, 0.46, 0.47);
    head.add(eye.group);
    return eye.rig;
  }) as [EyeRig, EyeRig];

  const brows = ([-1, 1] as const).map((side) => {
    const brow = b.brow(side, [side * 0.25, 0.72, 0.56], 0.2, C.brow);
    head.add(brow);
    return brow;
  }) as [THREE.Group, THREE.Group];

  head.add(b.cone(0.085, 0.2, 4, C.beak, C.beakLow, [0, 0.32, 0.62], [Math.PI * 0.8, 0, 0], b.plain));
  const lowerBeak = b.group([0, 0.27, 0.58]);
  lowerBeak.add(b.cone(0.06, 0.12, 4, C.beakLow, 0xc86c10, [0, -0.02, 0.03], [Math.PI * 0.85, 0, 0], b.plain));
  head.add(lowerBeak);
  head.add(...b.cheekPair(0.43, 0.27, 0.42, 0.09));

  const ears = ([-1, 1] as const).map((side) => {
    const ear = b.group([side * 0.42, 0.8, 0.02]);
    ear.userData.baseZ = -side * 0.4;
    ear.add(b.cone(0.11, 0.38, 4, C.deep, C.top, [0, 0.17, 0], [0, Math.PI / 4, 0]));
    ear.add(b.cone(0.06, 0.24, 4, C.brow, C.deep, [side * 0.07, 0.1, -0.02], [0, Math.PI / 4, -side * 0.3]));
    head.add(ear);
    return ear;
  }) as [THREE.Group, THREE.Group];

  const arms = ([-1, 1] as const).map((side) => {
    const wing = b.group([side * 0.46, 0.8, 0]);
    wing.add(b.ball(0.27, C.mid, C.deep, [side * 0.03, -0.24, 0], [0.42, 1, 0.8]));
    wing.add(b.cone(0.07, 0.2, 4, C.deep, C.brow, [side * 0.05, -0.5, -0.02], [Math.PI, 0, side * 0.15]));
    body.add(wing);
    return wing;
  }) as [THREE.Group, THREE.Group];

  const legs = ([-1, 1] as const).map((side) => {
    const leg = b.group([side * 0.18, 0.12, 0.14]);
    leg.userData.baseY = 0.12;
    for (const toe of [-1, 0, 1]) {
      leg.add(b.ball(0.06, C.beak, C.beakLow, [toe * 0.06, -0.07, 0.08 + (toe === 0 ? 0.03 : 0)], [0.8, 0.55, 1.5], 0, b.plain));
    }

    root.add(leg);
    return leg;
  }) as [THREE.Group, THREE.Group];

  const tail = b.group([0, 0.3, -0.38]);
  tail.userData.baseX = -1.9;
  for (const angle of [-0.35, 0, 0.35]) {
    tail.add(b.cone(0.08, 0.32, 4, C.deep, C.mid, [Math.sin(angle) * 0.12, 0.14, 0], [0, 0, -angle]));
  }

  body.add(tail);

  const mouth = {
    apply(open: number): void {
      lowerBeak.rotation.x = open * 0.75;
    },
  };

  return {
    root,
    body,
    head,
    arms,
    legs,
    eyes,
    brows,
    mouth,
    cheeks: b.cheeks,
    ears,
    tail: [tail],
    top: 2.15,
    eyeHeight: 1.38,
    accent: 0xffc93c,
    dispose: () => b.dispose(),
  };
}
