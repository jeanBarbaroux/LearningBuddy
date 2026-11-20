import type { AvatarCharacterId } from '../../../core/companion/avatarCharacters';
import type { CharacterRig, MoodUniforms } from '../rig';
import { buildCat } from './cat';
import { buildFox } from './fox';
import { buildOwl } from './owl';
import { buildRobot } from './robot';

const BUILDERS: Record<AvatarCharacterId, (mood: MoodUniforms) => CharacterRig> = {
  owl: buildOwl,
  fox: buildFox,
  cat: buildCat,
  robot: buildRobot,
};

export function buildCharacter(id: AvatarCharacterId, mood: MoodUniforms): CharacterRig {
  return BUILDERS[id](mood);
}
