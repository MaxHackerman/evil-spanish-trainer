import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conjugate, conjugateAll } from '../src/core/conjugator.ts';
import { checkAnswer } from '../src/core/checker.ts';
import { diff, normalize } from '../src/core/text.ts';
import { review, isMastered, addDays } from '../src/core/srs.ts';
import { startSession, submit, nextRound, summarize, mistakes } from '../src/core/session.ts';
import { buildBatch, similarTasks } from '../src/core/generator.ts';
import { seededRng } from '../src/core/random.ts';
import { validateLesson } from '../src/core/schema.ts';
import type { CheckContext, ConjugateTask, Lesson, PictureTask, Task, VerbDictionary } from '../src/core/types.ts';

const verbs: VerbDictionary = {
  hablar: { ru: 'говорить' },
  trabajar: { ru: 'работать' },
  comer: { ru: 'есть' },
  vivir: { ru: 'жить' },
  pensar: { ru: 'думать', stemChange: 'e>ie' },
  contar: { ru: 'считать', stemChange: 'o>ue' },
  pedir: { ru: 'просить', stemChange: 'e>i' },
  estar: { ru: 'быть', irregular: { presente: { yo: 'estoy', tu: 'estás', el: 'está', nosotros: 'estamos', vosotros: 'estáis', ellos: 'están' } } },
};
const es: CheckContext = { region: 'es', verbs };
const latam: CheckContext = { region: 'latam', verbs };

const conj = (verb: string, person: ConjugateTask['person']): ConjugateTask =>
  ({ id: 't', type: 'conjugate', skill: 's', verb, person, tense: 'presente' });

test('спряжение правильных глаголов', () => {
  assert.deepEqual(conjugateAll('hablar', 'presente', verbs), {
    yo: 'hablo', tu: 'hablas', el: 'habla', nosotros: 'hablamos', vosotros: 'habláis', ellos: 'hablan',
  });
  assert.equal(conjugate('comer', 'vosotros', 'presente'), 'coméis');
  assert.equal(conjugate('vivir', 'nosotros', 'presente'), 'vivimos');
  assert.equal(conjugate('vivir', 'vosotros', 'presente'), 'vivís');
});

test('смена гласной и неправильные глаголы', () => {
  assert.equal(conjugate('pensar', 'yo', 'presente', verbs.pensar), 'pienso');
  assert.equal(conjugate('pensar', 'nosotros', 'presente', verbs.pensar), 'pensamos');
  assert.equal(conjugate('contar', 'ellos', 'presente', verbs.contar), 'cuentan');
  assert.equal(conjugate('pedir', 'tu', 'presente', verbs.pedir), 'pides');
  assert.equal(conjugate('estar', 'yo', 'presente', verbs.estar), 'estoy');
});

test('normalize и diff', () => {
  assert.equal(normalize('  ¿Hablas   Español?  '), 'hablas español');
  assert.deepEqual(diff('hablo', 'habla'), [
    { kind: 'same', text: 'habl' }, { kind: 'extra', text: 'o' }, { kind: 'missing', text: 'a' },
  ]);
});

test('проверка спряжения: верно, местоимение, ударение', () => {
  assert.equal(checkAnswer(conj('hablar', 'yo'), 'hablo', es).status, 'correct');
  assert.equal(checkAnswer(conj('hablar', 'yo'), 'Yo hablo', es).status, 'correct');
  const r = checkAnswer(conj('hablar', 'vosotros'), 'hablais', es);
  assert.equal(r.status, 'almost');
  assert.equal(r.feedback[0]!.code, 'accent');
  assert.equal(checkAnswer(conj('hablar', 'yo'), '  ', es).status, 'empty');
});

test('диагностика ошибок спряжения', () => {
  const code = (t: ConjugateTask, a: string) => checkAnswer(t, a, es).feedback[0]!.code;
  assert.equal(code(conj('hablar', 'el'), 'hablo'), 'conj.wrong_person');
  assert.equal(checkAnswer(conj('hablar', 'el'), 'hablo', es).feedback[0]!.params!.givenPerson, 'yo');
  assert.equal(code(conj('hablar', 'el'), 'hablar'), 'conj.infinitive');
  assert.equal(code(conj('hablar', 'nosotros'), 'hablemos'), 'conj.wrong_ending');
  assert.equal(code(conj('pensar', 'yo'), 'penso'), 'conj.stem_missed');
  assert.equal(code(conj('pensar', 'nosotros'), 'piensamos'), 'conj.stem_extra');
  assert.equal(code(conj('trabajar', 'yo'), 'trabjo'), 'conj.wrong_stem');
  assert.equal(code(conj('hablar', 'yo'), 'xyz'), 'conj.generic');
  // После объяснения всегда идёт таблица окончаний.
  const fb = checkAnswer(conj('hablar', 'el'), 'hablo', es).feedback;
  assert.equal(fb[fb.length - 1]!.code, 'conj.table');
});

const car: PictureTask = {
  id: 'car', type: 'picture', skill: 'art', image: { kind: 'emoji', value: '🚗' }, ru: 'машина',
  noun: { es: { word: 'coche', gender: 'm' }, latam: { word: 'carro', gender: 'm' } },
  alsoAccept: [{ word: 'auto', gender: 'm' }],
};
const pc: PictureTask = {
  id: 'pc', type: 'picture', skill: 'art', image: { kind: 'emoji', value: '💻' }, ru: 'компьютер',
  noun: { es: { word: 'ordenador', gender: 'm' }, latam: { word: 'computadora', gender: 'f' } },
};
const water: PictureTask = {
  id: 'w', type: 'picture', skill: 'art', image: { kind: 'emoji', value: '💧' }, ru: 'вода',
  noun: { word: 'agua', gender: 'f', article: 'el' },
};

test('картинки: артикли, регионы, исключения', () => {
  assert.equal(checkAnswer(car, 'el coche', es).status, 'correct');
  assert.equal(checkAnswer(car, 'el carro', latam).status, 'correct');
  assert.equal(checkAnswer(car, 'un auto', es).status, 'correct');
  const other = checkAnswer(car, 'el carro', es);
  assert.equal(other.status, 'correct');
  assert.equal(other.feedback[0]!.code, 'picture.regional');
  assert.equal(checkAnswer(car, 'la coche', es).feedback[0]!.code, 'picture.wrong_article');
  assert.equal(checkAnswer(car, 'coche', es).feedback[0]!.code, 'picture.no_article');
  assert.equal(checkAnswer(car, 'el gato', es).feedback[0]!.code, 'picture.wrong_word');
  // Род у региональных вариантов разный.
  assert.equal(checkAnswer(pc, 'la computadora', latam).status, 'correct');
  assert.equal(checkAnswer(pc, 'el computadora', es).feedback[0]!.code, 'picture.wrong_article');
  assert.equal(checkAnswer(water, 'el agua', es).status, 'correct');
  assert.equal(checkAnswer(water, 'la agua', es).feedback[0]!.code, 'picture.special_article');
});

test('картинки в режиме «артикль»: слово дано, выбираем el / la', () => {
  const art = (t: PictureTask): PictureTask => ({ ...t, mode: 'article' });
  assert.equal(checkAnswer(art(car), 'el', es).status, 'correct');
  assert.equal(checkAnswer(art(car), 'el', es).expected, 'el coche');
  assert.equal(checkAnswer(art(car), 'la', es).feedback[0]!.code, 'picture.wrong_article');
  assert.equal(checkAnswer(art(pc), 'la', latam).status, 'correct');
  assert.equal(checkAnswer(art(pc), 'la', es).status, 'wrong');
  assert.equal(checkAnswer(art(water), 'el', es).status, 'correct');
  assert.equal(checkAnswer(art(water), 'la', es).feedback[0]!.code, 'picture.special_article');
  const hand: PictureTask = { ...water, id: 'h', mode: 'article', noun: { word: 'mano', gender: 'f' } };
  const fb = checkAnswer(hand, 'el', es).feedback.map((f) => f.code);
  assert.deepEqual(fb, ['picture.wrong_article', 'picture.gender']);
  // Эталон из отчёта тоже принимается.
  assert.equal(checkAnswer(art(car), 'el coche', es).status, 'correct');
});

test('выбор, текст, порядок слов', () => {
  const choice: Task = { id: 'c', type: 'choice', skill: 's', question: 'q', options: ['a', 'b'], answer: 'a', explanation: 'x', wrongExplanations: { b: 'не b' } };
  assert.equal(checkAnswer(choice, 'a', es).status, 'correct');
  assert.equal(checkAnswer(choice, 'b', es).feedback[0]!.params!.text, 'не b');
  const text: Task = { id: 'x', type: 'text', skill: 's', question: 'он', answers: ['él'], explanation: 'e', commonMistakes: [{ answer: 'el', explanation: 'артикль' }] };
  assert.equal(checkAnswer(text, 'Él', es).status, 'correct');
  assert.equal(checkAnswer(text, 'el', es).status, 'wrong');
  const order: Task = { id: 'o', type: 'order', skill: 's', translation: 't', words: ['Yo', 'hablo', 'español'], distractors: ['habla'], alternatives: [['Hablo', 'yo', 'español']] };
  assert.equal(checkAnswer(order, 'yo hablo español', es).status, 'correct');
  assert.equal(checkAnswer(order, 'hablo yo español', es).status, 'correct');
  assert.equal(checkAnswer(order, 'yo habla español', es).feedback[0]!.code, 'order.distractor');
});

test('интервальное повторение', () => {
  const d = '2026-10-19';
  let s = review(undefined, true, d);
  assert.equal(s.box, 1);
  assert.equal(s.due, addDays(d, 1));
  s = review(s, true, d); // тот же день — не растёт
  assert.equal(s.box, 1);
  s = review(s, true, addDays(d, 1));
  s = review(s, true, addDays(d, 4));
  assert.equal(s.box, 3);
  assert.ok(isMastered(s));
  s = review(s, false, addDays(d, 11));
  assert.equal(s.box, 0);
  assert.equal(s.lapses, 1);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

const lesson: Lesson = {
  schemaVersion: 1, id: 'l', title: 't', description: 'd', level: 'A1', batchSize: 6,
  generators: [{ type: 'conjugate', skill: 'ar', verbs: ['hablar', 'trabajar'], tense: 'presente', count: 4 }],
  tasks: [
    { id: 'v1', type: 'conjugate', skill: 'ar', verb: 'hablar', person: 'vosotros', tense: 'presente', sentence: 'Vosotros ___.' },
    { id: 'c1', type: 'choice', skill: 'ar', question: 'q', options: ['a', 'b'], answer: 'a', explanation: 'x' },
    { id: 'c2', type: 'choice', skill: 'ar', question: 'q2', options: ['a', 'b'], answer: 'b', explanation: 'x' },
    { id: 'c3', type: 'choice', skill: 'ar', question: 'q3', options: ['a', 'b'], answer: 'a', explanation: 'x' },
  ],
};

test('пачка заданий учитывает регион', () => {
  for (let seed = 1; seed < 30; seed++) {
    const batch = buildBatch(lesson, 'latam', seededRng(seed));
    assert.equal(batch.length, 6);
    assert.ok(batch.every((t) => !(t.type === 'conjugate' && t.person === 'vosotros')), 'в Латам нет vosotros');
  }
});

test('полный цикл: ошибки → работа над ошибками → завершение', () => {
  const rng = seededRng(7);
  const tasks: Task[] = [conj('hablar', 'yo'), { ...conj('trabajar', 'el'), id: 't2' }, lesson.tasks[1]!];
  let s = startSession('l', tasks);
  s = submit(s, { t: 'hablo', t2: 'trabajo', c1: 'b' }, es);
  assert.equal(s.phase, 'report');
  assert.equal(mistakes(s).length, 2);

  s = nextRound(s, (task, res, used) => similarTasks(task, res, lesson, 'es', rng, used));
  assert.equal(s.phase, 'work');
  const round = s.rounds[1]!;
  assert.ok(round.tasks.length >= 3, 'ошибки + новые похожие');
  // Ошибка в лице (yo вместо él) → новые задания на él с другими глаголами.
  const fresh = round.tasks.filter((t) => t.type === 'conjugate' && t.id.startsWith('gen')) as ConjugateTask[];
  assert.ok(fresh.length >= 1);
  assert.ok(fresh.every((t) => t.person === 'el'));

  const answers: Record<string, string> = {};
  for (const t of round.tasks) {
    if (t.type === 'conjugate') answers[t.id] = conjugate(t.verb, t.person, 'presente', verbs[t.verb]);
    if (t.type === 'choice') answers[t.id] = t.answer;
  }
  s = submit(s, answers, es);
  assert.equal(mistakes(s).length, 0);
  s = nextRound(s, () => []);
  assert.equal(s.phase, 'done');

  const sum = summarize(s);
  assert.equal(sum.total, 3);
  assert.equal(sum.correct, 1);
  assert.equal(sum.skills.s, false);
  assert.ok(sum.xp > 10);
});

test('валидация урока ловит ошибки', () => {
  assert.deepEqual(validateLesson(lesson, verbs), []);
  const bad = { ...lesson, tasks: [{ id: 'z', type: 'choice', skill: 's', question: 'q', options: ['a', 'b'], answer: 'c', explanation: 'x' }] };
  assert.ok(validateLesson(bad, verbs).some((e) => e.includes('answer')));
  const unknownVerb = { ...lesson, generators: [{ type: 'conjugate', skill: 's', verbs: ['nadar'], tense: 'presente', count: 1 }] };
  assert.ok(validateLesson(unknownVerb, verbs).some((e) => e.includes('nadar')));
});
