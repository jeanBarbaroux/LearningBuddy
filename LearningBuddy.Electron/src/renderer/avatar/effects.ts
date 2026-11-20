// Low-poly particles that punctuate the companion's emotions: sparkles, confetti, hearts, Zzz, tears,
// sweat drops, anger marks, music notes, question and exclamation marks, dust puffs.
import * as THREE from 'three/webgpu';
import type { MoodUniforms, Vec3 } from './rig';

export type EffectKind =
  | 'sparkle'
  | 'star'
  | 'confetti'
  | 'heart'
  | 'z'
  | 'tear'
  | 'sweat'
  | 'anger'
  | 'note'
  | 'question'
  | 'exclaim'
  | 'puff';

export interface EmitOptions {
  /** Initial velocity, units per second. */
  readonly velocity?: Vec3;
  readonly life?: number;
  readonly size?: number;
  /** Units per second², negative pulls down. */
  readonly gravity?: number;
  /** Velocity kept after one second (0 … 1). */
  readonly drag?: number;
  readonly spin?: Vec3;
  /** Side-to-side sway amplitude, for floating particles. */
  readonly sway?: number;
  /** Fixed orientation (marks face the camera). */
  readonly rotation?: Vec3;
}

interface Particle {
  readonly mesh: THREE.Mesh;
  readonly kind: EffectKind;
  readonly origin: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly spin: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  gravity: number;
  drag: number;
  sway: number;
  phase: number;
}

const CONFETTI_COLORS = [0xff5d73, 0xffc93c, 0x4ade80, 0x38bdf8, 0xc084fc, 0xfb923c];
const MAX_PARTICLES = 140;

export class Effects {
  readonly group = new THREE.Group();
  private readonly geometries = new Map<EffectKind, THREE.BufferGeometry>();
  private readonly materials = new Map<EffectKind, THREE.Material>();
  private readonly confettiMaterials: THREE.Material[];
  private readonly live: Particle[] = [];
  private readonly spare = new Map<EffectKind, THREE.Mesh[]>();

  constructor(mood: MoodUniforms) {
    this.geometries.set('sparkle', new THREE.OctahedronGeometry(0.06, 0));
    this.geometries.set('star', extrude(starShape(0.1, 0.045), 0.03));
    this.geometries.set('confetti', new THREE.BoxGeometry(0.07, 0.035, 0.01));
    this.geometries.set('heart', extrude(heartShape(0.1), 0.04));
    this.geometries.set('z', extrude(zShape(0.09), 0.025));
    this.geometries.set('tear', dropGeometry(0.05));
    this.geometries.set('sweat', dropGeometry(0.065));
    this.geometries.set('anger', extrude(angerShape(0.09), 0.03));
    this.geometries.set('note', merge([
      transformed(new THREE.SphereGeometry(0.05, 8, 5), [0, 0, 0], [1.25, 0.9, 0.6], [0, 0, 0.35]),
      transformed(new THREE.BoxGeometry(0.018, 0.17, 0.018), [0.05, 0.085, 0]),
      transformed(new THREE.BoxGeometry(0.07, 0.022, 0.018), [0.08, 0.16, 0], 1, [0, 0, -0.5]),
    ]));
    this.geometries.set('question', merge([
      transformed(new THREE.TorusGeometry(0.07, 0.024, 4, 10, Math.PI * 1.35), [0, 0.12, 0], 1, [0, 0, -Math.PI * 0.35]),
      transformed(new THREE.BoxGeometry(0.045, 0.07, 0.045), [0, 0.02, 0]),
      transformed(new THREE.IcosahedronGeometry(0.032, 0), [0, -0.07, 0]),
    ]));
    this.geometries.set('exclaim', merge([
      transformed(new THREE.CylinderGeometry(0.04, 0.025, 0.22, 6), [0, 0.08, 0]),
      transformed(new THREE.IcosahedronGeometry(0.038, 0), [0, -0.1, 0]),
    ]));
    this.geometries.set('puff', new THREE.IcosahedronGeometry(0.09, 0));

    this.materials.set('sparkle', glowing(mood));
    this.materials.set('star', shiny(0xffd23f));
    this.materials.set('heart', shiny(0xff5c8d));
    this.materials.set('z', shiny(0xd8e6ff));
    this.materials.set('tear', shiny(0x6ec3ff, 0.5));
    this.materials.set('sweat', shiny(0xa5e6ff, 0.5));
    this.materials.set('anger', shiny(0xff3b3b));
    this.materials.set('note', shiny(0x2d3557, 0.15));
    this.materials.set('question', shiny(0xb48cff));
    this.materials.set('exclaim', shiny(0xffc93c));
    this.materials.set('puff', shiny(0xf2f5fb, 0.25));
    this.confettiMaterials = CONFETTI_COLORS.map((value) => shiny(value));
  }

  emit(kind: EffectKind, at: Vec3, options: EmitOptions = {}): void {
    if (this.live.length >= MAX_PARTICLES) {
      this.recycle(0);
    }

    const mesh = this.spare.get(kind)?.pop() ?? this.create(kind);
    if (kind === 'confetti') {
      mesh.material = this.confettiMaterials[Math.floor(Math.random() * this.confettiMaterials.length)]!;
    }

    mesh.position.set(...at);
    mesh.rotation.set(...(options.rotation ?? [0, 0, 0]));
    mesh.scale.setScalar(0.0001);
    mesh.visible = true;
    this.group.add(mesh);
    this.live.push({
      mesh,
      kind,
      origin: new THREE.Vector3(...at),
      velocity: new THREE.Vector3(...(options.velocity ?? [0, 0, 0])),
      spin: new THREE.Vector3(...(options.spin ?? [0, 0, 0])),
      age: 0,
      life: options.life ?? 1,
      size: options.size ?? 1,
      gravity: options.gravity ?? 0,
      drag: options.drag ?? 1,
      sway: options.sway ?? 0,
      phase: Math.random() * Math.PI * 2,
    });
  }

  /** Several particles flying outwards from `at`. */
  burst(kind: EffectKind, at: Vec3, count: number, speed: number, options: EmitOptions = {}): void {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.5;
      const lift = 0.4 + Math.random() * 0.8;
      const velocity: Vec3 = [
        Math.cos(angle) * speed * (0.6 + Math.random() * 0.5),
        lift * speed,
        Math.sin(angle) * speed * 0.4,
      ];
      this.emit(kind, at, {
        life: 0.9 + Math.random() * 0.5,
        spin: [Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4],
        ...options,
        velocity,
        size: (options.size ?? 1) * (0.7 + Math.random() * 0.5),
      });
    }
  }

  update(dt: number): void {
    for (let index = this.live.length - 1; index >= 0; index -= 1) {
      const particle = this.live[index]!;
      particle.age += dt;
      if (particle.age >= particle.life) {
        this.recycle(index);
        continue;
      }

      particle.velocity.y += particle.gravity * dt;
      particle.velocity.multiplyScalar(particle.drag ** dt);
      particle.origin.addScaledVector(particle.velocity, dt);
      const mesh = particle.mesh;
      mesh.position.copy(particle.origin);
      mesh.position.x += Math.sin(particle.age * 4 + particle.phase) * particle.sway;
      mesh.rotation.x += particle.spin.x * dt;
      mesh.rotation.y += particle.spin.y * dt;
      mesh.rotation.z += particle.spin.z * dt;
      const p = particle.age / particle.life;
      const grow = Math.min(1, particle.age / 0.14);
      const pop = grow < 1 ? grow * (1.25 - 0.25 * grow) : 1;
      const fade = p > 0.72 ? 1 - (p - 0.72) / 0.28 : 1;
      mesh.scale.setScalar(Math.max(0.0001, particle.size * pop * fade));
    }
  }

  clear(): void {
    while (this.live.length > 0) {
      this.recycle(this.live.length - 1);
    }
  }

  dispose(): void {
    this.clear();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.confettiMaterials.forEach((material) => material.dispose());
  }

  private create(kind: EffectKind): THREE.Mesh {
    const material = kind === 'confetti' ? this.confettiMaterials[0]! : this.materials.get(kind)!;
    return new THREE.Mesh(this.geometries.get(kind)!, material);
  }

  private recycle(index: number): void {
    const [particle] = this.live.splice(index, 1);
    if (!particle) {
      return;
    }

    particle.mesh.visible = false;
    this.group.remove(particle.mesh);
    const spare = this.spare.get(particle.kind) ?? [];
    spare.push(particle.mesh);
    this.spare.set(particle.kind, spare);
  }
}

function shiny(value: THREE.ColorRepresentation, emissive = 0.35): THREE.MeshStandardNodeMaterial {
  const base = new THREE.Color(value);
  return new THREE.MeshStandardNodeMaterial({
    color: base,
    emissive: base.clone().multiplyScalar(emissive),
    flatShading: true,
    roughness: 0.45,
  });
}

function glowing(mood: MoodUniforms): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = mood.mood.mul(1.5);
  return material;
}

function extrude(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  geometry.center();
  return geometry;
}

function starShape(outer: number, inner: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const angle = Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? outer : inner;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }

  shape.closePath();
  return shape;
}

function heartShape(size: number): THREE.Shape {
  const s = size;
  const shape = new THREE.Shape();
  shape.moveTo(0, -s);
  shape.bezierCurveTo(-s * 0.2, -s * 0.6, -s * 1.1, -s * 0.3, -s * 0.95, s * 0.25);
  shape.bezierCurveTo(-s * 0.85, s * 0.8, -s * 0.15, s * 0.85, 0, s * 0.35);
  shape.bezierCurveTo(s * 0.15, s * 0.85, s * 0.85, s * 0.8, s * 0.95, s * 0.25);
  shape.bezierCurveTo(s * 1.1, -s * 0.3, s * 0.2, -s * 0.6, 0, -s);
  return shape;
}

function zShape(size: number): THREE.Shape {
  const s = size;
  const t = s * 0.32;
  const points: [number, number][] = [
    [-s, s], [s, s], [s, s - t], [-s + t * 1.6, -s + t], [s, -s + t], [s, -s], [-s, -s], [-s, -s + t], [s - t * 1.6, s - t], [-s, s - t],
  ];
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
}

/** Four-armed burst: the manga "vein" sign of anger, readable at small sizes. */
function angerShape(size: number): THREE.Shape {
  const shape = new THREE.Shape();
  const arms = 4;
  for (let index = 0; index < arms * 2; index += 1) {
    const angle = Math.PI / 4 + (index * Math.PI) / arms;
    const radius = index % 2 === 0 ? size : size * 0.32;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }

  shape.closePath();
  return shape;
}

/** Sphere pinched upwards into a drop. */
function dropGeometry(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, 8, 6);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    if (y > 0) {
      const pinch = 1 - (y / radius) * 0.85;
      positions.setX(index, positions.getX(index) * pinch);
      positions.setZ(index, positions.getZ(index) * pinch);
      positions.setY(index, y * 1.6);
    }
  }

  geometry.computeVertexNormals();
  return geometry;
}

function transformed(geometry: THREE.BufferGeometry, at: Vec3, scale: Vec3 | number = 1, rotation: Vec3 = [0, 0, 0]): THREE.BufferGeometry {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...at),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

/** Concatenates the triangles of several geometries (positions and normals only). */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const count = flat.reduce((sum, part) => sum + part.getAttribute('position').count, 0);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  let offset = 0;
  for (const part of flat) {
    part.computeVertexNormals();
    const position = part.getAttribute('position');
    const normal = part.getAttribute('normal');
    for (let index = 0; index < position.count; index += 1) {
      positions.set([position.getX(index), position.getY(index), position.getZ(index)], (offset + index) * 3);
      normals.set([normal.getX(index), normal.getY(index), normal.getZ(index)], (offset + index) * 3);
    }

    offset += position.count;
  }

  parts.forEach((part) => part.dispose());
  flat.forEach((part) => part.dispose());
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return merged;
}
