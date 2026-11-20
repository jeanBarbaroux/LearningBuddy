import { useEffect, useRef, useState } from 'react';
import type { AvatarCharacterId } from '../../../core/companion/avatarCharacters';
import {
  animationDurationMs,
  COMPANION_REACTIONS,
  findAnimation,
  type AvatarAnimationId,
  type CompanionReaction,
} from '../../../core/companion/avatarStoryboard';
import { CompanionAnimationStateMachine } from '../../../core/companion/companionAnimationStateMachine';
import type { TextKey } from '../../../shared/i18n/texts';
import { CompanionAvatar } from '../../avatar/CompanionAvatar';
import { t } from '../../lib/i18n';

/** Self-assessment button whose reaction each preview button shows. */
const REACTION_LABELS: Record<CompanionReaction, TextKey> = {
  sad: 'ReviewAgain',
  think: 'ReviewHard',
  happy: 'ReviewGood',
  celebrate: 'ReviewEasy',
};

/**
 * Live 3D preview of the chosen character on the Avatar page. It follows the mouse in the whole window and
 * can be hovered, petted, tickled and clicked like the desktop companion.
 */
export function AvatarPreview({ character, active }: { readonly character: AvatarCharacterId; readonly active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const avatar = useRef<CompanionAvatar | null>(null);
  const machine = useRef<CompanionAnimationStateMachine | null>(null);
  const characterRef = useRef(character);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    const element = canvas.current;
    if (!element) {
      return;
    }

    let mounted = true;
    let completionTimer: ReturnType<typeof setTimeout> | undefined;
    const stateMachine = new CompanionAnimationStateMachine((id: AvatarAnimationId) => {
      avatar.current?.play(id);
      element.dataset.animation = id;
      clearTimeout(completionTimer);
      if (!findAnimation(id).loop) {
        completionTimer = setTimeout(() => stateMachine.animationCompleted(id), animationDurationMs(id));
      }
    });
    machine.current = stateMachine;

    const toNdc = (event: PointerEvent): { x: number; y: number } => {
      const bounds = element.getBoundingClientRect();
      return {
        x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        y: -(((event.clientY - bounds.top) / bounds.height) * 2 - 1),
      };
    };

    const onWindowPointerMove = (event: PointerEvent): void => {
      const bounds = element.getBoundingClientRect();
      avatar.current?.lookAt({
        x: event.clientX - (bounds.left + bounds.width / 2),
        y: event.clientY - (bounds.top + bounds.height / 2),
      }, bounds.width);
    };

    const onPointerMove = (event: PointerEvent): void => {
      const ndc = toNdc(event);
      const over = avatar.current?.pointerMove(ndc.x, ndc.y) ?? false;
      element.style.cursor = over ? 'pointer' : 'default';
    };

    const onPointerLeave = (): void => avatar.current?.pointerLeave();
    const onClick = (event: MouseEvent): void => {
      const bounds = element.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
      if (avatar.current?.hitTest(x, y)) {
        avatar.current.poke();
      }
    };

    const resize = new ResizeObserver(() => avatar.current?.resize(element.clientWidth, element.clientHeight));
    resize.observe(element);
    window.addEventListener('pointermove', onWindowPointerMove);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('click', onClick);

    void CompanionAvatar.create(element, { character: characterRef.current, grounded: false }).then((created) => {
      if (!mounted) {
        created.dispose();
        return;
      }

      avatar.current = created;
      created.setCharacter(characterRef.current);
      stateMachine.setVisible(true);
    }).catch((error: unknown) => {
      if (mounted) {
        console.error('Aperçu 3D indisponible :', error);
        setAvailable(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(completionTimer);
      resize.disconnect();
      window.removeEventListener('pointermove', onWindowPointerMove);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('click', onClick);
      avatar.current?.dispose();
      avatar.current = null;
      machine.current = null;
    };
  }, []);

  useEffect(() => {
    characterRef.current = character;
    avatar.current?.setCharacter(character);
  }, [character]);

  useEffect(() => {
    avatar.current?.setRunning(active);
  }, [active]);

  const tryReaction = (reaction: CompanionReaction): void => {
    avatar.current?.recordReaction(reaction);
    machine.current?.setReaction(reaction);
  };

  return (
    <div className="avatar-preview">
      <canvas ref={canvas} className="avatar-preview-canvas" hidden={!available} role="img" aria-label={t('AvatarPreviewLabel')} />
      {available && (
        <div className="stack avatar-preview-reactions">
          <span className="muted small">{t('AvatarTryReaction')}</span>
          <div className="row">
            {COMPANION_REACTIONS.map((reaction) => (
              <button key={reaction} type="button" className="small" onClick={() => tryReaction(reaction)}>
                {t(REACTION_LABELS[reaction])}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
