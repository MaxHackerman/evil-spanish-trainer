// Общие типы данных. Ядро (папка core) не знает ни про браузер, ни про хранилище,
// ни про интерфейс: только чистые данные и функции. Поэтому его можно без изменений
// переиспользовать на сервере, в мобильном приложении или в тестах.

export type Region = 'es' | 'latam';

export type Person = 'yo' | 'tu' | 'el' | 'nosotros' | 'vosotros' | 'ellos';
export const PERSONS: readonly Person[] = ['yo', 'tu', 'el', 'nosotros', 'vosotros', 'ellos'];

export type VerbGroup = 'ar' | 'er' | 'ir';
export type Tense = 'presente';

export interface VerbEntry {
  ru: string;
  /** Смена гласной в основе под ударением: pensar → pienso, contar → cuento, pedir → pido. */
  stemChange?: 'e>ie' | 'o>ue' | 'e>i' | 'u>ue';
  /** Полностью неправильные формы. Перекрывают правила. */
  irregular?: Partial<Record<Tense, Partial<Record<Person, string>>>>;
}

export type VerbDictionary = Record<string, VerbEntry>;

export type Gender = 'm' | 'f';

export interface NounVariant {
  word: string;
  gender: Gender;
  /** Особый артикль вопреки роду: el agua (женский род, но артикль el). */
  article?: 'el' | 'la';
}

export type Image =
  | { kind: 'emoji'; value: string }
  | { kind: 'url'; src: string; credit: string; license: string };

interface TaskBase {
  id: string;
  /** Навык, который тренирует задание. По навыкам работает интервальное повторение. */
  skill: string;
  /** Если указан, задание показывается только в этом регионе. */
  region?: Region;
  hint?: string;
}

export interface ConjugateTask extends TaskBase {
  type: 'conjugate';
  verb: string;
  person: Person;
  tense: Tense;
  /** Предложение с пропуском "___". Если нет, спрашиваем форму отдельно. */
  sentence?: string;
  translation?: string;
}

export interface ChoiceTask extends TaskBase {
  type: 'choice';
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  /** Пояснения к конкретным неверным вариантам. */
  wrongExplanations?: Record<string, string>;
}

export interface TextTask extends TaskBase {
  type: 'text';
  question: string;
  answers: string[];
  explanation: string;
  commonMistakes?: { answer: string; explanation: string }[];
}

export interface PictureTask extends TaskBase {
  type: 'picture';
  image: Image;
  ru: string;
  noun: NounVariant | { es: NounVariant; latam: NounVariant };
  /** Другие допустимые слова (синонимы, региональные варианты). */
  alsoAccept?: NounVariant[];
}

export interface OrderTask extends TaskBase {
  type: 'order';
  translation: string;
  words: string[];
  distractors?: string[];
  alternatives?: string[][];
}

export type Task = ConjugateTask | ChoiceTask | TextTask | PictureTask | OrderTask;
export type TaskType = Task['type'];

export interface ConjugateGenerator {
  type: 'conjugate';
  skill: string;
  verbs: string[];
  tense: Tense;
  count: number;
}

export interface Lesson {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  level: string;
  ruleId?: string;
  batchSize: number;
  tasks: Task[];
  generators?: ConjugateGenerator[];
}

export type RuleBlock =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string }
  | { type: 'tip'; text: string }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'examples'; items: { es: string; ru: string }[] }
  | { type: 'regional'; es: string; latam: string };

export interface Rule {
  schemaVersion: 1;
  id: string;
  title: string;
  level: string;
  blocks: RuleBlock[];
}

export interface ContentIndex {
  lessons: { id: string; title: string; level: string; description: string; ruleId?: string; skills: string[] }[];
  rules: { id: string; title: string; level: string }[];
}

// ---- Результаты проверки ----

export type Status = 'correct' | 'almost' | 'wrong' | 'empty';

export interface DiffPart {
  kind: 'same' | 'extra' | 'missing';
  text: string;
}

/**
 * Обратная связь хранится как код + параметры, а не как готовый текст.
 * Текст собирается в слое i18n: так интерфейс можно перевести на другие языки,
 * не трогая логику проверки.
 */
export interface Feedback {
  code: string;
  params?: Record<string, string>;
}

export interface CheckResult {
  taskId: string;
  status: Status;
  given: string;
  expected: string;
  diff?: DiffPart[];
  feedback: Feedback[];
}

export interface CheckContext {
  region: Region;
  verbs: VerbDictionary;
}
