// Characters the user can choose for the desktop companion (Avatar page).
import type { TextKey } from '../../shared/i18n/texts';

export const AVATAR_CHARACTERS = ['owl', 'fox', 'cat', 'robot'] as const;

export type AvatarCharacterId = (typeof AVATAR_CHARACTERS)[number];

export const DEFAULT_AVATAR_CHARACTER: AvatarCharacterId = 'owl';

export interface AvatarCharacterInfo {
  readonly id: AvatarCharacterId;
  readonly emoji: string;
  readonly name: TextKey;
  readonly description: TextKey;
}

export const AVATAR_CHARACTER_INFO: readonly AvatarCharacterInfo[] = [
  { id: 'owl', emoji: '🦉', name: 'CharacterOwl', description: 'CharacterOwlDescription' },
  { id: 'fox', emoji: '🦊', name: 'CharacterFox', description: 'CharacterFoxDescription' },
  { id: 'cat', emoji: '🐱', name: 'CharacterCat', description: 'CharacterCatDescription' },
  { id: 'robot', emoji: '🤖', name: 'CharacterRobot', description: 'CharacterRobotDescription' },
];

export function isAvatarCharacter(value: unknown): value is AvatarCharacterId {
  return typeof value === 'string' && (AVATAR_CHARACTERS as readonly string[]).includes(value);
}

export function characterInfo(id: AvatarCharacterId): AvatarCharacterInfo {
  return AVATAR_CHARACTER_INFO.find((info) => info.id === id) ?? AVATAR_CHARACTER_INFO[0]!;
}
