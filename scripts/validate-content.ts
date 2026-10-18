// Проверка всего учебного контента: структура, ссылки между файлами
// и главное — что эталонный ответ каждого задания сама же проверка считает верным.
// Запуск: npm run validate-content

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkAnswer, expectedAnswer } from '../src/core/checker.ts';
import { validateLesson, validateRule } from '../src/core/schema.ts';
import type { ContentIndex, Lesson, Region, VerbDictionary } from '../src/core/types.ts';

const dir = join(import.meta.dirname, '..', 'public', 'data');
const read = (p: string): unknown => JSON.parse(readFileSync(join(dir, p), 'utf8'));
const errors: string[] = [];

const index = read('index.json') as ContentIndex;
const verbs = read('verbs.json') as VerbDictionary;
const lessonFiles = readdirSync(join(dir, 'lessons')).filter((f) => f.endsWith('.json'));
const ruleFiles = readdirSync(join(dir, 'rules')).filter((f) => f.endsWith('.json'));
const ruleIds = new Set(ruleFiles.map((f) => f.replace('.json', '')));

for (const f of ruleFiles) {
  const r = read(`rules/${f}`) as { id?: string };
  errors.push(...validateRule(r).map((e) => `rules/${f}: ${e}`));
  if (r.id !== f.replace('.json', '')) errors.push(`rules/${f}: id не совпадает с именем файла`);
}

for (const f of lessonFiles) {
  const raw = read(`lessons/${f}`);
  const errs = validateLesson(raw, verbs);
  errors.push(...errs.map((e) => `lessons/${f}: ${e}`));
  if (errs.length) continue;
  const lesson = raw as Lesson;
  if (lesson.id !== f.replace('.json', '')) errors.push(`lessons/${f}: id не совпадает с именем файла`);
  if (lesson.ruleId && !ruleIds.has(lesson.ruleId)) errors.push(`lessons/${f}: нет правила ${lesson.ruleId}`);

  const entry = index.lessons.find((l) => l.id === lesson.id);
  if (!entry) errors.push(`lessons/${f}: урока нет в index.json`);
  else {
    const skills = new Set([...lesson.tasks.map((t) => t.skill), ...(lesson.generators ?? []).map((g) => g.skill)]);
    const listed = new Set(entry.skills);
    if ([...skills].some((s) => !listed.has(s)) || [...listed].some((s) => !skills.has(s))) {
      errors.push(`index.json: skills урока ${lesson.id} должны быть [${[...skills].join(', ')}]`);
    }
  }

  // Эталонный ответ должен проходить проверку в каждом регионе, где задание показывается.
  for (const task of lesson.tasks) {
    for (const region of ['es', 'latam'] as Region[]) {
      if (task.region && task.region !== region) continue;
      if (task.type === 'conjugate' && task.person === 'vosotros' && region !== 'es') continue;
      const ctx = { region, verbs };
      const res = checkAnswer(task, expectedAnswer(task, ctx), ctx);
      if (res.status !== 'correct') errors.push(`lessons/${f}: ${task.id} (${region}) эталон не проходит проверку: ${res.status}`);
    }
  }
}

for (const l of index.lessons) if (!lessonFiles.includes(`${l.id}.json`)) errors.push(`index.json: нет файла урока ${l.id}`);
for (const r of index.rules) if (!ruleIds.has(r.id)) errors.push(`index.json: нет файла правила ${r.id}`);

if (errors.length) {
  console.error(`Найдено ошибок: ${errors.length}\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`Контент в порядке: уроков ${lessonFiles.length}, правил ${ruleFiles.length}, глаголов ${Object.keys(verbs).length}.`);
