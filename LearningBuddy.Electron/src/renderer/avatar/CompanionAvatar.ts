// The companion character rendered with three.js (WebGPURenderer, WebGL2 fallback). It plays the
// animation chosen by the state machine and layers a personality on top: it follows the mouse with its
// eyes, blinks, fidgets when idle, reacts to strokes and tickles, gets tired at night, grows proud with a
// streak of good answers, sways when carried and turns towards where it walks.
import * as THREE from 'three/webgpu';
import { color, length, oneMinus, smoothstep, uniform, uv } from 'three/tsl';
import { DEFAULT_AVATAR_CHARACTER, type AvatarCharacterId } from '../../core/companion/avatarCharacters';
import { animationDurationMs, findAnimation, type AvatarAnimationId, type CompanionReaction } from '../../core/companion/avatarStoryboard';
import {
  CompanionMood,
  fatigueAt,
  MICRO_BEHAVIOR_DURATION_MS,
  MicroBehaviorScheduler,
  TouchGestureDetector,
  type MicroBehavior,
  type TouchReaction,
} from '../../core/companion/companionBehavior';
import { buildCharacter } from './characters';
import { choreograph, microBehavior, moodOverlay, touchReaction, type Stage } from './choreography';
import { Effects, type EffectKind, type EmitOptions } from './effects';
import { clamp, easePose, mixInto, neutralPose, resetPose } from './pose';
import { applyPose, createMoodUniforms, type CharacterRig, type Vec3 } from './rig';

const MOOD_COLORS: Record<AvatarAnimationId, number> = {
  idle: 0x4aa3ff,
  move: 0x4aa3ff,
  drag: 0x7fd8ff,
  appear: 0x9fd3ff,
  disappear: 0x9fd3ff,
  request: 0x35e0ff,
  wait: 0x5fc4ff,
  think: 0xb48cff,
  sad: 0x5b7bd6,
  happy: 0x6ef0a0,
  celebrate: 0xffc93c,
  sleep: 0x3b4f8f,
};

const MOOD_GLOW: Partial<Record<AvatarAnimationId, number>> = {
  request: 0.9,
  think: 0.6,
  sad: 0.2,
  happy: 0.8,
  celebrate: 1.1,
  sleep: 0.12,
  drag: 0.5,
};

const TOUCH_COLORS: Record<TouchReaction, THREE.Color | null> = {
  poke: null,
  pet: new THREE.Color(0xff8fc0),
  tickle: new THREE.Color(0xffd166),
  annoyed: new THREE.Color(0xff5a4f),
};
const ELATED_COLOR = new THREE.Color(0xffd75e);

/** Animations during which the spontaneous behaviours, the mood and the touch reactions may show. */
const RESTING = new Set<AvatarAnimationId>(['idle', 'wait', 'move']);

export interface AvatarOptions {
  readonly character?: AvatarCharacterId;
  /** Desktop companion: the feet touch the bottom edge of the view, so it can stand on the taskbar. */
  readonly grounded?: boolean;
}

/** Camera pitch, distance and the lowest visible point of the character (front of the feet). */
const CAMERA_PITCH = (7 * Math.PI) / 180;
const CAMERA_DISTANCE = 5.7;
const FEET_FRONT = { y: -0.05, z: 0.25 };

export class CompanionAvatar {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private readonly stage = new THREE.Group();
  private readonly moodUniforms = createMoodUniforms();
  private readonly effects = new Effects(this.moodUniforms);
  private readonly shadowStrength = uniform(0.35);
  private readonly raycaster = new THREE.Raycaster();
  private rig: CharacterRig;
  private character: AvatarCharacterId;

  private readonly pose = neutralPose();
  private readonly target = neutralPose();
  private readonly shown = neutralPose();
  private readonly targetMood = new THREE.Color(MOOD_COLORS.idle);
  private targetGlow = 0.3;

  private animation: AvatarAnimationId | null = null;
  private previousAnimation: AvatarAnimationId | null = null;
  private animationStartedAt = 0;
  private lastFrameAt = performance.now();
  private running = false;

  // Personality
  private readonly mood = new CompanionMood();
  private readonly scheduler = new MicroBehaviorScheduler();
  private readonly touch = new TouchGestureDetector();
  private micro: { kind: MicroBehavior; startedAt: number } | null = null;
  private nextMicroAt = performance.now() + 8000;
  private fatigue = fatigueAt(new Date());
  private fatigueCheckedAt = 0;
  private questionSince: number | null = null;
  private touchKind: TouchReaction | 'hover' | null = null;
  private touchWeight = 0;
  private hovering = false;

  // Attention: cursor offset from the character, in pixels (y downwards), and the size of its window.
  private cursor: { x: number; y: number } | null = null;
  private viewSize = 168;
  private cursorMovedAt = -Infinity;
  private cursorFarSince = performance.now();
  private window: { x: number; y: number; at: number } | null = null;
  private velocityX = 0;
  private velocityY = 0;

  // Small physics
  private dangle = 0;
  private dangleSpeed = 0;
  private bounce = 0;
  private bounceSpeed = 0;
  private spin = 0;
  private scale = 0.0001;

  // Eyes
  private nextBlinkAt = performance.now() + 2000;
  private blinkStartedAt = -Infinity;
  private doubleBlink = false;
  private saccade = { x: 0, y: 0 };
  private nextSaccadeAt = 0;

  // One-shot and periodic triggers of the choreography
  private readonly fired = new Set<string>();
  private readonly lastEvery = new Map<string, number>();

  private constructor(private readonly renderer: THREE.WebGPURenderer, options: AvatarOptions) {
    this.character = options.character ?? DEFAULT_AVATAR_CHARACTER;
    this.frameCamera(options.grounded ?? true);
    this.scene.add(new THREE.HemisphereLight(0xeaf3ff, 0x2a3550, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(2.5, 4, 5);
    const fill = new THREE.DirectionalLight(0xa9c4ff, 0.7);
    fill.position.set(-3.5, 1, 2);
    const rim = new THREE.DirectionalLight(0xffffff, 1.3);
    rim.position.set(0, 3, -4);
    this.scene.add(key, fill, rim);

    const shadowMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    shadowMaterial.colorNode = color(0x0b1020);
    shadowMaterial.opacityNode = this.shadowStrength.mul(oneMinus(smoothstep(0.15, 1, length(uv().sub(0.5)).mul(2))));
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    // Flattened in depth so it never reaches past the toes, where the grounded view is cut.
    shadow.scale.y = 0.45;
    shadow.position.y = 0.005;
    shadow.name = 'shadow';
    this.scene.add(shadow, this.stage, this.effects.group);

    this.rig = buildCharacter(this.character, this.moodUniforms);
    this.stage.add(this.rig.root);
    this.stage.scale.setScalar(0.0001);
  }

  static async create(canvas: HTMLCanvasElement, options: AvatarOptions = {}): Promise<CompanionAvatar> {
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    await renderer.init();
    const avatar = new CompanionAvatar(renderer, options);
    avatar.resize(canvas.clientWidth, canvas.clientHeight);
    avatar.setRunning(true);
    return avatar;
  }

  /** Name of the active rendering backend, for diagnostics. */
  get backend(): string {
    const backend = (this.renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
    return backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
  }

  get currentCharacter(): AvatarCharacterId {
    return this.character;
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      return;
    }

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.viewSize = Math.min(width, height);
  }

  /** Stops rendering while the view is hidden. */
  setRunning(running: boolean): void {
    if (running === this.running) {
      return;
    }

    this.running = running;
    this.lastFrameAt = performance.now();
    this.renderer.setAnimationLoop(running ? () => this.frame(performance.now()) : null);
  }

  dispose(): void {
    this.setRunning(false);
    this.effects.dispose();
    this.rig.dispose();
    this.renderer.dispose();
  }

  play(id: AvatarAnimationId): void {
    const now = performance.now();
    this.previousAnimation = this.animation;
    this.animation = id;
    this.animationStartedAt = now;
    this.fired.clear();
    this.targetMood.setHex(MOOD_COLORS[id]);
    this.targetGlow = MOOD_GLOW[id] ?? 0.3;
    if (!RESTING.has(id)) {
      this.micro = null;
    }

    if (this.previousAnimation === 'drag' && id !== 'drag') {
      this.land();
    }

    // The companion greets the user once it has appeared.
    if (this.previousAnimation === 'appear' && id === 'idle') {
      this.startMicro('wave', now);
    }
  }

  setQuestionDisplayed(displayed: boolean): void {
    if (displayed) {
      this.questionSince ??= performance.now();
    } else {
      this.questionSince = null;
    }
  }

  /** Remembers the outcome of a review so the mood follows the streak. */
  recordReaction(reaction: CompanionReaction): void {
    this.mood.record(reaction);
  }

  /** Swaps the character in a puff of smoke. */
  setCharacter(id: AvatarCharacterId): void {
    if (id === this.character) {
      return;
    }

    this.character = id;
    this.stage.remove(this.rig.root);
    this.rig.dispose();
    this.rig = buildCharacter(id, this.moodUniforms);
    this.stage.add(this.rig.root);
    applyPose(this.rig, this.shown, performance.now() / 1000, 0);
    if (this.scale > 0.2) {
      this.effects.burst('puff', [0, 0.9, 0.3], 9, 1.4, { gravity: 0, drag: 0.05, life: 0.6, size: 1.3 });
      this.effects.burst('sparkle', [0, 1.2, 0.3], 8, 1.8, { gravity: -1, drag: 0.2 });
      this.bounceSpeed -= 3;
      this.startMicro('wave', performance.now());
    }
  }

  /**
   * Position of the mouse relative to the centre of the character's view, in pixels (y downwards), and the
   * size of that view. Null when the mouse position is unknown.
   */
  lookAt(offset: { x: number; y: number } | null, viewSize = this.viewSize): void {
    const now = performance.now();
    if (offset && (!this.cursor || Math.hypot(offset.x - this.cursor.x, offset.y - this.cursor.y) > 1)) {
      this.cursorMovedAt = now;
      const distance = Math.hypot(offset.x, offset.y);
      const near = distance < viewSize * 1.6;
      // Coming back after a long absence earns a wave.
      if (near && now - this.cursorFarSince > 45_000 && this.animation === 'idle' && !this.micro) {
        this.startMicro('wave', now);
      }

      if (near) {
        this.cursorFarSince = now;
      }
    }

    this.cursor = offset;
    this.viewSize = viewSize;
  }

  /** Position of the companion window on screen, to know where it walks or is carried. */
  trackWindow(centerX: number, centerY: number): void {
    const now = performance.now();
    if (this.window) {
      const elapsed = (now - this.window.at) / 1000;
      if (elapsed > 0.001) {
        const vx = (centerX - this.window.x) / elapsed;
        const vy = (centerY - this.window.y) / elapsed;
        this.velocityX += (clamp(vx, -3000, 3000) - this.velocityX) * 0.4;
        this.velocityY += (clamp(vy, -3000, 3000) - this.velocityY) * 0.4;
      }
    }

    this.window = { x: centerX, y: centerY, at: now };
  }

  /** Whether a point in normalized device coordinates hits the character (for click-through). */
  hitTest(ndcX: number, ndcY: number): boolean {
    if (this.scale < 0.2) {
      return false;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return this.raycaster.intersectObject(this.rig.root, true).length > 0;
  }

  /** Mouse moving over the view (NDC); returns whether it is over the character. */
  pointerMove(ndcX: number, ndcY: number): boolean {
    const over = this.hitTest(ndcX, ndcY);
    if (over) {
      this.touch.move(ndcX / 2, ndcY / 2, performance.now());
    } else if (this.hovering) {
      this.touch.leave();
    }

    this.hovering = over;
    return over;
  }

  pointerLeave(): void {
    this.hovering = false;
    this.touch.leave();
  }

  /** A click on the character. */
  poke(): void {
    this.touch.poke(performance.now());
    this.bounceSpeed -= 2.2;
    this.blinkStartedAt = performance.now();
  }

  // Frame -------------------------------------------------------------------------------------------

  private frame(now: number): void {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrameAt) / 1000));
    this.lastFrameAt = now;
    if (now - this.fatigueCheckedAt > 30_000) {
      this.fatigue = fatigueAt(new Date());
      this.fatigueCheckedAt = now;
    }

    if (!this.window || now - this.window.at > 120) {
      const decay = Math.exp(-dt * 8);
      this.velocityX *= decay;
      this.velocityY *= decay;
    }

    resetPose(this.target);
    this.spin = 0;
    const animation = this.animation;
    if (animation === null) {
      this.scale = 0.0001;
    } else {
      this.scale = 1;
      const gaze = this.compose(animation, now);
      this.applyGaze(gaze, now);
    }

    this.blink(now);
    easePose(this.pose, this.target, dt, 11);
    this.physics(dt, animation);

    Object.assign(this.shown, this.pose);
    const blink = this.blinkAmount(now);
    this.shown.eyeOpenL *= 1 - blink;
    this.shown.eyeOpenR *= 1 - blink;
    this.shown.lean += this.dangle;
    this.shown.squash += this.bounce;
    this.shown.yaw += this.spin;
    applyPose(this.rig, this.shown, now / 1000, dt);
    this.stage.scale.setScalar(this.scale);
    this.shadowStrength.value = 0.35 * Math.min(1, this.scale) * clamp(1 - this.shown.y * 1.2, 0.3, 1);

    this.effects.update(dt);
    const moodValue = this.moodUniforms.mood.value as THREE.Color;
    moodValue.lerp(this.touchMoodTarget(), 1 - Math.exp(-dt * 5));
    this.moodUniforms.glow.value += (this.targetGlow - this.moodUniforms.glow.value) * (1 - Math.exp(-dt * 5));
    void this.renderer.render(this.scene, this.camera);
  }

  /** Builds the target pose from the animation and the personality layers; returns the free gaze. */
  private compose(animation: AvatarAnimationId, now: number): number {
    const spec = findAnimation(animation);
    const elapsed = (now - this.animationStartedAt) / 1000;
    const stage = this.makeStage(elapsed, spec.loop ? 0 : Math.min(1, (elapsed * 1000) / animationDurationMs(animation)), now);
    let gaze = choreograph(animation, this.target, stage);
    const resting = RESTING.has(animation);
    if (resting) {
      moodOverlay(this.target, stage);
    }

    if (animation === 'idle' && !this.touchKind) {
      this.updateMicro(now);
    }

    if (this.micro && animation === 'idle') {
      const microElapsed = now - this.micro.startedAt;
      const microStage = this.makeStage(microElapsed / 1000, microElapsed / MICRO_BEHAVIOR_DURATION_MS[this.micro.kind], now, `micro:${this.micro.kind}:${this.micro.startedAt}`);
      gaze = Math.min(gaze, microBehavior(this.micro.kind, this.target, microStage));
    }

    const touchable = resting || animation === 'sleep';
    if (touchable) {
      const reaction = this.touch.reactionAt(now) ?? (this.hovering ? 'hover' : null);
      if (reaction) {
        this.touchKind = reaction;
        if (reaction !== 'hover') {
          this.micro = null;
        }
      }

      this.touchWeight += ((reaction ? 1 : 0) - this.touchWeight) * 0.12;
      if (this.touchKind && this.touchWeight > 0.01) {
        const touchGaze = touchReaction(this.touchKind, this.target, stage, this.touchWeight, animation === 'sleep');
        gaze = gaze * (1 - this.touchWeight) + touchGaze * this.touchWeight;
      } else {
        this.touchKind = null;
      }
    } else {
      this.touchWeight = 0;
      this.touchKind = null;
    }

    this.spin = stage.spin;
    this.scale = stage.scale;
    return gaze;
  }

  private makeStage(t: number, p: number, now: number, prefix = ''): Stage {
    const avatar = this;
    const rig = this.rig;
    return {
      t,
      p,
      now: now / 1000,
      cheer: this.mood.cheer,
      fatigue: this.fatigue,
      streak: this.mood.streak,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
      waitingMs: this.questionSince === null ? 0 : now - this.questionSince,
      rig,
      spin: this.spin,
      scale: 1,
      once(key: string, condition: boolean): boolean {
        const id = prefix + key;
        if (!condition || avatar.fired.has(id)) {
          return false;
        }

        avatar.fired.add(id);
        return true;
      },
      every(key: string, seconds: number): boolean {
        const last = avatar.lastEvery.get(key) ?? -Infinity;
        if (now - last < seconds * 1000) {
          return false;
        }

        avatar.lastEvery.set(key, now);
        return true;
      },
      emit(kind: EffectKind, at: Vec3, options?: EmitOptions): void {
        avatar.effects.emit(kind, at, options);
      },
      burst(kind: EffectKind, at: Vec3, count: number, speed: number, options?: EmitOptions): void {
        avatar.effects.burst(kind, at, count, speed, options);
      },
    };
  }

  private startMicro(kind: MicroBehavior, now: number): void {
    for (const key of [...this.fired].filter((fired) => fired.startsWith('micro:'))) {
      this.fired.delete(key);
    }

    this.micro = { kind, startedAt: now };
  }

  private updateMicro(now: number): void {
    const context = { fatigue: this.fatigue, cheer: this.mood.cheer };
    if (this.micro && now - this.micro.startedAt >= MICRO_BEHAVIOR_DURATION_MS[this.micro.kind]) {
      this.micro = null;
      this.nextMicroAt = now + this.scheduler.nextDelayMs(context);
    }

    if (!this.micro && now >= this.nextMicroAt) {
      this.startMicro(this.scheduler.pick(context), now);
    }
  }

  /** Eyes (and a little of the head and body) follow the mouse while it is interesting. */
  private applyGaze(freedom: number, now: number): void {
    if (now >= this.nextSaccadeAt) {
      this.saccade = { x: (Math.random() - 0.5) * 0.16, y: (Math.random() - 0.5) * 0.12 };
      this.nextSaccadeAt = now + 400 + Math.random() * 1600;
    }

    this.target.lookX += this.saccade.x;
    this.target.lookY += this.saccade.y;
    if (!this.cursor || freedom <= 0) {
      return;
    }

    const quiet = now - this.cursorMovedAt;
    let interest = quiet < 4000 ? 1 : quiet < 10_000 ? 1 - ((quiet - 4000) / 6000) * 0.75 : 0.25;
    const distance = Math.hypot(this.cursor.x, this.cursor.y);
    if (distance > this.viewSize * 8) {
      interest *= 0.5;
    }

    if (this.hovering) {
      interest = 1;
    }

    const weight = clamp(freedom * interest, 0, 1);
    const reach = this.viewSize * 1.1;
    const nx = this.cursor.x / reach;
    // The eyes sit in the upper part of the view: aim from there rather than from the centre.
    const ny = -(this.cursor.y + this.viewSize * 0.12) / reach;
    const lookX = nx / Math.sqrt(1 + nx * nx);
    const lookY = ny / Math.sqrt(1 + ny * ny);
    mixInto(this.target, 'lookX', lookX + this.saccade.x, weight);
    mixInto(this.target, 'lookY', lookY + this.saccade.y, weight);
    this.target.headYaw += lookX * 0.45 * weight;
    this.target.headPitch -= lookY * 0.25 * weight;
    this.target.yaw += lookX * 0.15 * weight;
  }

  private blink(now: number): void {
    if (now >= this.nextBlinkAt) {
      this.blinkStartedAt = now;
      this.doubleBlink = Math.random() < 0.2;
      this.nextBlinkAt = now + 1800 + Math.random() * (3500 + this.fatigue * 1500);
    }
  }

  private blinkAmount(now: number): number {
    const duration = 150 + this.fatigue * 120;
    const elapsed = now - this.blinkStartedAt;
    if (elapsed < duration) {
      return Math.sin((elapsed / duration) * Math.PI);
    }

    if (this.doubleBlink && elapsed > duration + 90 && elapsed < duration * 2 + 90) {
      return Math.sin(((elapsed - duration - 90) / duration) * Math.PI);
    }

    return 0;
  }

  /** Swinging when carried or walking, and springy squash after landings and clicks. */
  private physics(dt: number, animation: AvatarAnimationId | null): void {
    const carried = animation === 'drag';
    const walking = animation === 'move';
    const factor = carried ? 0.0011 : walking ? 0.0004 : 0;
    const target = clamp(-this.velocityX * factor, -0.6, 0.6);
    this.dangleSpeed += ((target - this.dangle) * 70 - this.dangleSpeed * 5.5) * dt;
    this.dangle += this.dangleSpeed * dt;
    this.bounceSpeed += (-this.bounce * 240 - this.bounceSpeed * 9) * dt;
    this.bounce = clamp(this.bounce + this.bounceSpeed * dt, -0.3, 0.3);
  }

  private land(): void {
    this.bounceSpeed -= 3.2;
    this.effects.burst('puff', [0, 0.05, 0.1], 5, 0.9, { gravity: 0, drag: 0.05, life: 0.5, size: 0.7 });
  }

  /**
   * Grounded: the ray through the bottom edge of the view grazes the front of the feet, so there is no
   * empty space below the character. Otherwise the character is centred with room around it.
   */
  private frameCamera(grounded: boolean): void {
    if (!grounded) {
      this.camera.position.set(0, 1.9, 6.3);
      this.camera.lookAt(0, 1.12, 0);
      return;
    }

    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const height = FEET_FRONT.y + (CAMERA_DISTANCE - FEET_FRONT.z) * Math.tan(CAMERA_PITCH + halfFov);
    this.camera.position.set(0, height, CAMERA_DISTANCE);
    this.camera.lookAt(0, height - CAMERA_DISTANCE * Math.tan(CAMERA_PITCH), 0);
  }

  private touchMoodTarget(): THREE.Color {
    const kind = this.touchKind;
    const touchColor = kind && kind !== 'hover' ? TOUCH_COLORS[kind] : null;
    if (touchColor !== null && this.touchWeight > 0.3) {
      return touchColor;
    }

    if (this.animation === 'idle' && this.mood.level === 'elated') {
      return ELATED_COLOR;
    }

    return this.targetMood;
  }
}
