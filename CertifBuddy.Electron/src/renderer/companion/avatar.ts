// Procedural 3D companion rendered with three.js (WebGPURenderer, WebGL2 fallback) and TSL materials.
// Each storyboard animation of the 2D avatar is reproduced as a procedural pose over time.
import * as THREE from 'three/webgpu';
import {
  color,
  dot,
  float,
  mix,
  mx_noise_float,
  normalView,
  oneMinus,
  positionLocal,
  positionViewDirection,
  pow,
  saturate,
  sin,
  smoothstep,
  time,
  uniform,
} from 'three/tsl';
import { animationDurationMs, AvatarAnimation, type AvatarAnimationId } from '../../core/avatarStoryboard';

const TAU = Math.PI * 2;

const MOOD_COLORS: Record<AvatarAnimationId, THREE.Color> = {
  idle: new THREE.Color(0x4aa3ff),
  move: new THREE.Color(0x4aa3ff),
  appear: new THREE.Color(0x9fd3ff),
  disappear: new THREE.Color(0x9fd3ff),
  request: new THREE.Color(0x35e0ff),
  think: new THREE.Color(0xb48cff),
  celebrate: new THREE.Color(0xffc93c),
  sleep: new THREE.Color(0x3b4f8f),
};

interface Eye {
  readonly group: THREE.Group;
  readonly pupil: THREE.Mesh;
}

export class CompanionAvatar {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly eyes: Eye[] = [];
  private readonly wings: THREE.Mesh[] = [];
  private readonly thinkingDots: THREE.Mesh[] = [];
  private readonly sparkles: THREE.Mesh[] = [];
  private readonly exclamation = new THREE.Group();
  private readonly hitTargets: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();

  private readonly glow = uniform(0.3);
  private readonly mood = uniform(new THREE.Color(MOOD_COLORS.idle));
  private readonly targetMood = new THREE.Color(MOOD_COLORS.idle);
  private targetGlow = 0.3;

  private animation: AvatarAnimationId | null = null;
  private animationStartedAt = 0;
  private questionDisplayed = false;

  private constructor(private readonly renderer: THREE.WebGPURenderer) {
    this.camera.position.set(0, 0.15, 7.9);
    this.camera.lookAt(0, 0.05, 0);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x203048, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.5, 3, 4);
    this.scene.add(key);
    this.buildModel();
    this.root.scale.setScalar(0.0001);
    this.scene.add(this.root);
  }

  static async create(canvas: HTMLCanvasElement): Promise<CompanionAvatar> {
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(window.devicePixelRatio);
    await renderer.init();
    const avatar = new CompanionAvatar(renderer);
    avatar.resize(canvas.clientWidth, canvas.clientHeight);
    renderer.setAnimationLoop(() => avatar.frame(performance.now()));
    return avatar;
  }

  /** Name of the active rendering backend, for diagnostics. */
  get backend(): string {
    const backend = (this.renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
    return backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  play(id: AvatarAnimationId): void {
    this.animation = id;
    this.animationStartedAt = performance.now();
    this.targetMood.copy(MOOD_COLORS[id]);
    this.targetGlow = id === AvatarAnimation.Celebrate ? 1.1
      : id === AvatarAnimation.Request ? 0.9
        : id === AvatarAnimation.Sleep ? 0.12
          : id === AvatarAnimation.Think ? 0.6 : 0.3;
  }

  setQuestionDisplayed(displayed: boolean): void {
    this.questionDisplayed = displayed;
  }

  /** Whether a point in normalized device coordinates hits the companion (for click-through). */
  hitTest(ndcX: number, ndcY: number): boolean {
    if (this.root.scale.x < 0.2) {
      return false;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return this.raycaster.intersectObjects(this.hitTargets, true).length > 0;
  }

  private buildModel(): void {
    const bodyMaterial = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.05 });
    // Feathered gradient tinted by the current mood, with a fresnel rim that glows with the emotion.
    const feathers = mx_noise_float(positionLocal.mul(7)).mul(0.08);
    const gradient = mix(color(0x1d4f9c), color(0x5aa9f5), smoothstep(-1.1, 1.2, positionLocal.y));
    bodyMaterial.colorNode = mix(gradient, this.mood, 0.25).add(feathers);
    const fresnel = pow(oneMinus(saturate(dot(normalView, positionViewDirection))), 2.6);
    bodyMaterial.emissiveNode = this.mood.mul(fresnel).mul(this.glow.add(0.15));

    const bellyMaterial = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
    const chevrons = smoothstep(0.35, 0.5, sin(positionLocal.y.mul(26).add(positionLocal.x.abs().mul(14))).mul(0.5).add(0.5));
    bellyMaterial.colorNode = mix(color(0xfdf4e3), color(0xe9d6b4), chevrons.mul(0.6));

    const eyeMaterial = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.25 });
    const pupilMaterial = new THREE.MeshStandardNodeMaterial({ color: 0x14171f, roughness: 0.1 });
    const beakMaterial = new THREE.MeshStandardNodeMaterial({ color: 0xffb02e, roughness: 0.4 });
    const accentMaterial = new THREE.MeshBasicNodeMaterial();
    // Pulsing emissive accent shared by the "!" signal, the thinking dots and the sparkles.
    accentMaterial.colorNode = this.mood.mul(float(1.1).add(sin(time.mul(8)).mul(0.25)));

    const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), bodyMaterial);
    bodyMesh.scale.set(1, 1.08, 0.92);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.72, 40, 24), bellyMaterial);
    belly.position.set(0, -0.2, 0.42);
    belly.scale.set(1, 1.05, 0.6);
    this.body.add(bodyMesh, belly);

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), bodyMaterial);
      wing.scale.set(0.45, 1, 0.8);
      wing.position.set(side * 0.95, -0.1, 0);
      wing.geometry.translate(0, -0.25, 0);
      this.wings.push(wing);
      this.body.add(wing);

      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), beakMaterial);
      foot.scale.set(1.3, 0.5, 1.4);
      foot.position.set(side * 0.35, -1.05, 0.25);
      this.body.add(foot);

      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 16), bodyMaterial);
      tuft.position.set(side * 0.55, 0.95, 0);
      tuft.rotation.z = -side * 0.45;
      this.head.add(tuft);

      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.36, 0.36, 0.78);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 24), eyeMaterial);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), pupilMaterial);
      pupil.position.z = 0.18;
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), eyeMaterial);
      shine.position.set(0.04, 0.05, 0.11);
      pupil.add(shine);
      eyeGroup.add(white, pupil);
      this.head.add(eyeGroup);
      this.eyes.push({ group: eyeGroup, pupil });
    }

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 16), beakMaterial);
    beak.position.set(0, 0.12, 0.95);
    beak.rotation.x = Math.PI / 2 + 0.35;
    this.head.add(beak);
    this.body.add(this.head);

    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 12), accentMaterial);
    bar.position.y = 0.25;
    const dotMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), accentMaterial);
    this.exclamation.add(bar, dotMesh);
    this.exclamation.position.set(1.05, 1.05, 0.2);
    this.exclamation.visible = false;

    for (let index = 0; index < 3; index += 1) {
      const thinkingDot = new THREE.Mesh(new THREE.SphereGeometry(0.06 + index * 0.025, 16, 12), accentMaterial);
      thinkingDot.visible = false;
      this.thinkingDots.push(thinkingDot);
      this.root.add(thinkingDot);
    }

    for (let index = 0; index < 8; index += 1) {
      const sparkle = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), accentMaterial);
      sparkle.visible = false;
      this.sparkles.push(sparkle);
      this.root.add(sparkle);
    }

    this.root.add(this.body, this.exclamation);
    this.hitTargets.push(this.body);
  }

  private frame(now: number): void {
    const t = (now - this.animationStartedAt) / 1000;
    this.resetPose(now / 1000);
    switch (this.animation) {
      case 'appear': this.poseAppear(t); break;
      case 'disappear': this.poseDisappear(t); break;
      case 'idle': this.poseIdle(now / 1000); break;
      case 'move': this.poseMove(t); break;
      case 'request': this.poseRequest(t); break;
      case 'think': this.poseThink(t); break;
      case 'celebrate': this.poseCelebrate(t); break;
      case 'sleep': this.poseSleep(t); break;
      case null: this.root.scale.setScalar(0.0001); break;
    }

    this.exclamation.visible ||= this.questionDisplayed && this.animation !== 'disappear';
    const moodValue = this.mood.value as THREE.Color;
    moodValue.lerp(this.targetMood, 0.08);
    this.glow.value += (this.targetGlow - this.glow.value) * 0.08;
    void this.renderer.render(this.scene, this.camera);
  }

  private resetPose(seconds: number): void {
    this.root.scale.setScalar(1);
    this.root.position.set(0, -0.15, 0);
    this.root.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    this.head.rotation.set(0, 0, 0);
    this.wings.forEach((wing, index) => {
      wing.rotation.set(0, 0, 0);
      wing.position.x = (index === 0 ? -1 : 1) * 0.95;
    });
    // Natural blink every ~3.6 s, overridden by sleeping poses.
    this.setEyesClosed(seconds % 3.6 < 0.12 ? 1 : 0);
    this.lookAt(0, 0);
    this.exclamation.visible = false;
    this.exclamation.scale.setScalar(1);
    this.thinkingDots.forEach((thinkingDot) => { thinkingDot.visible = false; });
    this.sparkles.forEach((sparkle) => { sparkle.visible = false; });
  }

  private poseAppear(t: number): void {
    const p = progress(t, AvatarAnimation.Appear);
    this.root.scale.setScalar(Math.max(0.0001, easeOutBack(p)));
    this.root.position.y = -0.15 - (1 - p) * 0.6;
  }

  private poseDisappear(t: number): void {
    const p = progress(t, AvatarAnimation.Disappear);
    this.root.scale.setScalar(Math.max(0.0001, 1 - easeInBack(p)));
    this.root.rotation.y = p * Math.PI;
  }

  private poseIdle(seconds: number): void {
    const breath = Math.sin((seconds * TAU) / 1.15);
    this.body.scale.set(1 - breath * 0.015, 1 + breath * 0.03, 1);
    this.root.rotation.z = Math.sin(seconds * 0.9) * 0.04;
    this.head.rotation.y = Math.sin(seconds * 0.5) * 0.12;
    this.lookAt(Math.sin(seconds * 0.5) * 0.5, 0);
  }

  private poseMove(t: number): void {
    const cycle = (t * 1000) / animationDurationMs(AvatarAnimation.Move);
    const hop = Math.abs(Math.sin(cycle * Math.PI));
    this.root.position.y += hop * 0.18;
    this.root.rotation.z = Math.sin(cycle * Math.PI) * 0.12;
    this.body.scale.set(1 + (1 - hop) * 0.05, 1 - (1 - hop) * 0.06, 1);
    this.flapWings(Math.sin(cycle * TAU) * 0.5 + 0.3);
  }

  private poseRequest(t: number): void {
    const p = progress(t, AvatarAnimation.Request);
    this.root.position.y += Math.sin(p * Math.PI) * 0.35;
    this.root.rotation.x = Math.sin(p * Math.PI) * 0.2;
    this.flapWings(0.9 * Math.sin(p * Math.PI));
    this.exclamation.visible = true;
    this.exclamation.scale.setScalar(easeOutBack(p));
    this.lookAt(0, 0.4);
  }

  private poseThink(t: number): void {
    const p = progress(t, AvatarAnimation.Think);
    const tilt = Math.sin(p * Math.PI);
    this.head.rotation.z = tilt * 0.3;
    this.root.rotation.z = tilt * 0.08;
    this.lookAt(0.6, 0.9);
    this.wings[1]!.rotation.z = tilt * 1.1;
    this.thinkingDots.forEach((thinkingDot, index) => {
      thinkingDot.visible = p > index * 0.2;
      thinkingDot.position.set(0.7 + index * 0.28, 1.15 + index * 0.25 + Math.sin(t * 6 + index) * 0.04, 0.2);
    });
  }

  private poseCelebrate(t: number): void {
    const p = progress(t, AvatarAnimation.Celebrate);
    this.root.position.y += Math.abs(Math.sin(p * TAU)) * 0.45;
    this.root.rotation.y = easeInOut(p) * TAU;
    this.flapWings(1.3 * Math.abs(Math.sin(p * TAU * 2)));
    this.setEyesClosed(0.55);
    this.sparkles.forEach((sparkle, index) => {
      const angle = (index / this.sparkles.length) * TAU;
      const radius = 0.6 + p * 1.1;
      sparkle.visible = p < 0.95;
      sparkle.position.set(Math.cos(angle) * radius, 0.4 + Math.sin(angle) * radius * 0.8, 0.3);
      sparkle.rotation.set(t * 8, t * 6, 0);
      sparkle.scale.setScalar(1 - p * 0.7);
    });
  }

  private poseSleep(t: number): void {
    const breath = Math.sin((t * TAU) / 3);
    this.body.scale.set(1 + breath * 0.02, 1 + breath * 0.04, 1);
    this.root.position.y -= 0.08;
    this.head.rotation.x = 0.18;
    this.head.rotation.z = 0.12;
    this.setEyesClosed(1);
  }

  private flapWings(amount: number): void {
    this.wings.forEach((wing, index) => {
      wing.rotation.z = (index === 0 ? -1 : 1) * amount;
    });
  }

  /** Squashes the eyes vertically: 0 = open, 1 = closed (a thin line). */
  private setEyesClosed(amount: number): void {
    for (const eye of this.eyes) {
      eye.group.scale.y = Math.max(0.08, 1 - amount);
    }
  }

  private lookAt(x: number, y: number): void {
    for (const eye of this.eyes) {
      eye.pupil.position.x = x * 0.08;
      eye.pupil.position.y = y * 0.08;
    }
  }
}

function progress(t: number, id: AvatarAnimationId): number {
  return Math.min(1, Math.max(0, (t * 1000) / animationDurationMs(id)));
}

function easeOutBack(p: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
}

function easeInBack(p: number): number {
  const c = 1.70158;
  return (c + 1) * p ** 3 - c * p ** 2;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}
