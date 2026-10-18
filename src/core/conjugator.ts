import type { Person, Tense, VerbDictionary, VerbEntry, VerbGroup } from './types.ts';
import { PERSONS } from './types.ts';

export const PRESENT_ENDINGS: Record<VerbGroup, Record<Person, string>> = {
  ar: { yo: 'o', tu: 'as', el: 'a', nosotros: 'amos', vosotros: 'áis', ellos: 'an' },
  er: { yo: 'o', tu: 'es', el: 'e', nosotros: 'emos', vosotros: 'éis', ellos: 'en' },
  ir: { yo: 'o', tu: 'es', el: 'e', nosotros: 'imos', vosotros: 'ís', ellos: 'en' },
};

/** Лица, в которых ударение падает на основу, и поэтому меняется гласная («сапожок»). */
const STEM_CHANGE_PERSONS: readonly Person[] = ['yo', 'tu', 'el', 'ellos'];

export function verbGroup(infinitive: string): VerbGroup {
  const g = infinitive.slice(-2);
  if (g === 'ar' || g === 'er' || g === 'ir') return g;
  throw new Error(`Не похоже на инфинитив: ${infinitive}`);
}

export function verbStem(infinitive: string): string {
  return infinitive.slice(0, -2);
}

/** Меняет последнюю подходящую гласную основы: pens → piens, cont → cuent. */
export function applyStemChange(stem: string, change: NonNullable<VerbEntry['stemChange']>): string {
  const [from, to] = change.split('>') as [string, string];
  const idx = stem.lastIndexOf(from);
  if (idx === -1) return stem;
  return stem.slice(0, idx) + to + stem.slice(idx + from.length);
}

export function conjugate(
  infinitive: string,
  person: Person,
  tense: Tense,
  entry: VerbEntry = { ru: '' },
): string {
  const irregular = entry.irregular?.[tense]?.[person];
  if (irregular) return irregular;
  const group = verbGroup(infinitive);
  let stem = verbStem(infinitive);
  if (entry.stemChange && STEM_CHANGE_PERSONS.includes(person)) {
    stem = applyStemChange(stem, entry.stemChange);
  }
  return stem + PRESENT_ENDINGS[group][person];
}

/** Форма без смены гласной: нужна, чтобы распознать ошибку «забыл, что pensar → pienso». */
export function conjugateRegular(infinitive: string, person: Person): string {
  return verbStem(infinitive) + PRESENT_ENDINGS[verbGroup(infinitive)][person];
}

export function conjugateAll(infinitive: string, tense: Tense, verbs: VerbDictionary): Record<Person, string> {
  const entry = verbs[infinitive];
  const out = {} as Record<Person, string>;
  for (const p of PERSONS) out[p] = conjugate(infinitive, p, tense, entry);
  return out;
}
