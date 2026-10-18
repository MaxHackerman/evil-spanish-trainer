import type { DiffPart } from './types.ts';

/** Приводит ответ к единому виду: регистр, пробелы, пунктуация по краям. */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[¿¡?!.,;:"«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ACCENT_MAP: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
};

/** Убирает испанские диакритики: á → a, ñ → n. */
export function stripAccents(s: string): string {
  return s.replace(/[áéíóúüñ]/g, (c) => ACCENT_MAP[c] ?? c);
}

/** Расстояние Левенштейна: сколько правок отделяет одну строку от другой. */
export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/**
 * Разница между ответом и эталоном.
 * 'extra' — лишнее в ответе пользователя, 'missing' — чего не хватает.
 * Для одного слова сравниваем по буквам, для фраз — по словам.
 */
export function diff(given: string, expected: string): DiffPart[] {
  const byWords = given.includes(' ') || expected.includes(' ');
  const a = byWords ? given.split(' ').filter(Boolean) : [...given];
  const b = byWords ? expected.split(' ').filter(Boolean) : [...expected];
  const sep = byWords ? ' ' : '';

  // Таблица длин наибольшей общей подпоследовательности.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const raw: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      raw.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      raw.push({ kind: 'extra', text: a[i]! });
      i++;
    } else {
      raw.push({ kind: 'missing', text: b[j]! });
      j++;
    }
  }
  while (i < a.length) raw.push({ kind: 'extra', text: a[i++]! });
  while (j < b.length) raw.push({ kind: 'missing', text: b[j++]! });

  // Склеиваем соседние куски одного типа.
  const merged: DiffPart[] = [];
  for (const part of raw) {
    const last = merged[merged.length - 1];
    if (last && last.kind === part.kind) last.text += sep + part.text;
    else merged.push({ ...part });
  }
  if (byWords) {
    // Возвращаем пробелы между словами, чтобы фраза читалась.
    return merged.map((p, idx) => (idx < merged.length - 1 ? { ...p, text: p.text + ' ' } : p));
  }
  return merged;
}
