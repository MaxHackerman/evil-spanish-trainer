// Проверка структуры контента. Нужна по двум причинам:
// 1) опечатка в JSON-уроке не должна молча ломать сайт;
// 2) когда задания начнёт генерировать ИИ, его ответ надо проверять перед показом.

import { PERSONS } from './types.ts';
import type { Lesson, Rule, Task, VerbDictionary } from './types.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

function checkNoun(v: unknown): boolean {
  return isObj(v) && isStr(v.word) && (v.gender === 'm' || v.gender === 'f')
    && (v.article === undefined || v.article === 'el' || v.article === 'la');
}

export function validateTask(t: unknown, verbs?: VerbDictionary): string[] {
  if (!isObj(t)) return ['задание не объект'];
  const id = isStr(t.id) ? t.id : '(без id)';
  const e = (m: string) => `${id}: ${m}`;
  const errs: string[] = [];
  if (!isStr(t.id)) errs.push(e('нет id'));
  if (!isStr(t.skill)) errs.push(e('нет skill'));
  if (t.region !== undefined && t.region !== 'es' && t.region !== 'latam') errs.push(e('region должен быть es или latam'));
  switch (t.type) {
    case 'conjugate':
      if (!isStr(t.verb)) errs.push(e('нет verb'));
      else if (verbs && !verbs[t.verb]) errs.push(e(`глагола ${t.verb} нет в словаре`));
      if (!PERSONS.includes(t.person as never)) errs.push(e('неверное person'));
      if (t.tense !== 'presente') errs.push(e('неверное tense'));
      if (t.sentence !== undefined && !(isStr(t.sentence) && t.sentence.includes('___'))) errs.push(e('в sentence нет пропуска ___'));
      break;
    case 'choice':
      if (!isStr(t.question)) errs.push(e('нет question'));
      if (!isStrArr(t.options) || t.options.length < 2) errs.push(e('нужно минимум 2 варианта'));
      else if (!t.options.includes(t.answer as string)) errs.push(e('answer не входит в options'));
      if (!isStr(t.explanation)) errs.push(e('нет explanation'));
      break;
    case 'text':
      if (!isStr(t.question)) errs.push(e('нет question'));
      if (!isStrArr(t.answers) || t.answers.length === 0) errs.push(e('нет answers'));
      if (!isStr(t.explanation)) errs.push(e('нет explanation'));
      break;
    case 'picture': {
      if (!isObj(t.image)) errs.push(e('нет image'));
      else if (t.image.kind === 'url' && !(isStr(t.image.credit) && isStr(t.image.license))) errs.push(e('у картинки нет источника или лицензии'));
      if (!isStr(t.ru)) errs.push(e('нет ru'));
      const n = t.noun;
      if (!(checkNoun(n) || (isObj(n) && checkNoun(n.es) && checkNoun(n.latam)))) errs.push(e('неверный noun'));
      break;
    }
    case 'order':
      if (!isStr(t.translation)) errs.push(e('нет translation'));
      if (!isStrArr(t.words) || t.words.length < 2) errs.push(e('нужно минимум 2 слова'));
      break;
    default:
      errs.push(e(`неизвестный тип ${String(t.type)}`));
  }
  return errs;
}

export function validateLesson(l: unknown, verbs?: VerbDictionary): string[] {
  if (!isObj(l)) return ['урок не объект'];
  const errs: string[] = [];
  if (l.schemaVersion !== 1) errs.push('schemaVersion должен быть 1');
  for (const k of ['id', 'title', 'description', 'level']) if (!isStr(l[k])) errs.push(`нет ${k}`);
  if (typeof l.batchSize !== 'number' || l.batchSize < 1) errs.push('неверный batchSize');
  if (!Array.isArray(l.tasks)) errs.push('нет tasks');
  else {
    const ids = new Set<string>();
    for (const t of l.tasks) {
      errs.push(...validateTask(t, verbs));
      const id = isObj(t) ? t.id : undefined;
      if (isStr(id)) {
        if (ids.has(id)) errs.push(`повтор id ${id}`);
        ids.add(id);
      }
    }
  }
  for (const g of (Array.isArray(l.generators) ? l.generators : []) as unknown[]) {
    if (!isObj(g) || g.type !== 'conjugate' || !isStrArr(g.verbs) || typeof g.count !== 'number') errs.push('неверный generator');
    else if (verbs) for (const v of g.verbs) if (!verbs[v]) errs.push(`генератор: глагола ${v} нет в словаре`);
  }
  return errs;
}

export function validateRule(r: unknown): string[] {
  if (!isObj(r)) return ['правило не объект'];
  const errs: string[] = [];
  if (r.schemaVersion !== 1) errs.push('schemaVersion должен быть 1');
  for (const k of ['id', 'title', 'level']) if (!isStr(r[k])) errs.push(`нет ${k}`);
  if (!Array.isArray(r.blocks)) errs.push('нет blocks');
  else r.blocks.forEach((b: unknown, i: number) => {
    if (!isObj(b) || !['h', 'p', 'tip', 'table', 'examples', 'regional'].includes(b.type as string)) errs.push(`блок ${i}: неизвестный тип`);
  });
  return errs;
}

export function assertLesson(l: unknown, verbs?: VerbDictionary): Lesson {
  const errs = validateLesson(l, verbs);
  if (errs.length) throw new Error(`Ошибки в уроке:\n${errs.join('\n')}`);
  return l as Lesson;
}

export function assertRule(r: unknown): Rule {
  const errs = validateRule(r);
  if (errs.length) throw new Error(`Ошибки в правиле:\n${errs.join('\n')}`);
  return r as Rule;
}

/** Отбрасывает некорректные задания (например, от ИИ), оставляя рабочие. */
export function filterValidTasks(tasks: unknown[], verbs?: VerbDictionary): Task[] {
  return tasks.filter((t) => validateTask(t, verbs).length === 0) as Task[];
}
