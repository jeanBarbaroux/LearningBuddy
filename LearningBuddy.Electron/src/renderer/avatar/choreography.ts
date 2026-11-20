// Choreography of the companion: for each animation, spontaneous behaviour and touch reaction, writes the
// target pose for the current instant and triggers particles. Functions return how much the character
// may follow the mouse with its eyes meanwhile (0 = its gaze is part of the animation, 1 = free).
import type { AvatarAnimationId } from '../../core/companion/avatarStoryboard';
import { waitingMood, type MicroBehavior, type TouchReaction } from '../../core/companion/companionBehavior';
import type { EffectKind, EmitOptions } from './effects';
import {
  arc,
  clamp01,
  easeInBack,
  easeInOut,
  easeOutBack,
  envelope,
  mixInto,
  TAU,
  window01,
  type Pose,
  type PoseKey,
} from './pose';
import type { CharacterRig, Vec3 } from './rig';

export interface Stage {
  /** Seconds since the current animation (or behaviour) started, and its progress for one-shots. */
  readonly t: number;
  readonly p: number;
  /** Absolute time in seconds, for loops. */
  readonly now: number;
  readonly cheer: number;
  readonly fatigue: number;
  readonly streak: number;
  /** Velocity of the companion window on screen, pixels per second. */
  readonly velocityX: number;
  readonly velocityY: number;
  readonly waitingMs: number;
  readonly rig: CharacterRig;
  /** Extra turn and global scale, applied without smoothing (spins, pop-in). */
  spin: number;
  scale: number;
  /** True the first time `condition` holds during the current animation or behaviour. */
  once(key: string, condition: boolean): boolean;
  /** True at most once every `seconds`. */
  every(key: string, seconds: number): boolean;
  emit(kind: EffectKind, at: Vec3, options?: EmitOptions): void;
  burst(kind: EffectKind, at: Vec3, count: number, speed: number, options?: EmitOptions): void;
}

// Shared particle placements -------------------------------------------------------------------------

function aboveHead(stage: Stage, x = 0, extra = 0.15): Vec3 {
  return [x, stage.rig.top + extra, 0.2];
}

function eye(stage: Stage, side: -1 | 1): Vec3 {
  return [side * 0.24, stage.rig.eyeHeight - 0.08, 0.62];
}

function floatingMark(stage: Stage, kind: EffectKind, x: number, life = 1.6): void {
  stage.emit(kind, aboveHead(stage, x, 0.2), { velocity: [0, 0.12, 0], life, size: 1.4, sway: 0.02 });
}

function tears(stage: Stage): void {
  for (const side of [-1, 1] as const) {
    stage.emit('tear', eye(stage, side), { velocity: [side * 0.35, 0.25, 0.3], gravity: -3.2, life: 0.9, size: 0.9 });
  }
}

function note(stage: Stage, x = 0.45): void {
  stage.emit('note', aboveHead(stage, x, -0.25), {
    velocity: [x > 0 ? 0.15 : -0.15, 0.5, 0], life: 1.4, size: 1.2, sway: 0.06, rotation: [0, 0, x > 0 ? -0.2 : 0.2],
  });
}

// Animations -----------------------------------------------------------------------------------------

export function choreograph(id: AvatarAnimationId, pose: Pose, stage: Stage): number {
  switch (id) {
    case 'idle': return idle(pose, stage);
    case 'move': return move(pose, stage);
    case 'drag': return drag(pose, stage);
    case 'appear': return appear(pose, stage);
    case 'disappear': return disappear(pose, stage);
    case 'request': return request(pose, stage);
    case 'wait': return wait(pose, stage);
    case 'think': return think(pose, stage);
    case 'sad': return sad(pose, stage);
    case 'happy': return happy(pose, stage);
    case 'celebrate': return celebrate(pose, stage);
    case 'sleep': return sleep(pose, stage);
  }
}

function breathe(pose: Pose, stage: Stage, amount = 1): number {
  const breath = Math.sin((stage.now * TAU) / (3.2 + stage.fatigue * 1.6));
  pose.squash = 1 + breath * 0.022 * amount;
  pose.armLRaise += breath * 0.03;
  pose.armRRaise += breath * 0.03;
  pose.headPitch += -breath * 0.015;
  return breath;
}

function idle(pose: Pose, stage: Stage): number {
  breathe(pose, stage);
  const liveliness = Math.max(0, stage.cheer);
  pose.headRoll = Math.sin(stage.now * 0.7) * 0.04;
  pose.lean = Math.sin(stage.now * 0.9) * 0.02;
  pose.tailWag = Math.sin(stage.now * (1.6 + liveliness * 3)) * (0.15 + liveliness * 0.35);
  // An ear twitches now and then.
  const twitch = stage.now % 5.3;
  if (twitch < 0.22) {
    pose.earR += Math.sin((twitch / 0.22) * Math.PI) * 0.6;
  }

  return 1;
}

/** Waddles in the direction the window moves, turning its body towards it. */
function move(pose: Pose, stage: Stage): number {
  const direction = Math.max(-1, Math.min(1, stage.velocityX / 45));
  const speed = Math.hypot(stage.velocityX, stage.velocityY);
  const step = Math.sin(stage.now * TAU * 2.4);
  pose.y = Math.abs(step) * 0.1;
  pose.squash = 1 + Math.abs(step) * 0.04;
  pose.lean += step * 0.08;
  pose.legLLift = Math.max(0, step) * 0.9;
  pose.legRLift = Math.max(0, -step) * 0.9;
  pose.armLSwing = step * 0.5;
  pose.armRSwing = -step * 0.5;
  pose.yaw = direction * 0.85;
  pose.headYaw = direction * 0.2;
  pose.lookX = direction * 0.7;
  pose.lookY = stage.velocityY < -10 ? 0.3 : 0;
  pose.smile = 0.45;
  pose.earL = pose.earR = 0.3;
  pose.tailWag = Math.sin(stage.now * 9) * 0.35;
  if (speed > 20 && stage.every('dust', 0.42)) {
    stage.emit('puff', [-direction * 0.25, 0.04, -0.1], { velocity: [-direction * 0.3, 0.25, 0], life: 0.55, size: 0.5, drag: 0.2 });
  }

  return 0.2;
}

/** Carried by the mouse: kicks and flails at first, then enjoys the ride. */
function drag(pose: Pose, stage: Stage): number {
  const kick = Math.sin(stage.now * TAU * 2.6);
  const calm = window01(stage.t, 1.6, 2.6);
  pose.y = 0.08;
  pose.squash = 1.07;
  pose.legLLift = Math.max(0, kick) * 0.9 * (1 - calm * 0.7);
  pose.legRLift = Math.max(0, -kick) * 0.9 * (1 - calm * 0.7);
  const flail = Math.sin(stage.now * TAU * 2.6 + 1) * 0.35 * (1 - calm);
  pose.armLRaise = 1 + flail + calm * 0.6;
  pose.armRRaise = 1 - flail + calm * 0.6;
  pose.eyeOpenL = pose.eyeOpenR = 1.15 - calm * 0.25;
  pose.squint = calm * 0.5;
  pose.pupil = 0.72 + calm * 0.3;
  pose.browY = 0.8 - calm * 0.5;
  pose.mouthOpen = 0.45 - calm * 0.1;
  pose.smile = -0.3 + calm * 1.3;
  pose.earL = pose.earR = 0.7;
  pose.tailWag = Math.sin(stage.now * 12) * 0.4;
  if (stage.once('drag-sweat', stage.t > 0.05)) {
    stage.emit('sweat', [0.42, stage.rig.top - 0.2, 0.35], { velocity: [0.4, 0.5, 0], gravity: -2.5, life: 0.8 });
  }

  if (calm > 0.5 && stage.every('drag-note', 0.9)) {
    note(stage, Math.random() > 0.5 ? 0.5 : -0.5);
  }

  return 0.3;
}

function appear(pose: Pose, stage: Stage): number {
  const p = stage.p;
  stage.scale = Math.max(0.0001, p < 0.55 ? easeOutBack(p / 0.55) : 1);
  stage.spin = -(1 - easeInOut(clamp01(p / 0.6))) * Math.PI;
  pose.y = -(1 - window01(p, 0, 0.5)) * 0.4;
  pose.squash = 1 + arc(p, 0.15, 0.6) * 0.12;
  pose.eyeOpenL = pose.eyeOpenR = window01(p, 0.45, 0.65);
  pose.smile = 0.7;
  pose.armLRaise = pose.armRRaise = 0.15 + arc(p, 0.35, 1) * 1.4;
  pose.earL = pose.earR = 0.8;
  if (stage.once('poof', true)) {
    stage.burst('puff', [0, 0.25, 0], 7, 1.1, { gravity: 0, drag: 0.05, life: 0.6 });
    stage.burst('sparkle', [0, 1, 0], 6, 1.4, { gravity: -1, drag: 0.2 });
  }

  return 0.5;
}

function disappear(pose: Pose, stage: Stage): number {
  const p = stage.p;
  const leap = window01(p, 0.3, 1);
  pose.squash = 1 - arc(p, 0, 0.32) * 0.16 + arc(p, 0.3, 0.7) * 0.1;
  pose.y = arc(p, 0.3, 1.2) * 0.45;
  stage.spin = easeInBack(leap) * TAU;
  stage.scale = Math.max(0.0001, 1 - easeInBack(window01(p, 0.35, 1)));
  pose.squint = 0.8;
  pose.eyeOpenL = pose.eyeOpenR = 0.6;
  pose.smile = 0.8;
  pose.armRRaise = 0.15 + envelope(p, 0, 0.25, 0.7, 1) * 2.2;
  pose.armRSwing = Math.sin(stage.now * TAU * 3) * 0.4;
  if (stage.once('poof', p > 0.4)) {
    stage.burst('sparkle', [0, 1.1, 0], 8, 1.6, { gravity: -1, drag: 0.2 });
    stage.burst('puff', [0, 0.4, 0], 6, 1, { gravity: 0, drag: 0.05, life: 0.6 });
  }

  return 0.3;
}

/** A question is ready: jumps up with an exclamation mark. */
function request(pose: Pose, stage: Stage): number {
  const p = stage.p;
  pose.squash = 1 - arc(p, 0, 0.18) * 0.15 + arc(p, 0.18, 0.55) * 0.12;
  pose.y = arc(p, 0.18, 0.6) * 0.32;
  pose.pitch = -arc(p, 0.2, 0.6) * 0.12;
  const arms = envelope(p, 0.15, 0.35, 0.75, 1);
  pose.armLRaise = pose.armRRaise = 0.15 + arms * 1.7;
  pose.armLSwing = pose.armRSwing = Math.sin(stage.now * TAU * 4) * 0.25 * arms;
  pose.eyeOpenL = pose.eyeOpenR = 1.15;
  pose.pupil = 1.2;
  pose.browY = 0.9;
  pose.mouthOpen = envelope(p, 0.15, 0.3, 0.6, 0.85) * 0.55;
  pose.smile = 0.7;
  pose.earL = pose.earR = 1;
  pose.blush = 0.2;
  pose.tailWag = Math.sin(stage.now * 14) * 0.4;
  if (stage.once('mark', p > 0.18)) {
    floatingMark(stage, 'exclaim', 0.35, 1.7);
    stage.burst('sparkle', aboveHead(stage, 0, -0.2), 5, 1.2, { gravity: -1.2, drag: 0.2 });
  }

  return 0.4;
}

/** The question is displayed: curious, then patient, then openly impatient. */
function wait(pose: Pose, stage: Stage): number {
  breathe(pose, stage);
  switch (waitingMood(stage.waitingMs)) {
    case 'curious':
      pose.headRoll = 0.1 + Math.sin(stage.now * 0.8) * 0.16;
      pose.earL = pose.earR = 0.6;
      pose.lookY = 0.15;
      pose.smile = 0.4;
      pose.pupil = 1.15;
      pose.browY = 0.3;
      pose.tailWag = Math.sin(stage.now * 3) * 0.3;
      return 1;
    case 'patient':
      pose.lean = Math.sin(stage.now * 1.1) * 0.04;
      pose.headRoll = Math.sin(stage.now * 1.1) * 0.06;
      pose.smile = 0.25;
      // Hands behind the back.
      pose.armLSwing = pose.armRSwing = -0.45;
      if (stage.every('hum', 7)) {
        note(stage);
      }

      return 0.8;
    case 'impatient': {
      const sigh = stage.now % 6.5;
      pose.legRLift = Math.max(0, Math.sin(stage.now * TAU * 2.2)) * 0.35;
      pose.armLRaise = pose.armRRaise = 0.35;
      pose.armLSwing = pose.armRSwing = 1.1;
      pose.browTilt = -0.5;
      pose.browY = -0.3;
      pose.lidTilt = -0.4;
      pose.eyeOpenL = pose.eyeOpenR = 0.78;
      pose.smile = -0.3;
      pose.headRoll = 0.1;
      pose.tailWag = Math.sin(stage.now * 14) * 0.25;
      if (sigh < 1) {
        pose.squash -= Math.sin(sigh * Math.PI) * 0.05;
        pose.mouthOpen = Math.sin(sigh * Math.PI) * 0.25;
        pose.headPitch += Math.sin(sigh * Math.PI) * 0.12;
      }

      if (stage.every('sigh', 6.5)) {
        stage.emit('puff', [0.15, stage.rig.eyeHeight - 0.3, 0.6], { velocity: [0.3, -0.05, 0.4], life: 0.7, size: 0.45, drag: 0.1 });
      }

      if (stage.every('sweat', 9)) {
        stage.emit('sweat', [-0.45, stage.rig.top - 0.25, 0.3], { velocity: [-0.1, 0, 0], gravity: -0.8, life: 1.4 });
      }

      return 0.7;
    }
  }
}

/** "Difficile": hand on the chin, eyes up… then the answer comes back. */
function think(pose: Pose, stage: Stage): number {
  const p = stage.p;
  breathe(pose, stage, 0.5);
  const ponder = envelope(p, 0, 0.12, 0.66, 0.78);
  pose.armRRaise = 0.15 + ponder * 0.45;
  pose.armRSwing = ponder * (1.5 + Math.sin(stage.now * TAU * 2) * 0.08);
  pose.headRoll = -ponder * 0.25;
  pose.lookX = ponder * 0.55;
  pose.lookY = ponder * 0.75;
  pose.browY = ponder * 0.4;
  pose.browTilt = ponder * 0.35;
  pose.smile = 0.15 - ponder * 0.3;
  pose.eyeOpenL = 1 - ponder * 0.3;
  pose.tailWag = Math.sin(stage.now * 2) * 0.2;
  const aha = window01(p, 0.72, 0.82) * (1 - window01(p, 0.95, 1));
  pose.y = arc(p, 0.74, 0.9) * 0.14;
  pose.headPitch += Math.sin(window01(p, 0.8, 1) * TAU * 1.5) * 0.15 * aha;
  pose.smile += aha * 0.75;
  pose.browY += aha * 0.3;
  pose.earL = pose.earR = aha * 0.8;
  pose.armLRaise += aha * 0.8;
  pose.armLSwing += aha * 0.6;
  if (stage.once('question', p > 0.1)) {
    floatingMark(stage, 'question', 0.4, 1.3);
  }

  if (stage.once('aha', p > 0.74)) {
    stage.burst('sparkle', aboveHead(stage, 0.2, -0.1), 5, 1.2, { gravity: -1.2, drag: 0.2 });
    stage.emit('star', aboveHead(stage, 0.25, 0.05), { velocity: [0, 0.4, 0], life: 0.9, size: 1.1, spin: [0, 3, 0] });
  }

  return 1 - ponder;
}

/** "À revoir": slumps, sheds a tear… then pulls itself together. */
function sad(pose: Pose, stage: Stage): number {
  const p = stage.p;
  const slump = envelope(p, 0, 0.12, 0.62, 0.76);
  const depth = 1 + Math.max(0, -stage.cheer) * 0.4;
  pose.squash = 1 - slump * 0.08 + Math.sin(stage.now * TAU * 1.6) * 0.012 * slump;
  pose.pitch = slump * 0.1;
  pose.headPitch = slump * 0.35 * depth;
  pose.headRoll = slump * 0.08;
  pose.earL = pose.earR = -slump * depth;
  pose.tailRaise = -0.6 * slump;
  pose.armLRaise = pose.armRRaise = 0.05;
  pose.eyeOpenL = pose.eyeOpenR = 1 - slump * 0.35;
  pose.lidTilt = slump;
  pose.browTilt = slump;
  pose.browY = slump * 0.2;
  pose.lookY = -0.5 * slump;
  pose.smile = 0.15 - slump * 1.05;
  pose.mouthOpen = 0.1 * slump;
  if (stage.once('tears-1', p > 0.18) || stage.once('tears-2', p > 0.42)) {
    tears(stage);
  }

  const recover = window01(p, 0.7, 0.84) * (1 - window01(p, 0.96, 1));
  pose.squash += recover * 0.06;
  pose.armRRaise += recover * 0.9;
  pose.armRSwing += recover * 0.6;
  pose.browTilt -= recover * 0.4;
  pose.smile += recover * 0.55;
  pose.earL += recover * 0.5;
  pose.earR += recover * 0.5;
  pose.y += arc(p, 0.82, 0.95) * 0.08;
  return 0.15;
}

/** "Correct": two happy hops, arms up, sparkles. */
function happy(pose: Pose, stage: Stage): number {
  const p = stage.p;
  const hops = arc(p, 0.05, 0.35) + arc(p, 0.38, 0.68) * 0.8;
  pose.y = hops * 0.22;
  pose.squash = 1 + hops * 0.06 - (arc(p, 0.33, 0.4) + arc(p, 0.66, 0.74)) * 0.08;
  const arms = envelope(p, 0.02, 0.15, 0.7, 0.9);
  pose.armLRaise = pose.armRRaise = 0.15 + arms * 1.6;
  pose.armLSwing = Math.sin(stage.now * 18) * 0.12 * arms;
  pose.armRSwing = -pose.armLSwing;
  pose.squint = 0.85;
  pose.eyeOpenL = pose.eyeOpenR = 0.7;
  pose.smile = 1;
  pose.mouthOpen = 0.35 * arms;
  pose.blush = 0.6;
  pose.earL = pose.earR = 0.8;
  pose.tailWag = Math.sin(stage.now * 16) * 0.5;
  pose.tailRaise = 0.6;
  pose.lean = Math.sin(p * TAU * 2) * 0.06;
  if (stage.once('sparkles', p > 0.06)) {
    stage.burst('sparkle', [0, 1.2, 0.2], 6 + Math.min(4, stage.streak), 1.5, { gravity: -1.5, drag: 0.25 });
  }

  if (stage.once('note', p > 0.4)) {
    note(stage);
  }

  if (stage.streak >= 3 && stage.once('star', p > 0.35)) {
    stage.emit('star', aboveHead(stage, -0.3, 0), { velocity: [-0.2, 0.6, 0], life: 1.1, size: 1.2, spin: [0, 4, 0] });
  }

  return 0.3;
}

/** "Facile": big jump with a full spin, confetti and a victory dance. */
function celebrate(pose: Pose, stage: Stage): number {
  const p = stage.p;
  const jump = arc(p, 0.1, 0.42);
  pose.squash = 1 - arc(p, 0, 0.12) * 0.18 + jump * 0.1 - arc(p, 0.42, 0.5) * 0.15;
  pose.y = jump * 0.65;
  stage.spin = easeInOut(clamp01((p - 0.12) / 0.3)) * TAU;
  const victory = window01(p, 0.45, 0.55) * (1 - window01(p, 0.9, 1));
  pose.y += Math.abs(Math.sin((p - 0.5) * TAU * 3)) * 0.08 * victory;
  pose.armLRaise = pose.armRRaise = 0.15 + Math.max(jump * 1.4, victory * 2.5) + Math.sin(stage.now * TAU * 3) * 0.25 * victory;
  pose.lean = Math.sin(stage.now * TAU * 1.5) * 0.08 * victory;
  pose.squint = 0.9;
  pose.eyeOpenL = pose.eyeOpenR = 0.6;
  pose.smile = 1;
  pose.mouthOpen = 0.6 * victory + 0.4 * jump;
  pose.blush = 0.7;
  pose.earL = pose.earR = 1;
  pose.tailWag = Math.sin(stage.now * 18) * 0.6;
  pose.tailRaise = 0.8;
  const extra = Math.min(10, stage.streak * 2);
  if (stage.once('confetti', p > 0.2)) {
    stage.burst('confetti', [0, 1.6, 0.2], 16 + extra, 2.2, { gravity: -3, drag: 0.35, life: 1.6 });
    stage.burst('star', [0, 1.4, 0.2], 3 + Math.floor(extra / 3), 1.6, { gravity: -2, drag: 0.3 });
  }

  if (stage.once('land', p > 0.42)) {
    stage.burst('puff', [0, 0.05, 0.1], 5, 0.8, { gravity: 0, drag: 0.05, life: 0.5, size: 0.7 });
  }

  if (stage.once('confetti-2', p > 0.6)) {
    stage.burst('confetti', [0, 1.8, 0.2], 10 + extra, 1.8, { gravity: -3, drag: 0.35, life: 1.5 });
  }

  return 0.2;
}

function sleep(pose: Pose, stage: Stage): number {
  const breath = Math.sin((stage.now * TAU) / 4.2);
  pose.squash = 0.97 + breath * 0.035;
  pose.y = -0.02;
  pose.headPitch = 0.32 + breath * 0.03;
  pose.headRoll = 0.22;
  pose.lean = 0.05;
  pose.eyeOpenL = pose.eyeOpenR = 0;
  pose.mouthOpen = Math.max(0, breath) * 0.18;
  pose.smile = 0.2;
  pose.earL = pose.earR = -0.7;
  pose.armLRaise = pose.armRRaise = 0.05;
  pose.tailRaise = -0.5;
  pose.tailWag = Math.sin(stage.now * 0.4) * 0.1;
  // Sweet dreams every now and then.
  const dream = stage.now % 13;
  if (dream < 1.4) {
    pose.smile = 0.2 + Math.sin((dream / 1.4) * Math.PI) * 0.6;
    pose.blush = Math.sin((dream / 1.4) * Math.PI) * 0.4;
    pose.earR += Math.sin(dream * 20) * 0.2;
  }

  if (stage.every('z', 1.5)) {
    stage.emit('z', aboveHead(stage, 0.3, -0.2), { velocity: [0.18, 0.35, 0], life: 2.2, size: 0.7 + Math.random() * 0.5, sway: 0.05, rotation: [0, 0, -0.2] });
  }

  return 0;
}

// Mood overlay ---------------------------------------------------------------------------------------

/** Streak and night-time fatigue colour the resting animations (idle, wait, move). */
export function moodOverlay(pose: Pose, stage: Stage): void {
  const cheer = stage.cheer;
  pose.smile += cheer * 0.55;
  if (cheer > 0) {
    pose.earL += cheer * 0.3;
    pose.earR += cheer * 0.3;
    pose.tailRaise += cheer * 0.5;
    pose.squint += cheer * 0.15;
    pose.squash += cheer * 0.015;
    if (stage.streak >= 5 && stage.every('aura', 1.4)) {
      const angle = Math.random() * TAU;
      stage.emit('sparkle', [Math.cos(angle) * 0.75, 0.6 + Math.random() * 1.2, 0.2], { velocity: [0, 0.3, 0], life: 1, size: 0.7, spin: [0, 5, 0] });
    }
  } else if (cheer < 0) {
    pose.headPitch -= cheer * 0.18;
    pose.earL += cheer * 0.6;
    pose.earR += cheer * 0.6;
    pose.lidTilt -= cheer * 0.5;
    pose.browTilt -= cheer * 0.6;
    pose.tailRaise += cheer * 0.4;
  }

  const fatigue = stage.fatigue;
  pose.eyeOpenL *= 1 - fatigue * 0.42;
  pose.eyeOpenR *= 1 - fatigue * 0.42;
  pose.headPitch += fatigue * 0.1;
  pose.earL -= fatigue * 0.35;
  pose.earR -= fatigue * 0.35;
  pose.lidTilt += fatigue * 0.2;
}

// Spontaneous behaviours -----------------------------------------------------------------------------

export function microBehavior(kind: MicroBehavior, pose: Pose, stage: Stage): number {
  const p = stage.p;
  const weight = envelope(p, 0, 0.08, 0.92, 1);
  const set = (key: PoseKey, value: number): void => mixInto(pose, key, value, weight);
  switch (kind) {
    case 'lookAround': {
      const turn = window01(p, 0.05, 0.2) * 0.65 - window01(p, 0.4, 0.58) * 1.3 + window01(p, 0.82, 0.97) * 0.65;
      set('headYaw', turn);
      set('lookX', turn * 1.3);
      set('earL', 0.4);
      set('earR', 0.4);
      set('browY', 0.2);
      return 1 - weight;
    }
    case 'yawn': {
      const open = envelope(p, 0.15, 0.35, 0.7, 0.85);
      set('mouthOpen', open);
      set('headPitch', -open * 0.3);
      set('eyeOpenL', 1 - open * 0.95);
      set('eyeOpenR', 1 - open * 0.95);
      set('browY', open * 0.5);
      pose.squash += open * 0.06 * weight;
      pose.armLRaise += open * 0.7 * weight;
      pose.armRRaise += open * 0.7 * weight;
      if (stage.once('yawn-tear', p > 0.72)) {
        stage.emit('tear', eye(stage, 1), { velocity: [0.15, 0.05, 0.2], gravity: -1.5, life: 0.8, size: 0.6 });
      }

      return 1 - weight;
    }
    case 'stretch': {
      const up = envelope(p, 0.1, 0.35, 0.65, 0.85);
      set('armLRaise', 0.15 + up * 2.45);
      set('armRRaise', 0.15 + up * 2.45);
      set('eyeOpenL', 1 - up * 0.85);
      set('eyeOpenR', 1 - up * 0.85);
      set('squint', up * 0.6);
      set('mouthOpen', up * 0.3);
      pose.squash += up * 0.12 * weight;
      pose.y += up * 0.04 * weight;
      const shake = envelope(p, 0.84, 0.88, 0.95, 1);
      pose.lean += Math.sin(stage.now * 32) * 0.05 * shake;
      return 1 - weight;
    }
    case 'groom': {
      const lick = Math.sin(stage.now * 13);
      set('armLRaise', 0.9);
      set('armLSwing', 1.35 + lick * 0.1);
      set('headRoll', 0.3);
      set('headPitch', 0.15 + lick * 0.05);
      set('eyeOpenL', 0.15);
      set('eyeOpenR', 0.15);
      set('squint', 0.5);
      set('smile', 0.4);
      return 0;
    }
    case 'hop': {
      const hops = arc(p, 0.05, 0.42) + arc(p, 0.48, 0.85);
      pose.y += hops * 0.2;
      set('armLRaise', 0.15 + hops * 1.2);
      set('armRRaise', 0.15 + hops * 1.2);
      set('smile', 0.95);
      set('squint', 0.5);
      if (stage.once('hop-note', p > 0.1)) {
        note(stage);
      }

      return 0.5;
    }
    case 'hum': {
      const sway = Math.sin(stage.now * TAU * 0.8);
      pose.lean += sway * 0.07 * weight;
      set('headRoll', sway * 0.12);
      set('eyeOpenL', 0.3);
      set('eyeOpenR', 0.3);
      set('squint', 0.4);
      set('smile', 0.7);
      set('mouthOpen', 0.08 + Math.max(0, Math.sin(stage.now * TAU * 2)) * 0.1);
      if (p > 0.1 && p < 0.85 && stage.every('hum-note', 0.75)) {
        note(stage, sway > 0 ? 0.45 : -0.45);
      }

      return 0.2;
    }
    case 'nodOff': {
      const droop = window01(p, 0.05, 0.7);
      const jolt = window01(p, 0.72, 0.75);
      const awake = window01(p, 0.75, 1);
      set('headPitch', droop * 0.45 * (1 - jolt) - jolt * (1 - awake) * 0.12);
      const eyes = jolt > 0 ? 1.15 - awake * 0.15 : 1 - droop * 0.95;
      set('eyeOpenL', eyes);
      set('eyeOpenR', eyes);
      set('browY', jolt * (1 - awake) * 0.9);
      set('earL', -droop * (1 - jolt) + jolt * (1 - awake));
      set('earR', -droop * (1 - jolt) + jolt * (1 - awake));
      if (stage.once('nod-z', p > 0.45)) {
        stage.emit('z', aboveHead(stage, 0.3, -0.25), { velocity: [0.15, 0.3, 0], life: 1.2, size: 0.6, sway: 0.04 });
      }

      if (stage.once('nod-sweat', p > 0.73)) {
        stage.emit('sweat', [-0.45, stage.rig.top - 0.25, 0.3], { velocity: [-0.25, 0.4, 0], gravity: -2.5, life: 0.8 });
      }

      return 0;
    }
    case 'wave': {
      const raise = envelope(p, 0, 0.15, 0.8, 1);
      set('armRRaise', 0.15 + raise * 2.3);
      pose.armRSwing += Math.sin(stage.now * TAU * 2.5) * 0.45 * raise;
      set('headRoll', 0.12);
      set('smile', 0.9);
      set('squint', 0.4);
      set('blush', 0.3);
      set('earL', 0.6);
      set('earR', 0.6);
      return 1;
    }
  }
}

// Touch reactions ------------------------------------------------------------------------------------

/** `weight` fades the reaction in and out; `asleep` softens it while the companion sleeps. */
export function touchReaction(reaction: TouchReaction | 'hover', pose: Pose, stage: Stage, weight: number, asleep: boolean): number {
  const set = (key: PoseKey, value: number): void => mixInto(pose, key, value, weight);
  if (asleep) {
    switch (reaction) {
      case 'pet':
        set('smile', 0.75);
        set('blush', 0.5);
        if (stage.every('sleep-heart', 1.1)) {
          stage.emit('heart', aboveHead(stage, -0.3, -0.25), { velocity: [-0.1, 0.4, 0], life: 1.2, size: 0.6, sway: 0.03 });
        }
        break;
      case 'tickle':
        set('smile', 0.85);
        pose.squash += Math.sin(stage.now * 30) * 0.025 * weight;
        break;
      case 'poke':
        set('eyeOpenR', 0.55);
        set('browY', 0.3);
        break;
      case 'annoyed':
        set('browTilt', -0.7);
        set('smile', -0.4);
        break;
      case 'hover':
        break;
    }

    return 0;
  }

  switch (reaction) {
    case 'hover':
      pose.earL += 0.4 * weight;
      pose.earR += 0.4 * weight;
      pose.smile += 0.25 * weight;
      pose.browY += 0.2 * weight;
      set('pupil', 1.2);
      pose.tailWag += Math.sin(stage.now * 8) * 0.25 * weight;
      return 1;
    case 'poke':
      set('eyeOpenL', 1.15);
      set('eyeOpenR', 1.15);
      set('pupil', 0.8);
      set('mouthOpen', 0.3);
      set('browY', 0.7);
      return 1;
    case 'pet':
      set('eyeOpenL', 0.22);
      set('eyeOpenR', 0.22);
      set('squint', 0.75);
      set('blush', 0.85);
      set('smile', 0.85);
      set('headRoll', 0.12 + Math.sin(stage.now * 2) * 0.15);
      set('earL', -0.3);
      set('earR', -0.3);
      pose.tailWag += Math.sin(stage.now * 5) * 0.4 * weight;
      // Purring.
      pose.x += Math.sin(stage.now * 70) * 0.004 * weight;
      if (stage.every('heart', 0.6)) {
        stage.emit('heart', aboveHead(stage, (Math.random() - 0.5) * 0.8, -0.2), { velocity: [0, 0.5, 0], life: 1.3, size: 0.9, sway: 0.04 });
      }
      return 0;
    case 'tickle':
      pose.squash += Math.sin(stage.now * 32) * 0.04 * weight;
      pose.lean += Math.sin(stage.now * 21) * 0.1 * weight;
      set('squint', 0.9);
      set('eyeOpenL', 0.45);
      set('eyeOpenR', 0.45);
      set('mouthOpen', 0.55 + Math.sin(stage.now * 25) * 0.15);
      set('smile', 1);
      set('blush', 0.7);
      set('armLRaise', 0.8 + Math.sin(stage.now * 24) * 0.4);
      set('armRRaise', 0.8 - Math.sin(stage.now * 24) * 0.4);
      set('legLLift', Math.max(0, Math.sin(stage.now * 20)) * 0.6);
      set('legRLift', Math.max(0, -Math.sin(stage.now * 20)) * 0.6);
      if (stage.every('giggle', 0.35)) {
        stage.emit('sparkle', [(Math.random() - 0.5) * 1, 0.8 + Math.random() * 0.8, 0.4], { velocity: [0, 0.6, 0], life: 0.6, size: 0.6 });
      }
      return 0;
    case 'annoyed':
      set('browTilt', -1);
      set('browY', -0.6);
      set('lidTilt', -0.8);
      set('eyeOpenL', 0.65);
      set('eyeOpenR', 0.65);
      set('smile', -0.7);
      set('mouthOpen', 0.06);
      set('armLRaise', 0.35);
      set('armRRaise', 0.35);
      set('armLSwing', 1.1);
      set('armRSwing', 1.1);
      set('headYaw', -0.55);
      set('yaw', -0.3);
      set('lookX', -0.6);
      set('earL', -0.4);
      set('earR', -0.4);
      pose.squash += 0.03 * weight;
      pose.tailWag += Math.sin(stage.now * 10) * 0.3 * weight;
      if (stage.every('anger', 1.1)) {
        stage.emit('anger', aboveHead(stage, 0.45, -0.35), { life: 0.9, size: 1.3, rotation: [0, 0, 0.3] });
      }
      return 0;
  }
}
