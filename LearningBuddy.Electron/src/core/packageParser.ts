// Port of the essential rules of LearningBuddy.Core/PackageImportParser.cs (format "learning-buddy", schema v1).
import type { CardChoice, CardType, ImportedCard, ImportedPackage } from './types';

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_CARDS = 5000;
const MAX_TAGS_PER_CARD = 20;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MIN_CHOICES = 2;
const MAX_CHOICES = 10;
const MAX_CHOICE_LENGTH = 500;

const PACKAGE_PROPERTIES = new Set(['format', 'schemaVersion', 'title', 'cards']);
const CARD_PROPERTIES = new Set([
  'type', 'question', 'image', 'answer', 'answerImage', 'explanation', 'language', 'tags', 'choices',
]);
const CHOICE_PROPERTIES = new Set(['text', 'correct']);

export class PackageImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageImportError';
  }
}

type JsonObject = Record<string, unknown>;

export function parsePackage(json: string): ImportedPackage {
  if (json.length > MAX_FILE_SIZE_BYTES) {
    throw new PackageImportError(`Le fichier dépasse ${MAX_FILE_SIZE_BYTES / 1024 / 1024} Mo.`);
  }

  let root: unknown;
  try {
    root = JSON.parse(json.charCodeAt(0) === 0xfeff ? json.slice(1) : json);
  } catch (error) {
    throw new PackageImportError(`JSON mal formé : ${(error as Error).message}`);
  }

  const rootObject = expectObject(root, '$', 'la racine JSON doit être un objet');
  checkKnownProperties(rootObject, PACKAGE_PROPERTIES, '$');
  if (rootObject.format !== 'learning-buddy') {
    throw invalid('$.format', 'la valeur attendue est « learning-buddy »');
  }

  if (!('schemaVersion' in rootObject)) {
    throw invalid('$.schemaVersion', 'champ obligatoire absent');
  }

  if (!Number.isInteger(rootObject.schemaVersion)) {
    throw invalid('$.schemaVersion', 'un entier est attendu');
  }

  if (rootObject.schemaVersion !== 1) {
    throw invalid('$.schemaVersion', `la version ${String(rootObject.schemaVersion)} n’est pas prise en charge`);
  }

  const title = requiredString(rootObject, 'title', '$').trim();
  if (countCharacters(title) < 1 || countCharacters(title) > 100) {
    throw invalid('$.title', 'le titre doit contenir entre 1 et 100 caractères après trim');
  }

  if (!('cards' in rootObject)) {
    throw invalid('$.cards', 'champ obligatoire absent');
  }

  if (!Array.isArray(rootObject.cards)) {
    throw invalid('$.cards', 'un tableau est attendu');
  }

  if (rootObject.cards.length < 1 || rootObject.cards.length > MAX_CARDS) {
    throw invalid('$.cards', `le paquet doit contenir entre 1 et ${MAX_CARDS} cartes`);
  }

  return { title, cards: rootObject.cards.map((card, index) => readCard(card, `$.cards[${index}]`)) };
}

/** Builds the answer stored for a QCM whose author did not write one. */
export function deriveQcmAnswer(choices: readonly CardChoice[]): string {
  return choices.filter((choice) => choice.correct).map((choice) => choice.text).join('\n');
}

function readCard(value: unknown, path: string): ImportedCard {
  const card = expectObject(value, path, 'une carte doit être un objet');
  checkKnownProperties(card, CARD_PROPERTIES, path);
  const type = readType(card, path);
  const image = readImage(card, 'image', path);
  const answerImage = readImage(card, 'answerImage', path);

  let question = '';
  if (!('question' in card)) {
    if (image === null) {
      throw invalid(`${path}.question`, 'champ obligatoire absent');
    }
  } else {
    question = requiredString(card, 'question', path);
  }

  const choices = readChoices(card, type, path);
  let answer: string;
  if (type === 'qcm') {
    const explicit = optionalString(card, 'answer', path);
    answer = explicit && explicit.trim() !== '' ? explicit : deriveQcmAnswer(choices);
  } else {
    answer = requiredString(card, 'answer', path);
  }

  const explanation = card.explanation === undefined || card.explanation === null
    ? null
    : requiredString(card, 'explanation', path, 'une chaîne ou null est attendu');

  let language: string | null = null;
  if ('language' in card) {
    language = requiredString(card, 'language', path, 'une balise de langue BCP 47 est attendue');
    if (!/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(language)) {
      throw invalid(`${path}.language`, 'la balise de langue BCP 47 est invalide');
    }
  }

  return { type, question, answer, explanation, language, tags: readTags(card, path), choices, image, answerImage };
}

function readType(card: JsonObject, path: string): CardType {
  if (!('type' in card)) {
    return 'card';
  }

  const value = typeof card.type === 'string' ? card.type.toLowerCase() : null;
  if (value === 'card' || value === 'qcm') {
    return value;
  }

  throw invalid(`${path}.type`, 'le type doit être « Card » ou « QCM »');
}

function readChoices(card: JsonObject, type: CardType, path: string): CardChoice[] {
  const choicesPath = `${path}.choices`;
  if (!('choices' in card)) {
    if (type === 'qcm') {
      throw invalid(choicesPath, 'champ obligatoire absent');
    }

    return [];
  }

  if (type === 'card') {
    throw invalid(choicesPath, 'les choix sont réservés aux cartes QCM');
  }

  if (!Array.isArray(card.choices)) {
    throw invalid(choicesPath, 'un tableau est attendu');
  }

  if (card.choices.length < MIN_CHOICES || card.choices.length > MAX_CHOICES) {
    throw invalid(choicesPath, `un QCM doit proposer entre ${MIN_CHOICES} et ${MAX_CHOICES} choix`);
  }

  const seen = new Set<string>();
  const choices = card.choices.map((value, index) => {
    const choicePath = `${choicesPath}[${index}]`;
    const choice = expectObject(value, choicePath, 'un choix doit être un objet');
    checkKnownProperties(choice, CHOICE_PROPERTIES, choicePath);
    const text = requiredString(choice, 'text', choicePath).trim();
    if (countCharacters(text) < 1 || countCharacters(text) > MAX_CHOICE_LENGTH) {
      throw invalid(choicesPath, `un choix doit contenir entre 1 et ${MAX_CHOICE_LENGTH} caractères`);
    }

    if (!seen.add(text.toLowerCase())) {
      throw invalid(choicesPath, 'les choix doivent être distincts');
    }

    if ('correct' in choice && typeof choice.correct !== 'boolean') {
      throw invalid(`${choicePath}.correct`, 'un booléen est attendu');
    }

    return { text, correct: choice.correct === true };
  });

  if (!choices.some((choice) => choice.correct)) {
    throw invalid(choicesPath, 'au moins un choix doit être correct');
  }

  return choices;
}

function readTags(card: JsonObject, path: string): string[] {
  if (!('tags' in card)) {
    return [];
  }

  if (!Array.isArray(card.tags)) {
    throw invalid(`${path}.tags`, 'un tableau de chaînes est attendu');
  }

  if (card.tags.length > MAX_TAGS_PER_CARD) {
    throw invalid(`${path}.tags`, `au plus ${MAX_TAGS_PER_CARD} tags sont autorisés`);
  }

  const unique = new Set<string>();
  const tags: string[] = [];
  card.tags.forEach((value, index) => {
    if (typeof value !== 'string') {
      throw invalid(`${path}.tags[${index}]`, 'un tag doit être une chaîne');
    }

    const tag = value.trim();
    if (countCharacters(tag) < 1 || countCharacters(tag) > 64) {
      throw invalid(`${path}.tags[${index}]`, 'un tag doit contenir entre 1 et 64 caractères après trim');
    }

    if (!unique.has(tag.toLowerCase())) {
      unique.add(tag.toLowerCase());
      tags.push(tag);
    }
  });
  return tags;
}

function readImage(card: JsonObject, property: string, path: string): string | null {
  const value = card[property];
  if (value === undefined || value === null) {
    return null;
  }

  const imagePath = `${path}.${property}`;
  if (typeof value !== 'string') {
    throw invalid(imagePath, 'une chaîne base64 ou null est attendue');
  }

  if (value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    throw invalid(imagePath, 'l’image dépasse la taille maximale autorisée');
  }

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw invalid(imagePath, 'une chaîne base64 valide est attendue');
  }

  if (imageMimeType(value) === null) {
    throw invalid(imagePath, 'seules les images PNG ou JPEG sont acceptées');
  }

  return value;
}

/** Detects PNG and JPEG from the base64 signature. */
export function imageMimeType(base64: string): 'image/png' | 'image/jpeg' | null {
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  return null;
}

function expectObject(value: unknown, path: string, message: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(path, message);
  }

  return value as JsonObject;
}

function checkKnownProperties(value: JsonObject, allowed: ReadonlySet<string>, path: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    throw invalid(`${path}.${unknown}`, 'propriété inconnue');
  }
}

function requiredString(value: JsonObject, property: string, path: string, message = 'une chaîne est attendue'): string {
  if (!(property in value)) {
    throw invalid(`${path}.${property}`, 'champ obligatoire absent');
  }

  const result = value[property];
  if (typeof result !== 'string') {
    throw invalid(`${path}.${property}`, message);
  }

  return result;
}

function optionalString(value: JsonObject, property: string, path: string): string | null {
  const result = value[property];
  if (result === undefined || result === null) {
    return null;
  }

  if (typeof result !== 'string') {
    throw invalid(`${path}.${property}`, 'une chaîne est attendue');
  }

  return result;
}

function invalid(path: string, reason: string): PackageImportError {
  return new PackageImportError(`${path} : ${reason}.`);
}

function countCharacters(value: string): number {
  return [...value].length;
}
