// Robot: teal metal body, dark visor with glowing eyes and LED mouth, a springy antenna and a pulsing
// core. Every glowing part takes the colour of its mood.
import * as THREE from 'three/webgpu';
import { clamp, type Pose } from '../pose';
import { RigBuilder, type CharacterRig, type EyeRig, type MoodUniforms } from '../rig';

const C = {
  metal: 0x86d8dc,
  metalLow: 0x4a97a6,
  dark: 0x1c2636,
  darkLow: 0x111824,
  steel: 0xc3ced9,
  steelLow: 0x8191a5,
};

export function buildRobot(mood: MoodUniforms): CharacterRig {
  const b = new RigBuilder(mood, 53, { metalness: 0.35, roughness: 0.5 });
  const root = b.group();
  const body = b.group();
  root.add(body);

  body.add(b.mesh(b.paint(new THREE.CylinderGeometry(0.4, 0.46, 0.64, 8), C.metal, C.metalLow), b.skin, [0, 0.56, 0]));
  body.add(b.mesh(b.paint(new THREE.BoxGeometry(0.38, 0.28, 0.06), C.dark, C.darkLow, 0.03), b.plain, [0, 0.6, 0.41]));
  const core = b.mesh(new THREE.IcosahedronGeometry(0.075, 0), b.glow, [0, 0.6, 0.45]);
  body.add(core);
  for (const x of [-0.3, 0.3]) {
    body.add(b.ball(0.035, C.steel, C.steelLow, [x, 0.8, 0.33], 1, 0, b.plain));
  }

  const head = b.group([0, 0.9, 0]);
  body.add(head);
  head.add(b.mesh(b.paint(new THREE.BoxGeometry(1.02, 0.74, 0.8, 2, 2, 2), C.metal, C.metalLow), b.skin, [0, 0.42, 0]));
  head.add(b.mesh(b.paint(new THREE.BoxGeometry(0.84, 0.48, 0.06), C.dark, C.darkLow, 0.03), b.plain, [0, 0.42, 0.39]));

  const eyes = ([-1, 1] as const).map((side) => {
    const eye = b.eye(side, 0.11, 0xffffff, C.dark, C.darkLow, { glowing: true });
    eye.group.position.set(side * 0.2, 0.47, 0.42);
    eye.group.scale.z = 0.35;
    head.add(eye.group);
    return eye.rig;
  }) as [EyeRig, EyeRig];

  const brows = ([-1, 1] as const).map((side) => {
    const brow = b.brow(side, [side * 0.2, 0.62, 0.44], 0.17, C.steel);
    head.add(brow);
    return brow;
  }) as [THREE.Group, THREE.Group];

  const leds = b.group([0, 0.28, 0.43]);
  const ledMeshes = [-2, -1, 0, 1, 2].map((index) => {
    const led = b.mesh(new THREE.BoxGeometry(0.045, 0.035, 0.02), b.glow, [index * 0.06, 0, 0]);
    leds.add(led);
    return led;
  });
  head.add(leds);
  head.add(...b.cheekPair(0.3, 0.3, 0.43, 0.055));

  const ears = ([-1, 1] as const).map((side) => {
    const ear = b.group([side * 0.52, 0.5, 0]);
    ear.userData.baseZ = -side * 1.0;
    ear.add(b.mesh(b.paint(new THREE.CylinderGeometry(0.03, 0.06, 0.24, 5), C.steel, C.steelLow), b.skin, [0, 0.12, 0]));
    ear.add(b.mesh(new THREE.IcosahedronGeometry(0.045, 0), b.glow, [0, 0.27, 0]));
    head.add(ear);
    return ear;
  }) as [THREE.Group, THREE.Group];

  const antenna = b.group([0, 0.79, 0]);
  antenna.add(b.mesh(b.paint(new THREE.CylinderGeometry(0.018, 0.028, 0.3, 5), C.steel, C.steelLow), b.skin, [0, 0.15, 0]));
  const bulb = b.mesh(new THREE.IcosahedronGeometry(0.075, 1), b.glow, [0, 0.33, 0]);
  antenna.add(bulb);
  head.add(antenna);

  const arms = ([-1, 1] as const).map((side) => {
    const arm = b.group([side * 0.5, 0.8, 0]);
    arm.add(b.mesh(b.paint(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 6), C.steel, C.steelLow), b.skin, [0, -0.15, 0]));
    arm.add(b.ball(0.1, C.metal, C.metalLow, [0, -0.34, 0], 1, 0));
    body.add(arm);
    return arm;
  }) as [THREE.Group, THREE.Group];

  const legs = ([-1, 1] as const).map((side) => {
    const leg = b.group([side * 0.2, 0.18, 0]);
    leg.userData.baseY = 0.18;
    leg.add(b.mesh(b.paint(new THREE.CylinderGeometry(0.065, 0.065, 0.14, 6), C.steel, C.steelLow), b.skin, [0, -0.05, 0]));
    leg.add(b.mesh(b.paint(new THREE.BoxGeometry(0.2, 0.08, 0.28), C.dark, C.darkLow), b.skin, [0, -0.14, 0.04]));
    root.add(leg);
    return leg;
  }) as [THREE.Group, THREE.Group];

  const mouth = {
    apply(open: number, smile: number): void {
      const curve = clamp(smile, -1, 1);
      ledMeshes.forEach((led, index) => {
        const offset = index - 2;
        led.position.y = curve * 0.014 * (offset * offset - 2);
        led.scale.y = 1 + open * (3.2 - Math.abs(offset) * 0.9);
      });
    },
  };

  // The antenna lags behind the head on a small spring.
  let antennaAngle = 0;
  let antennaSpeed = 0;

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
    tail: [],
    top: 2.15,
    eyeHeight: 1.37,
    accent: 0x7cf3ff,
    secondary(pose: Pose, time: number, dt: number): void {
      const target = -(pose.headRoll + pose.lean) * 0.9 + Math.sin(time * 2.3) * 0.05;
      antennaSpeed += ((target - antennaAngle) * 60 - antennaSpeed * 5) * dt;
      antennaAngle += antennaSpeed * dt;
      antenna.rotation.z = clamp(antennaAngle, -0.9, 0.9);
      const pulse = 1 + Math.sin(time * 4) * 0.12;
      core.scale.setScalar(pulse);
      bulb.scale.setScalar(1 + Math.max(0, Math.sin(time * 2.2)) * 0.25);
    },
    dispose: () => b.dispose(),
  };
}
