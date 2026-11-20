// Building blocks shared by every character: flat-shaded low-poly geometry painted with per-facet colour
// variations, a face rig (eyelids, irises, brows, mouth, cheeks) and the mapping from a Pose to the
// scene graph.
import * as THREE from 'three/webgpu';
import { dot, normalView, oneMinus, positionViewDirection, pow, saturate, uniform } from 'three/tsl';
import { clamp, type Pose } from './pose';

export function createMoodUniforms() {
  return { mood: uniform(new THREE.Color(0x4aa3ff)), glow: uniform(0.3) };
}

export type MoodUniforms = ReturnType<typeof createMoodUniforms>;

export type Vec3 = readonly [number, number, number];

export interface EyeRig {
  readonly side: -1 | 1;
  readonly lidPivot: THREE.Group;
  readonly upperLid: THREE.Mesh;
  readonly lowerLid: THREE.Mesh;
  readonly look: THREE.Group;
  readonly pupil: THREE.Object3D | null;
}

export interface MouthRig {
  apply(open: number, smile: number): void;
}

export interface CharacterRig {
  /** Posed as a whole (position, lean, turn). Feet rest at y = 0. */
  readonly root: THREE.Group;
  /** Squash and stretch pivot, at the feet. */
  readonly body: THREE.Group;
  /** Head pivot, at the neck. */
  readonly head: THREE.Group;
  /** Index 0 is on the viewer's left. */
  readonly arms: readonly [THREE.Group, THREE.Group];
  readonly legs: readonly [THREE.Group, THREE.Group];
  readonly eyes: readonly [EyeRig, EyeRig];
  readonly brows: readonly [THREE.Object3D, THREE.Object3D] | null;
  readonly mouth: MouthRig;
  readonly cheeks: THREE.Material;
  readonly ears: readonly [THREE.Group, THREE.Group] | null;
  readonly tail: readonly THREE.Group[];
  /** Height of the top of the head, where thought bubbles and Zzz appear. */
  readonly top: number;
  /** Height of the eyes, where tears start. */
  readonly eyeHeight: number;
  /** Colour of the character's own particles (sparkles…). */
  readonly accent: THREE.ColorRepresentation;
  /** Character-specific secondary motion (antenna, whiskers…). */
  secondary?(pose: Pose, time: number, dt: number): void;
  dispose(): void;
}

/** Small deterministic generator so a character always gets the same facet colours. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Creates the materials of one character and paints its geometry. */
export class RigBuilder {
  /** Fur, feathers or metal: vertex-coloured facets with a rim light tinted by the mood. */
  readonly skin: THREE.MeshStandardNodeMaterial;
  /** Same, visible from both sides (eyelids are open hemispheres). */
  readonly lid: THREE.MeshStandardNodeMaterial;
  /** Eyes, noses, beaks: no rim light. */
  readonly plain: THREE.MeshStandardNodeMaterial;
  /** Self-lit parts tinted by the mood (robot eyes, antenna). */
  readonly glow: THREE.MeshBasicNodeMaterial;
  readonly cheeks: THREE.MeshBasicNodeMaterial;
  private readonly random: () => number;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(mood: MoodUniforms, seed: number, options: { metalness?: number; roughness?: number } = {}) {
    this.random = seededRandom(seed);
    const fresnel = pow(oneMinus(saturate(dot(normalView, positionViewDirection))), 2.6);
    const rim = mood.mood.mul(fresnel).mul(mood.glow.mul(0.55).add(0.08));
    const metalness = options.metalness ?? 0;
    const roughness = options.roughness ?? 0.82;
    this.skin = new THREE.MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness, metalness });
    this.skin.emissiveNode = rim;
    this.lid = new THREE.MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness, metalness, side: THREE.DoubleSide });
    this.lid.emissiveNode = rim.mul(0.4);
    this.plain = new THREE.MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.35 });
    this.glow = new THREE.MeshBasicNodeMaterial();
    this.glow.colorNode = mood.mood.mul(mood.glow.mul(0.6).add(1.1));
    this.cheeks = new THREE.MeshBasicNodeMaterial({ color: 0xff6f9c, transparent: true, opacity: 0, depthWrite: false });
    this.disposables.push(this.skin, this.lid, this.plain, this.glow, this.cheeks);
  }

  /** Gives every triangle a colour: a vertical gradient from `bottom` to `top`, with a random shade. */
  paint(geometry: THREE.BufferGeometry, top: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation = top, jitter = 0.07): THREE.BufferGeometry {
    const painted = geometry.index ? geometry.toNonIndexed() : geometry;
    if (painted !== geometry) {
      geometry.dispose();
    }

    painted.computeBoundingBox();
    const box = painted.boundingBox!;
    const height = Math.max(1e-6, box.max.y - box.min.y);
    const positions = painted.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const high = new THREE.Color(top);
    const low = new THREE.Color(bottom);
    const facet = new THREE.Color();
    for (let vertex = 0; vertex + 2 < positions.count; vertex += 3) {
      const y = (positions.getY(vertex) + positions.getY(vertex + 1) + positions.getY(vertex + 2)) / 3;
      facet.copy(low).lerp(high, (y - box.min.y) / height);
      const shade = 1 + (this.random() * 2 - 1) * jitter;
      for (let corner = 0; corner < 3; corner += 1) {
        colors.set([facet.r * shade, facet.g * shade, facet.b * shade], (vertex + corner) * 3);
      }
    }

    painted.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    painted.computeVertexNormals();
    this.disposables.push(painted);
    return painted;
  }

  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, at: Vec3 = [0, 0, 0], scale: Vec3 | number = 1, rotation: Vec3 = [0, 0, 0]): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...at);
    if (typeof scale === 'number') {
      mesh.scale.setScalar(scale);
    } else {
      mesh.scale.set(...scale);
    }

    mesh.rotation.set(...rotation);
    return mesh;
  }

  /** Low-poly ball (icosphere) painted with a gradient. */
  ball(radius: number, top: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation = top, at: Vec3 = [0, 0, 0], scale: Vec3 | number = 1, detail = 1, material: THREE.Material = this.skin): THREE.Mesh {
    return this.mesh(this.paint(new THREE.IcosahedronGeometry(radius, detail), top, bottom), material, at, scale);
  }

  cone(radius: number, height: number, sides: number, top: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation = top, at: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0], material: THREE.Material = this.skin): THREE.Mesh {
    return this.mesh(this.paint(new THREE.ConeGeometry(radius, height, sides), top, bottom), material, at, 1, rotation);
  }

  group(at: Vec3 = [0, 0, 0], ...children: THREE.Object3D[]): THREE.Group {
    const group = new THREE.Group();
    group.position.set(...at);
    if (children.length > 0) {
      group.add(...children);
    }

    return group;
  }

  /** Eye with iris, pupil, highlights and two eyelids painted like the skin around it. */
  eye(side: -1 | 1, radius: number, iris: THREE.ColorRepresentation, lidTop: THREE.ColorRepresentation, lidBottom: THREE.ColorRepresentation, options: { glowing?: boolean; irisSize?: number } = {}): { group: THREE.Group; rig: EyeRig } {
    const group = new THREE.Group();
    const look = new THREE.Group();
    let pupil: THREE.Object3D | null = null;
    if (options.glowing) {
      group.add(this.mesh(new THREE.SphereGeometry(radius, 14, 10), this.glow));
      const spark = this.mesh(this.paint(new THREE.SphereGeometry(radius * 0.28, 8, 6), 0xffffff), this.plain, [0, 0, radius * 0.9], [1, 1, 0.4]);
      look.add(spark);
      pupil = spark;
    } else {
      const irisSize = options.irisSize ?? 0.64;
      group.add(this.mesh(this.paint(new THREE.SphereGeometry(radius, 14, 10), 0xffffff, 0xe4ebf4, 0.02), this.plain));
      const irisColor = new THREE.Color(iris);
      // Iris and pupil are flattened balls that just pierce the white and stay inside the closed lids.
      look.add(this.mesh(this.paint(new THREE.SphereGeometry(radius * irisSize, 12, 8), irisColor.clone().offsetHSL(0, 0, 0.08), irisColor.clone().multiplyScalar(0.55), 0.05), this.plain, [0, 0, radius * 0.75], [1, 1, 0.44]));
      pupil = this.mesh(this.paint(new THREE.SphereGeometry(radius * irisSize * 0.56, 10, 8), 0x0d1017, 0x0d1017, 0.02), this.plain, [0, 0, radius * 0.83], [1, 1, 0.7]);
      look.add(pupil);
      group.add(this.mesh(this.paint(new THREE.IcosahedronGeometry(radius * 0.12, 0), 0xffffff, 0xffffff, 0), this.plain, [radius * 0.31, radius * 0.35, radius * 0.87]));
      group.add(this.mesh(this.paint(new THREE.IcosahedronGeometry(radius * 0.06, 0), 0xffffff, 0xffffff, 0), this.plain, [-radius * 0.22, -radius * 0.26, radius * 0.94]));
    }

    group.add(look);
    const lidPivot = new THREE.Group();
    const upperLid = this.mesh(this.paint(new THREE.SphereGeometry(radius * 1.13, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), lidTop, lidBottom, 0.04), this.lid);
    const lowerLid = this.mesh(this.paint(new THREE.SphereGeometry(radius * 1.11, 14, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidTop, lidBottom, 0.04), this.lid);
    lidPivot.add(upperLid, lowerLid);
    group.add(lidPivot);
    return { group, rig: { side, lidPivot, upperLid, lowerLid, look, pupil } };
  }

  /** Curved mouth (smile or frown) and an open mouth that appears when talking, yawning or laughing. */
  arcMouth(width: number, at: Vec3, lineColor: THREE.ColorRepresentation = 0x3a2028): { group: THREE.Group; rig: MouthRig } {
    const group = this.group(at);
    const line = this.mesh(this.paint(new THREE.TorusGeometry(width, width * 0.2, 4, 10, Math.PI), lineColor, lineColor, 0.03), this.plain);
    const open = this.mesh(this.paint(new THREE.SphereGeometry(width * 0.95, 10, 6), 0x7a1f35, 0x3b0c1a, 0.05), this.plain);
    const tongue = this.mesh(this.paint(new THREE.SphereGeometry(width * 0.55, 8, 5), 0xff8a9c, 0xe2566f, 0.05), this.plain, [0, -width * 0.45, width * 0.35]);
    open.add(tongue);
    group.add(line, open);
    return {
      group,
      rig: {
        apply(openness: number, smile: number): void {
          const curve = clamp(smile, -1, 1);
          const depth = Math.max(0.2, Math.abs(curve));
          line.rotation.z = curve >= 0 ? Math.PI : 0;
          line.scale.set(1, depth, 1);
          line.position.y = (curve >= 0 ? 0.5 : -0.5) * width * depth;
          line.visible = openness < 0.3;
          open.visible = openness > 0.04;
          open.scale.set(0.85 + 0.25 * Math.max(0, curve), Math.max(0.05, openness) * 1.1, 0.45);
          open.position.y = -width * 0.35 * openness;
        },
      },
    };
  }

  /** Pink blush on both cheeks; its opacity follows Pose.blush. */
  cheekPair(x: number, y: number, z: number, radius: number): THREE.Mesh[] {
    return [-1, 1].map((side) => this.mesh(new THREE.SphereGeometry(radius, 10, 6), this.cheeks, [side * x, y, z], [1, 0.6, 0.35]));
  }

  brow(side: -1 | 1, at: Vec3, length: number, colorValue: THREE.ColorRepresentation): THREE.Group {
    const pivot = this.group(at);
    // A slightly arched, tapered stroke.
    const stroke = this.paint(new THREE.CapsuleGeometry(length * 0.13, length * 0.75, 2, 6), colorValue, colorValue, 0.05);
    pivot.add(this.mesh(stroke, this.plain, [0, 0, 0], [1, 1, 0.7], [0, side * 0.25, Math.PI / 2 - side * 0.12]));
    pivot.userData.baseY = at[1];
    return pivot;
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.disposables.length = 0;
  }
}

// Applying a pose ------------------------------------------------------------------------------------

const UPPER_LID_OPEN = -1.4;
const UPPER_LID_CLOSED = 0.12;
const LOWER_LID_OPEN = 1.4;

export function applyPose(rig: CharacterRig, pose: Pose, time: number, dt: number): void {
  rig.root.position.set(pose.x, pose.y, 0);
  rig.root.rotation.set(pose.pitch, pose.yaw, pose.lean, 'YXZ');
  const squash = clamp(pose.squash, 0.6, 1.5);
  const width = 1 / Math.sqrt(squash);
  rig.body.scale.set(width, squash, width);
  rig.head.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll, 'YXZ');

  const raises = [pose.armLRaise, pose.armRRaise];
  const swings = [pose.armLSwing, pose.armRSwing];
  rig.arms.forEach((arm, index) => {
    const side = index === 0 ? -1 : 1;
    arm.rotation.set(-swings[index]!, 0, side * raises[index]!, 'XZY');
  });

  const lifts = [pose.legLLift, pose.legRLift];
  rig.legs.forEach((leg, index) => {
    const lift = lifts[index]!;
    leg.rotation.x = -lift * 0.9;
    leg.position.y = (leg.userData.baseY as number) + Math.max(0, lift) * 0.07;
  });

  const opens = [pose.eyeOpenL, pose.eyeOpenR];
  rig.eyes.forEach((eye, index) => {
    const open = clamp(opens[index]!, 0, 1.2);
    eye.upperLid.rotation.x = UPPER_LID_CLOSED + (UPPER_LID_OPEN - UPPER_LID_CLOSED) * Math.min(1, open) - Math.max(0, open - 1) * 0.6;
    eye.lowerLid.rotation.x = LOWER_LID_OPEN - clamp(pose.squint, 0, 1) * 1.7;
    eye.lidPivot.rotation.z = -eye.side * clamp(pose.lidTilt, -1, 1) * 0.38;
    eye.look.rotation.set(-clamp(pose.lookY, -1, 1) * 0.38, clamp(pose.lookX, -1, 1) * 0.5, 0);
    if (eye.pupil) {
      eye.pupil.scale.x = pose.pupil;
      eye.pupil.scale.y = pose.pupil;
    }
  });

  rig.brows?.forEach((brow, index) => {
    const side = index === 0 ? -1 : 1;
    brow.position.y = (brow.userData.baseY as number) + pose.browY * 0.055;
    brow.rotation.z = -side * clamp(pose.browTilt, -1, 1) * 0.45;
  });

  rig.mouth.apply(clamp(pose.mouthOpen, 0, 1), pose.smile);
  rig.cheeks.opacity = clamp(pose.blush, 0, 1) * 0.75;

  const ears = [pose.earL, pose.earR];
  rig.ears?.forEach((ear, index) => {
    const side = index === 0 ? -1 : 1;
    ear.rotation.z = (ear.userData.baseZ as number) + side * clamp(ears[index]!, -1.2, 1) * 0.42;
  });

  rig.tail.forEach((segment, index) => {
    segment.rotation.y = pose.tailWag * (0.6 + index * 0.35);
    segment.rotation.x = Number(segment.userData.baseX ?? 0) - pose.tailRaise * 0.35;
  });

  rig.secondary?.(pose, time, dt);
}
