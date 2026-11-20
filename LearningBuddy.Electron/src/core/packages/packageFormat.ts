// The "learning-buddy" v1 JSON package format: strict import, export and template
// (v1 PackageImportParser, PackageExportSerializer and PackageImportTemplate).
import { isValidLanguageTag } from '../cards/bcp47';
import { deriveAnswer, normalizeChoices } from '../cards/cardChoices';
import { MAX_TAG_LENGTH, MAX_TAGS } from '../cards/cardContent';
import { checkImage } from '../cards/images';
import { LocalizedError, type MessageArgument } from '../errors';
import type { CardChoice, CardContent, CardType, PackageContent } from '../model';
import type { TextKey } from '../../shared/i18n/texts';
import { foldCase, hasLengthBetween, isBlank } from '../text';

export const PACKAGE_FORMAT = 'learning-buddy';
export const SCHEMA_VERSION = 1;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_CARDS_PER_PACKAGE = 5000;
export const MAX_PACKAGE_NAME_LENGTH = 100;
const MAX_JSON_DEPTH = 64;

const PACKAGE_PROPERTIES = new Set(['format', 'schemaVersion', 'title', 'cards']);
const CARD_PROPERTIES = new Set(['type', 'question', 'image', 'answer', 'answerImage', 'explanation', 'language', 'tags', 'choices']);
const CHOICE_PROPERTIES = new Set(['text', 'correct']);

type JsonObject = Readonly<Record<string, unknown>>;

/** Decodes a package file as strict UTF-8, without its byte order mark. */
export function decodePackageFile(bytes: Uint8Array): string {
  if (bytes.length > MAX_FILE_BYTES) {
    throw new LocalizedError('ParserFileTooLarge', [MAX_FILE_BYTES / 1024 / 1024]);
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new LocalizedError('ParserInvalidUtf8');
  }
}

/**
 * Reads a package file. Unknown or duplicated properties are refused; blank questions and answers are
 * kept so that the import preview can have them corrected. Throws a LocalizedError with the JSON path
 * of the first faulty value.
 */
export function parsePackage(json: string): PackageContent {
  const text = json.startsWith('\uFEFF') ? json.slice(1) : json;
  new JsonScanner(text).scan();
  return readPackage(JSON.parse(text));
}

/** Indented JSON of a package, without review data; it is always importable again. */
export function serializePackage(title: string, cards: readonly CardContent[]): string {
  const json = JSON.stringify({
    format: PACKAGE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    title,
    cards: cards.map((card) => withoutNulls({
      type: card.type === 'qcm' ? 'QCM' : 'Card',
      question: card.question,
      image: card.image,
      answer: card.answer,
      answerImage: card.answerImage,
      explanation: card.explanation,
      language: card.language,
      tags: [...card.tags],
      choices: card.type === 'qcm' ? card.choices.map((choice) => ({ text: choice.text, correct: choice.correct })) : null,
    })),
  }, null, 2);

  // Never save an export that the import would reject.
  parsePackage(json);
  return json;
}

const INVALID_FILE_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_FILE_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/** File name proposed for an export: the package name without the characters refused by Windows. */
export function exportFileName(packageName: string): string {
  let base = packageName.replace(INVALID_FILE_CHARACTERS, '_').trim().replace(/[. ]+$/, '');
  if (base === '') {
    base = 'learning-buddy-package';
  }

  return `${RESERVED_FILE_NAMES.test(base) ? `_${base}` : base}.json`;
}

/** Importable example showing a classic card, a single-answer QCM and a multiple-answer QCM. */
export const PACKAGE_TEMPLATE = `{
  "format": "learning-buddy",
  "schemaVersion": 1,
  "title": "Mon paquet de révision",
  "cards": [
    {
      "type": "Card",
      "question": "Remplacez cette question",
      "answer": "Remplacez cette réponse",
      "explanation": "Explication facultative",
      "language": "fr",
      "tags": ["exemple"]
    },
    {
      "type": "QCM",
      "question": "Exemple de QCM à une seule bonne réponse : combien font 2 + 2 ?",
      "choices": [
        { "text": "3", "correct": false },
        { "text": "4", "correct": true },
        { "text": "5", "correct": false }
      ],
      "explanation": "Une seule bonne réponse : les choix s’affichent avec des boutons radio. Le champ « answer » est omis : la réponse reprend alors les bonnes réponses.",
      "language": "fr",
      "tags": ["exemple", "qcm"]
    },
    {
      "type": "QCM",
      "question": "Exemple de QCM à plusieurs bonnes réponses : quels nombres sont pairs ?",
      "answer": "2 et 4 sont pairs.",
      "choices": [
        { "text": "1", "correct": false },
        { "text": "2", "correct": true },
        { "text": "3", "correct": false },
        { "text": "4", "correct": true }
      ],
      "explanation": "Plusieurs bonnes réponses : les choix s’affichent avec des cases à cocher. Pour un QCM, « answer » est facultatif ; s’il est fourni, il s’affiche à la révélation.",
      "language": "fr",
      "tags": ["exemple", "qcm"]
    }
  ]
}
`;

// ---------------------------------------------------------------------------------------------------
// Reading

function readPackage(root: unknown): PackageContent {
  const object = expectObject(root, '$', 'ParserRootObject');
  checkProperties(object, PACKAGE_PROPERTIES, '$');
  if (requiredString(object, 'format', '$') !== PACKAGE_FORMAT) {
    throw invalid('$.format', 'ParserExpectedFormat');
  }

  if (!Object.hasOwn(object, 'schemaVersion')) {
    throw invalid('$.schemaVersion', 'ParserRequiredField');
  }

  const version = object.schemaVersion;
  if (typeof version !== 'number' || !Number.isSafeInteger(version)) {
    throw invalid('$.schemaVersion', 'ParserExpectedInteger');
  }

  if (version !== SCHEMA_VERSION) {
    throw invalid('$.schemaVersion', 'ParserVersionUnsupported', [String(version)]);
  }

  const title = requiredString(object, 'title', '$').trim();
  if (!hasLengthBetween(title, 1, MAX_PACKAGE_NAME_LENGTH)) {
    throw invalid('$.title', 'ParserTitleLength');
  }

  if (!Object.hasOwn(object, 'cards')) {
    throw invalid('$.cards', 'ParserRequiredField');
  }

  const cards = object.cards;
  if (!Array.isArray(cards)) {
    throw invalid('$.cards', 'ParserExpectedArray');
  }

  if (cards.length < 1 || cards.length > MAX_CARDS_PER_PACKAGE) {
    throw invalid('$.cards', 'ParserCardCount', [String(MAX_CARDS_PER_PACKAGE)]);
  }

  return { title, cards: cards.map(readCard) };
}

function readCard(value: unknown, index: number): CardContent {
  const path = `$.cards[${index}]`;
  const card = expectObject(value, path, 'ParserCardObject');
  checkProperties(card, CARD_PROPERTIES, path);
  const type = readType(card, path);
  const image = readImage(card, 'image', path);
  const answerImage = readImage(card, 'answerImage', path);

  let question = '';
  if (!Object.hasOwn(card, 'question')) {
    if (image === null) {
      throw invalid(`${path}.question`, 'ParserRequiredField');
    }
  } else {
    question = expectString(card.question, `${path}.question`);
  }

  const choices = readChoices(card, type, path);
  let answer = type === 'qcm' ? optionalString(card, 'answer', path) ?? '' : requiredString(card, 'answer', path);
  if (type === 'qcm' && isBlank(answer)) {
    answer = deriveAnswer(choices);
  }

  return {
    type,
    question,
    answer,
    explanation: optionalString(card, 'explanation', path),
    language: readLanguage(card, path),
    tags: readTags(card, path),
    choices,
    image,
    answerImage,
  };
}

function readType(card: JsonObject, path: string): CardType {
  if (!Object.hasOwn(card, 'type')) {
    return 'card';
  }

  const type = typeof card.type === 'string' ? card.type.toLowerCase() : null;
  if (type !== 'card' && type !== 'qcm') {
    throw invalid(`${path}.type`, 'ParserCardType');
  }

  return type;
}

function readChoices(card: JsonObject, type: CardType, path: string): CardChoice[] {
  const choicesPath = `${path}.choices`;
  if (!Object.hasOwn(card, 'choices')) {
    if (type === 'qcm') {
      throw invalid(choicesPath, 'ParserRequiredField');
    }

    return [];
  }

  if (type === 'card') {
    throw invalid(choicesPath, 'ParserChoicesOnlyForQcm');
  }

  if (!Array.isArray(card.choices)) {
    throw invalid(choicesPath, 'ParserExpectedArray');
  }

  const choices = card.choices.map((value: unknown, index): CardChoice => {
    const choicePath = `${choicesPath}[${index}]`;
    const choice = expectObject(value, choicePath, 'ParserChoiceObject');
    checkProperties(choice, CHOICE_PROPERTIES, choicePath);
    const text = requiredString(choice, 'text', choicePath);
    if (Object.hasOwn(choice, 'correct') && typeof choice.correct !== 'boolean') {
      throw invalid(`${choicePath}.correct`, 'ParserExpectedBoolean');
    }

    return { text, correct: choice.correct === true };
  });
  return normalizeChoices(type, choices, choicesPath);
}

function readImage(card: JsonObject, property: 'image' | 'answerImage', path: string): string | null {
  const value = card[property];
  if (value === undefined || value === null) {
    return null;
  }

  const imagePath = `${path}.${property}`;
  if (typeof value !== 'string') {
    throw invalid(imagePath, 'ParserExpectedStringOrNull');
  }

  switch (checkImage(value)) {
    case null:
      return value;
    case 'size':
      throw invalid(imagePath, 'ParserImageSize');
    case 'encoding':
      throw invalid(imagePath, 'ParserImageEncoding');
    case 'format':
      throw invalid(imagePath, 'ParserImageFormat');
  }
}

function readLanguage(card: JsonObject, path: string): string | null {
  const value = card.language;
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw invalid(`${path}.language`, 'ParserExpectedLanguageTag');
  }

  if (!isValidLanguageTag(value)) {
    throw invalid(`${path}.language`, 'ParserInvalidLanguageTag');
  }

  return value;
}

function readTags(card: JsonObject, path: string): string[] {
  if (!Object.hasOwn(card, 'tags')) {
    return [];
  }

  if (!Array.isArray(card.tags)) {
    throw invalid(`${path}.tags`, 'ParserExpectedStringArray');
  }

  if (card.tags.length > MAX_TAGS) {
    throw invalid(`${path}.tags`, 'ParserMaxTags', [MAX_TAGS]);
  }

  const seen = new Set<string>();
  const tags: string[] = [];
  card.tags.forEach((value: unknown, index) => {
    const tagPath = `${path}.tags[${index}]`;
    if (typeof value !== 'string') {
      throw invalid(tagPath, 'ParserTagString');
    }

    const tag = value.trim();
    if (!hasLengthBetween(tag, 1, MAX_TAG_LENGTH)) {
      throw invalid(tagPath, 'ParserTagLength');
    }

    if (!seen.has(foldCase(tag))) {
      seen.add(foldCase(tag));
      tags.push(tag);
    }
  });
  return tags;
}

function expectObject(value: unknown, path: string, key: TextKey): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(path, key);
  }

  return value as JsonObject;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw invalid(path, 'ParserExpectedString');
  }

  return value;
}

function requiredString(object: JsonObject, property: string, parentPath: string): string {
  if (!Object.hasOwn(object, property)) {
    throw invalid(`${parentPath}.${property}`, 'ParserRequiredField');
  }

  return expectString(object[property], `${parentPath}.${property}`);
}

function optionalString(object: JsonObject, property: string, parentPath: string): string | null {
  const value = object[property];
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw invalid(`${parentPath}.${property}`, 'ParserExpectedStringOrNull');
  }

  return value;
}

function checkProperties(object: JsonObject, allowed: ReadonlySet<string>, path: string): void {
  const unknown = Object.keys(object).find((property) => !allowed.has(property));
  if (unknown !== undefined) {
    throw invalid(`${path}.${unknown}`, 'ParserUnknownProperty');
  }
}

function invalid(path: string, key: TextKey, args: readonly MessageArgument[] = []): LocalizedError {
  return new LocalizedError(key, args, path);
}

function withoutNulls(object: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null));
}

// ---------------------------------------------------------------------------------------------------
// Strict syntax check: JSON.parse accepts duplicated properties, has no depth limit and does not always
// report where the text is malformed.

const WHITESPACE = /[ \t\n\r]*/y;
const STRING_RUN = /[^"\\\u0000-\u001f]*/y;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const HEX4 = /^[0-9a-fA-F]{4}$/;

class JsonScanner {
  private offset = 0;
  private duplicate: string | null = null;

  constructor(private readonly json: string) {}

  /** Throws for the first syntax error, or else for the first duplicated property. */
  scan(): void {
    this.skipWhitespace();
    this.value('$', 0);
    this.skipWhitespace();
    if (this.offset < this.json.length) {
      this.fail();
    }

    if (this.duplicate !== null) {
      throw invalid(this.duplicate, 'ParserDuplicateProperty');
    }
  }

  private value(path: string, depth: number): void {
    switch (this.json[this.offset]) {
      case '{':
        this.object(path, depth + 1);
        return;
      case '[':
        this.array(path, depth + 1);
        return;
      case '"':
        this.string();
        return;
      case 't':
        this.literal('true');
        return;
      case 'f':
        this.literal('false');
        return;
      case 'n':
        this.literal('null');
        return;
      default:
        this.match(NUMBER);
    }
  }

  private object(path: string, depth: number): void {
    this.enter(depth);
    if (this.json[this.offset] === '}') {
      this.offset += 1;
      return;
    }

    const keys = new Set<string>();
    for (;;) {
      if (this.json[this.offset] !== '"') {
        this.fail();
      }

      const start = this.offset;
      this.string();
      const literal = this.json.slice(start, this.offset);
      const key = literal.includes('\\') ? JSON.parse(literal) as string : literal.slice(1, -1);
      const childPath = `${path}.${key}`;
      if (keys.has(key)) {
        this.duplicate ??= childPath;
      }

      keys.add(key);
      this.skipWhitespace();
      this.expect(':');
      this.skipWhitespace();
      this.value(childPath, depth);
      if (!this.separator('}')) {
        return;
      }
    }
  }

  private array(path: string, depth: number): void {
    this.enter(depth);
    if (this.json[this.offset] === ']') {
      this.offset += 1;
      return;
    }

    for (let index = 0; ; index += 1) {
      this.value(`${path}[${index}]`, depth);
      if (!this.separator(']')) {
        return;
      }
    }
  }

  private enter(depth: number): void {
    if (depth > MAX_JSON_DEPTH) {
      this.fail();
    }

    this.offset += 1;
    this.skipWhitespace();
  }

  /** After a member: true for a comma followed by another member, false for the closing character. */
  private separator(closing: '}' | ']'): boolean {
    this.skipWhitespace();
    if (this.json[this.offset] === ',') {
      this.offset += 1;
      this.skipWhitespace();
      return true;
    }

    this.expect(closing);
    return false;
  }

  private string(): void {
    this.offset += 1;
    for (;;) {
      this.match(STRING_RUN, true);
      const character = this.json[this.offset];
      if (character === '"') {
        this.offset += 1;
        return;
      }

      if (character !== '\\') {
        this.fail();
      }

      const escaped = this.json[this.offset + 1];
      if (escaped !== undefined && '"\\/bfnrt'.includes(escaped)) {
        this.offset += 2;
      } else if (escaped === 'u' && HEX4.test(this.json.slice(this.offset + 2, this.offset + 6))) {
        this.offset += 6;
      } else {
        this.fail();
      }
    }
  }

  private literal(word: string): void {
    if (!this.json.startsWith(word, this.offset)) {
      this.fail();
    }

    this.offset += word.length;
  }

  private expect(character: string): void {
    if (this.json[this.offset] !== character) {
      this.fail();
    }

    this.offset += 1;
  }

  private skipWhitespace(): void {
    this.match(WHITESPACE, true);
  }

  private match(pattern: RegExp, allowEmpty = false): void {
    pattern.lastIndex = this.offset;
    const match = pattern.exec(this.json);
    if (!match || (!allowEmpty && match[0] === '')) {
      this.fail();
    }

    this.offset += match[0].length;
  }

  private fail(): never {
    const before = this.json.slice(0, this.offset);
    const line = before.split('\n').length;
    const column = this.offset - before.lastIndexOf('\n');
    throw new LocalizedError('ParserMalformedJson', [line, column]);
  }
}