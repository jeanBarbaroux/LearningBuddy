// A pose is a flat set of numbers describing the whole character (body, face, limbs). Every frame the
// behaviour layers compute a target pose, and the displayed pose eases towards it so that every change of
// animation, gaze or emotion blends smoothly instead of snapping.

export interface Pose {
  // Whole character
  x: number;
  y: number;
  /** Roll (side lean), pitch (forward bow) and yaw (turn), in radians. */
  lean: number;
  pitch: number;
  yaw: number;
  /** 1 = rest; above 1 stretches the body upwards, below 1 squashes it. */
  squash: number;
  // Head
  headYaw: number;
  /** Positive bows the head down. */
  headPitch: number;
  headRoll: number;
  // Limbs: raise 0 = hanging, ~2.6 = straight up; swing moves the limb forwards.
  armLRaise: number;
  armLSwing: number;
  armRRaise: number;
  armRSwing: number;
  legLLift: number;
  legRLift: number;
  // Eyes: open 0 … 1 (1.15 = wide), squint raises the lower lid (happy ^^), lidTilt -1 angry … 1 sad.
  eyeOpenL: number;
  eyeOpenR: number;
  squint: number;
  lidTilt: number;
  /** -1 … 1, positive = towards the viewer's right / upwards. */
  lookX: number;
  lookY: number;
  pupil: number;
  // Brows: y -1 lowered … 1 raised, tilt -1 angry … 1 worried.
  browY: number;
  browTilt: number;
  // Mouth: open 0 … 1, smile -1 (frown) … 1.
  mouthOpen: number;
  smile: number;
  blush: number;
  /** Ears -1 drooping … 1 perked. */
  earL: number;
  earR: number;
  /** Side-to-side tail angle and how high the tail is held. */
  tailWag: number;
  tailRaise: number;
}

export type PoseKey = keyof Pose;

export const NEUTRAL_POSE: Readonly<Pose> = {
  x: 0,
  y: 0,
  lean: 0,
  pitch: 0,
  yaw: 0,
  squash: 1,
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
  armLRaise: 0.15,
  armLSwing: 0,
  armRRaise: 0.15,
  armRSwing: 0,
  legLLift: 0,
  legRLift: 0,
  eyeOpenL: 1,
  eyeOpenR: 1,
  squint: 0,
  lidTilt: 0,
  lookX: 0,
  lookY: 0,
  pupil: 1,
  browY: 0,
  browTilt: 0,
  mouthOpen: 0,
  smile: 0.15,
  blush: 0,
  earL: 0,
  earR: 0,
  tailWag: 0,
  tailRaise: 0,
};

const POSE_KEYS = Object.keys(NEUTRAL_POSE) as PoseKey[];

/** Faster channels: the face reacts quicker than the body. */
const FAST_KEYS = new Set<PoseKey>(['eyeOpenL', 'eyeOpenR', 'squint', 'lookX', 'lookY', 'pupil', 'mouthOpen']);

export function neutralPose(): Pose {
  return { ...NEUTRAL_POSE };
}

export function resetPose(pose: Pose): void {
  Object.assign(pose, NEUTRAL_POSE);
}

/** Eases `current` towards `target`; `responsiveness` is the inverse of the time constant, per second. */
export function easePose(current: Pose, target: Pose, dt: number, responsiveness: number): void {
  const body = 1 - Math.exp(-dt * responsiveness);
  const face = 1 - Math.exp(-dt * responsiveness * 1.8);
  for (const key of POSE_KEYS) {
    const amount = FAST_KEYS.has(key) ? face : body;
    current[key] += (target[key] - current[key]) * amount;
  }
}

/** Moves one channel towards `value` by `weight` (0 keeps it, 1 replaces it). */
export function mixInto(pose: Pose, key: PoseKey, value: number, weight: number): void {
  pose[key] += (value - pose[key]) * clamp01(weight);
}

// Easing helpers --------------------------------------------------------------------------------------

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** 0 → 1 between `start` and `end`, smoothed. */
export function window01(value: number, start: number, end: number): number {
  const p = clamp01((value - start) / (end - start));
  return p * p * (3 - 2 * p);
}

/** Rises during [a, b], holds, then falls during [c, d]. */
export function envelope(value: number, a: number, b: number, c: number, d: number): number {
  return window01(value, a, b) * (1 - window01(value, c, d));
}

export function easeOutBack(p: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
}

export function easeInBack(p: number): number {
  const c = 1.70158;
  return (c + 1) * p ** 3 - c * p ** 2;
}

export function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/** Parabolic jump of height 1 over [start, end]. */
export function arc(value: number, start: number, end: number): number {
  if (value <= start || value >= end) {
    return 0;
  }

  const p = (value - start) / (end - start);
  return 4 * p * (1 - p);
}
