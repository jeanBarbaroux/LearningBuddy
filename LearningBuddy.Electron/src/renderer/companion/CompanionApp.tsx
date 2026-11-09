import { useEffect, useRef, useState } from 'react';
import { animationDurationMs, findAnimation, type AvatarAnimationId } from '../../core/companion/avatarStoryboard';
import { CompanionAnimationStateMachine } from '../../core/companion/companionAnimationStateMachine';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { usePreferences } from '../react/hooks';
import { CompanionAvatar } from './avatar';

const DRAG_THRESHOLD_PX = 4;

export function CompanionApp() {
  const preferences = usePreferences();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    const element = canvas.current;
    if (!element) {
      return;
    }

    let avatar: CompanionAvatar | null = null;
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

    const isOverAvatar = (event: PointerEvent): boolean => {
      if (!avatar) {
        return true;
      }

      const bounds = element.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
      return avatar.hitTest(x, y);
    };

    const onState = (state: { paused: boolean; questionDisplayed: boolean; invitationDisplayed: boolean; moving: boolean; visible: boolean }): void => {
      avatar?.setQuestionDisplayed(state.questionDisplayed);
      machine.setPaused(state.paused);
      machine.setQuestionDisplayed(state.questionDisplayed);
      machine.setInvitationDisplayed(state.invitationDisplayed);
      machine.setMoving(state.moving);
      machine.setVisible(state.visible);
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }

      element.setPointerCapture(event.pointerId);
      pressed = { x: event.screenX, y: event.screenY };
      dragging = false;
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!pressed) {
        setInteractive(isOverAvatar(event));
        return;
      }

      if (!dragging && Math.hypot(event.screenX - pressed.x, event.screenY - pressed.y) > DRAG_THRESHOLD_PX) {
        dragging = true;
        api.companionWindow.dragStart();
      }

      if (dragging) {
        api.companionWindow.dragMove();
      }
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (!pressed) {
        return;
      }

      element.releasePointerCapture(event.pointerId);
      pressed = null;
      if (dragging) {
        dragging = false;
        api.companionWindow.dragEnd();
      } else {
        api.companionWindow.click();
      }
    };

    const onPointerLeave = (): void => {
      if (!pressed) {
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
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onResize);
    api.companionWindow.onState(onState);
    api.companionWindow.onReaction((reaction) => machine.setReaction(reaction));

    void CompanionAvatar.create(element).then((created) => {
      if (!mounted) {
        return;
      }

      avatar = created;
      document.body.dataset.backend = created.backend;
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
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
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
      <div id="fallback" hidden={available}>🦉</div>
    </>
  );
}