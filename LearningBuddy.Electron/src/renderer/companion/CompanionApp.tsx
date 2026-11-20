import { useEffect, useRef, useState } from 'react';
import { characterInfo, DEFAULT_AVATAR_CHARACTER, type AvatarCharacterId } from '../../core/companion/avatarCharacters';
import { animationDurationMs, findAnimation, type AvatarAnimationId } from '../../core/companion/avatarStoryboard';
import { CompanionAnimationStateMachine } from '../../core/companion/companionAnimationStateMachine';
import type { CompanionStateView } from '../../shared/ipc';
import { CompanionAvatar } from '../avatar/CompanionAvatar';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { usePreferences } from '../react/hooks';

const DRAG_THRESHOLD_PX = 4;

export function CompanionApp() {
  const preferences = usePreferences();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [available, setAvailable] = useState(true);
  const [fallbackCharacter, setFallbackCharacter] = useState<AvatarCharacterId>(DEFAULT_AVATAR_CHARACTER);

  useEffect(() => {
    const element = canvas.current;
    if (!element) {
      return;
    }

    let avatar: CompanionAvatar | null = null;
    let character: AvatarCharacterId = DEFAULT_AVATAR_CHARACTER;
    let completionTimer: ReturnType<typeof setTimeout> | undefined;
    let mounted = true;
    let pressed: { x: number; y: number } | null = null;
    let dragging = false;
    let interactive = false;

    const machine = new CompanionAnimationStateMachine(play, () => api.companionWindow.hidden());

    function play(id: AvatarAnimationId): void {
      document.body.dataset.animation = id;
      avatar?.play(id);
      clearTimeout(completionTimer);
      if (!findAnimation(id).loop) {
        completionTimer = setTimeout(() => machine.animationCompleted(id), animationDurationMs(id));
      }
    }

    const setInteractive = (next: boolean): void => {
      if (next !== interactive) {
        interactive = next;
        api.companionWindow.setInteractive(next);
      }
    };

    const toNdc = (event: PointerEvent): { x: number; y: number } => {
      const bounds = element.getBoundingClientRect();
      return {
        x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        y: -(((event.clientY - bounds.top) / bounds.height) * 2 - 1),
      };
    };

    const onState = (state: CompanionStateView): void => {
      character = state.character;
      setFallbackCharacter(state.character);
      document.body.dataset.character = state.character;
      avatar?.setCharacter(state.character);
      avatar?.setQuestionDisplayed(state.questionDisplayed);
      machine.setPaused(state.paused);
      machine.setQuestionDisplayed(state.questionDisplayed);
      machine.setInvitationDisplayed(state.invitationDisplayed);
      machine.setMoving(state.moving);
      machine.setVisible(state.visible);
    };

    /** Ends a press or a drag; safe to call several times (missed or cancelled releases). */
    const finishPress = (): void => {
      pressed = null;
      if (dragging) {
        dragging = false;
        api.companionWindow.dragEnd();
        machine.setDragging(false);
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }

      // A release may have been lost (button released outside, capture lost): never stay stuck.
      finishPress();
      element.setPointerCapture(event.pointerId);
      pressed = { x: event.screenX, y: event.screenY };
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (pressed && (event.buttons & 1) === 0) {
        finishPress();
      }

      if (!pressed) {
        const ndc = toNdc(event);
        setInteractive(avatar ? avatar.pointerMove(ndc.x, ndc.y) : true);
        return;
      }

      if (!dragging && Math.hypot(event.screenX - pressed.x, event.screenY - pressed.y) > DRAG_THRESHOLD_PX) {
        dragging = true;
        api.companionWindow.dragStart();
        machine.setDragging(true);
      }

      if (dragging) {
        api.companionWindow.dragMove();
      }
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (!pressed) {
        return;
      }

      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }

      const wasDragging = dragging;
      finishPress();
      if (!wasDragging) {
        avatar?.poke();
        api.companionWindow.click();
      }
    };

    const onPointerCancel = (): void => finishPress();

    const onPointerLeave = (): void => {
      if (!pressed) {
        avatar?.pointerLeave();
        setInteractive(false);
      }
    };

    const onContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
      api.companionWindow.contextMenu();
    };

    const onResize = (): void => avatar?.resize(element.clientWidth, element.clientHeight);

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerCancel);
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onResize);
    api.companionWindow.onState(onState);
    api.companionWindow.onReaction((reaction) => {
      avatar?.recordReaction(reaction);
      machine.setReaction(reaction);
    });
    api.companionWindow.onPointer((pointer) => {
      avatar?.trackWindow(pointer.centerX, pointer.centerY);
      avatar?.lookAt({ x: pointer.cursorX - pointer.centerX, y: pointer.cursorY - pointer.centerY }, pointer.size);
    });

    void CompanionAvatar.create(element, { character }).then((created) => {
      if (!mounted) {
        created.dispose();
        return;
      }

      avatar = created;
      document.body.dataset.backend = created.backend;
      created.setCharacter(character);
      if (machine.currentAnimationId) {
        created.play(machine.currentAnimationId);
      }
    }).catch((error: unknown) => {
      if (mounted) {
        console.error('Rendu 3D indisponible :', error);
        setAvailable(false);
        document.body.dataset.backend = 'none';
      }
    });

    return () => {
      mounted = false;
      clearTimeout(completionTimer);
      avatar?.dispose();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerCancel);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <>
      <canvas id="avatar" ref={canvas} hidden={!available} role="img"
        aria-label={preferences ? `${t('ApplicationTitle')} — ${t('CompanionDragHint')}` : t('CompanionDragHint')}
        data-react-app="companion" />
      <div id="fallback" hidden={available}>{characterInfo(fallbackCharacter).emoji}</div>
    </>
  );
}
