import { animationDurationMs, findAnimation, type AvatarAnimationId } from '../../core/avatarStoryboard';
import { CompanionAnimationStateMachine } from '../../core/companionAnimationStateMachine';
import { CompanionAvatar } from './avatar';

const DRAG_THRESHOLD_PX = 4;

const api = window.certifBuddy;
const canvas = document.getElementById('avatar') as HTMLCanvasElement;
let avatar: CompanionAvatar | null = null;
let completionTimer: ReturnType<typeof setTimeout> | undefined;

// One-shot completions are timed from the storyboard so the behaviour does not depend on the frame rate.
const machine = new CompanionAnimationStateMachine(play, () => api.companionHidden());

function play(id: AvatarAnimationId): void {
  document.body.dataset.animation = id;
  avatar?.play(id);
  clearTimeout(completionTimer);
  if (!findAnimation(id).loop) {
    completionTimer = setTimeout(() => machine.animationCompleted(id), animationDurationMs(id));
  }
}

api.onCompanionState((state) => {
  avatar?.setQuestionDisplayed(state.questionDisplayed);
  machine.setPaused(state.paused);
  machine.setQuestionDisplayed(state.questionDisplayed);
  machine.setMoving(state.moving);
  machine.setVisible(state.visible);
});
api.onCompanionReaction((reaction) => machine.setReaction(reaction));

// Pointer handling: a short press is a click (review now), a longer move drags the window.
let pressed: { x: number; y: number } | null = null;
let dragging = false;
let interactive = false;

function setInteractive(next: boolean): void {
  if (next !== interactive) {
    interactive = next;
    api.companionSetInteractive(next);
  }
}

function isOverAvatar(event: PointerEvent | MouseEvent): boolean {
  if (!avatar) {
    return true;
  }

  const bounds = canvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  const y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  return avatar.hitTest(x, y);
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) {
    return;
  }

  canvas.setPointerCapture(event.pointerId);
  pressed = { x: event.screenX, y: event.screenY };
  dragging = false;
});

canvas.addEventListener('pointermove', (event) => {
  if (!pressed) {
    setInteractive(isOverAvatar(event));
    return;
  }

  if (!dragging && Math.hypot(event.screenX - pressed.x, event.screenY - pressed.y) > DRAG_THRESHOLD_PX) {
    dragging = true;
    api.companionDragStart();
  }

  if (dragging) {
    api.companionDragMove();
  }
});

canvas.addEventListener('pointerup', (event) => {
  if (!pressed) {
    return;
  }

  canvas.releasePointerCapture(event.pointerId);
  pressed = null;
  if (dragging) {
    dragging = false;
    api.companionDragEnd();
  } else {
    api.companionClick();
  }
});

canvas.addEventListener('pointerleave', () => {
  if (!pressed) {
    setInteractive(false);
  }
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  api.companionContextMenu();
});

window.addEventListener('resize', () => avatar?.resize(canvas.clientWidth, canvas.clientHeight));

async function initializeAvatar(): Promise<void> {
  try {
    avatar = await CompanionAvatar.create(canvas);
    document.body.dataset.backend = avatar.backend;
    if (machine.currentAnimationId) {
      avatar.play(machine.currentAnimationId);
    }
  } catch (error) {
    console.error('Rendu 3D indisponible :', error);
    canvas.hidden = true;
    document.getElementById('fallback')!.hidden = false;
    document.body.dataset.backend = 'none';
  }
}

void initializeAvatar();
