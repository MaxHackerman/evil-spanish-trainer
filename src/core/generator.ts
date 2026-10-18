import { pick, shuffle, type Rng } from './random.ts';
import { PERSONS } from './types.ts';
import type { CheckResult, ConjugateGenerator, ConjugateTask, Lesson, Person, Region, Task } from './types.ts';

let counter = 0;
function genId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function personsFor(region: Region): Person[] {
  // В Латинской Америке vosotros не используется: вместо него ustedes (= ellos по форме глагола).
  return region === 'es' ? [...PERSONS] : PERSONS.filter((p) => p !== 'vosotros');
}

export function isAvailable(task: Task, region: Region): boolean {
  if (task.region && task.region !== region) return false;
  if (task.type === 'conjugate' && task.person === 'vosotros' && region !== 'es') return false;
  return true;
}

export function generateConjugate(gen: ConjugateGenerator, region: Region, rng: Rng, opts: { person?: Person; verb?: string; exclude?: string } = {}): ConjugateTask {
  const persons = personsFor(region);
  let verb = opts.verb ?? pick(gen.verbs, rng);
  let person = opts.person ?? pick(persons, rng);
  // Не повторяем дословно то же задание, на котором ошиблись.
  for (let tries = 0; `${verb}:${person}` === opts.exclude && tries < 10; tries++) {
    if (opts.verb === undefined) verb = pick(gen.verbs, rng);
    else if (opts.person === undefined) person = pick(persons, rng);
    else break;
  }
  return { id: genId('gen'), type: 'conjugate', skill: gen.skill, verb, person, tense: gen.tense };
}

/** Собирает пачку заданий для урока: часть из готовых, часть сгенерированных движком. */
export function buildBatch(lesson: Lesson, region: Region, rng: Rng): Task[] {
  const staticPool = shuffle(lesson.tasks.filter((t) => isAvailable(t, region)), rng);
  const generated: Task[] = [];
  for (const gen of lesson.generators ?? []) {
    const seen = new Set<string>();
    for (let i = 0; i < gen.count; i++) {
      let t = generateConjugate(gen, region, rng);
      for (let tries = 0; seen.has(`${t.verb}:${t.person}`) && tries < 20; tries++) t = generateConjugate(gen, region, rng);
      seen.add(`${t.verb}:${t.person}`);
      generated.push(t);
    }
  }
  const staticCount = Math.max(0, lesson.batchSize - generated.length);
  const batch = [...generated, ...staticPool.slice(0, staticCount)];
  // Задания на сборку фраз лучше оставлять в конце: они самые объёмные.
  const ordered = shuffle(batch, rng);
  return [...ordered.filter((t) => t.type !== 'order'), ...ordered.filter((t) => t.type === 'order')];
}

/**
 * Новые задания на то же правило, где была ошибка.
 * Цель: проверить, что понято правило, а не запомнен конкретный ответ.
 */
export function similarTasks(task: Task, res: CheckResult, lesson: Lesson, region: Region, rng: Rng, used: Set<string>, count = 2): Task[] {
  if (task.type === 'conjugate') {
    const gen = lesson.generators?.find((g) => g.skill === task.skill) ?? lesson.generators?.[0];
    if (!gen) return [];
    const code = res.feedback[0]?.code ?? '';
    const exclude = `${task.verb}:${task.person}`;
    // Ошибся в основе → тот же глагол в других лицах. Ошибся в лице или окончании → то же лицо на других глаголах.
    const sameVerb = ['conj.stem_missed', 'conj.stem_extra', 'conj.wrong_stem'].includes(code);
    const samePerson = ['conj.wrong_person', 'conj.wrong_ending', 'conj.infinitive'].includes(code);
    const others = shuffle(personsFor(region).filter((p) => p !== task.person), rng);
    const out: ConjugateTask[] = [];
    for (let i = 0; i < count; i++) {
      let t: ConjugateTask;
      let tries = 0;
      do {
        t = sameVerb
          ? generateConjugate(gen, region, rng, { verb: task.verb, person: others[(i + tries) % others.length]! })
          : generateConjugate(gen, region, rng, samePerson ? { person: task.person, exclude } : { exclude });
        tries++;
      } while (tries < 10 && out.some((o) => o.verb === t.verb && o.person === t.person));
      out.push(t);
    }
    return out;
  }
  const pool = shuffle(
    lesson.tasks.filter((t) => t.skill === task.skill && t.type === task.type && !used.has(t.id) && isAvailable(t, region)),
    rng,
  );
  return pool.slice(0, count);
}
