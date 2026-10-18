import { applyStemChange, conjugate, conjugateRegular, PRESENT_ENDINGS, verbGroup, verbStem } from './conjugator.ts';
import { diff, levenshtein, normalize, stripAccents } from './text.ts';
import { PERSONS } from './types.ts';
import type {
  CheckContext, CheckResult, ChoiceTask, ConjugateTask, Feedback, NounVariant,
  OrderTask, PictureTask, Region, Task, TextTask,
} from './types.ts';

/** Проверяет ответ на любое задание. Чистая функция: одинаковый вход — одинаковый результат. */
export function checkAnswer(task: Task, given: string, ctx: CheckContext): CheckResult {
  if (normalize(given) === '') {
    return { taskId: task.id, status: 'empty', given, expected: expectedAnswer(task, ctx), feedback: [{ code: 'empty' }] };
  }
  switch (task.type) {
    case 'conjugate': return checkConjugate(task, given, ctx);
    case 'choice': return checkChoice(task, given);
    case 'text': return checkText(task, given);
    case 'picture': return checkPicture(task, given, ctx.region);
    case 'order': return checkOrder(task, given);
  }
}

/** Правильный ответ, который показываем в отчёте. */
export function expectedAnswer(task: Task, ctx: CheckContext): string {
  switch (task.type) {
    case 'conjugate': return conjugate(task.verb, task.person, task.tense, ctx.verbs[task.verb]);
    case 'choice': return task.answer;
    case 'text': return task.answers[0] ?? '';
    case 'picture': return withArticle(nounFor(task, ctx.region));
    case 'order': return task.words.join(' ');
  }
}

export function nounFor(task: PictureTask, region: Region): NounVariant {
  return 'word' in task.noun ? task.noun : task.noun[region];
}

export function articleFor(n: NounVariant): string {
  return n.article ?? (n.gender === 'm' ? 'el' : 'la');
}

function withArticle(n: NounVariant): string {
  return `${articleFor(n)} ${n.word}`;
}

function result(task: Task, status: CheckResult['status'], given: string, expected: string, feedback: Feedback[], withDiff = true): CheckResult {
  const r: CheckResult = { taskId: task.id, status, given, expected, feedback };
  if (withDiff && status !== 'correct') r.diff = diff(normalize(given), normalize(expected));
  return r;
}

/** Сравнение с учётом «почти правильно»: верно всё, кроме ударений или ñ. */
function compare(given: string, expected: string): 'correct' | 'almost' | 'wrong' {
  const g = normalize(given);
  const e = normalize(expected);
  if (g === e) return 'correct';
  if (stripAccents(g) === stripAccents(e)) return 'almost';
  return 'wrong';
}

// ---------------- Спряжение ----------------

const PRONOUNS: Record<string, true> = {
  yo: true, tú: true, tu: true, él: true, el: true, ella: true, usted: true, ud: true,
  nosotros: true, nosotras: true, vosotros: true, vosotras: true,
  ellos: true, ellas: true, ustedes: true, uds: true,
};

function stripPronoun(answer: string): string {
  const words = normalize(answer).split(' ');
  if (words.length === 2 && PRONOUNS[words[0]!]) return words[1]!;
  return words.join(' ');
}

export function checkConjugate(task: ConjugateTask, rawGiven: string, ctx: CheckContext): CheckResult {
  const entry = ctx.verbs[task.verb] ?? { ru: '' };
  const expected = conjugate(task.verb, task.person, task.tense, entry);
  const given = stripPronoun(rawGiven);
  const group = verbGroup(task.verb);
  const table: Feedback = { code: 'conj.table', params: { verb: task.verb, group } };

  const cmp = compare(given, expected);
  if (cmp === 'correct') return result(task, 'correct', rawGiven, expected, []);
  if (cmp === 'almost') return result(task, 'almost', rawGiven, expected, [{ code: 'accent', params: { expected } }]);

  const g = normalize(given);
  const fb: Feedback[] = [];

  if (g === task.verb) {
    fb.push({ code: 'conj.infinitive', params: { verb: task.verb } });
  } else {
    const otherPerson = PERSONS.find(
      (p) => p !== task.person && stripAccents(conjugate(task.verb, p, task.tense, entry)) === stripAccents(g),
    );
    const regular = conjugateRegular(task.verb, task.person);
    const stem = verbStem(task.verb);
    const ending = PRESENT_ENDINGS[group][task.person];

    if (entry.stemChange && expected !== regular && stripAccents(g) === stripAccents(regular)) {
      fb.push({ code: 'conj.stem_missed', params: { verb: task.verb, change: entry.stemChange, expected } });
    } else if (entry.stemChange && expected === regular
      && stripAccents(g) === stripAccents(applyStemChange(stem, entry.stemChange) + ending)) {
      fb.push({ code: 'conj.stem_extra', params: { verb: task.verb, person: task.person, expected } });
    } else if (otherPerson) {
      fb.push({ code: 'conj.wrong_person', params: { givenPerson: otherPerson, person: task.person } });
    } else if (!entry.stemChange && g.startsWith(stem) && g !== expected) {
      fb.push({ code: 'conj.wrong_ending', params: { stem, ending, person: task.person } });
    } else if (stripAccents(g).endsWith(stripAccents(ending)) && levenshtein(g, expected) <= 2) {
      fb.push({ code: 'conj.wrong_stem', params: { verb: task.verb, expected } });
    } else if (levenshtein(g, expected) === 1) {
      fb.push({ code: 'typo', params: { expected } });
    } else {
      fb.push({ code: 'conj.generic', params: { verb: task.verb, person: task.person, expected } });
    }
  }
  fb.push(table);
  return result(task, 'wrong', rawGiven, expected, fb);
}

// ---------------- Выбор ответа ----------------

function checkChoice(task: ChoiceTask, given: string): CheckResult {
  if (given === task.answer) return result(task, 'correct', given, task.answer, []);
  const fb: Feedback[] = [];
  const specific = task.wrongExplanations?.[given];
  if (specific) fb.push({ code: 'custom', params: { text: specific } });
  fb.push({ code: 'custom', params: { text: task.explanation } });
  return result(task, 'wrong', given, task.answer, fb, false);
}

// ---------------- Ввод текста ----------------

function checkText(task: TextTask, given: string): CheckResult {
  let best: 'correct' | 'almost' | 'wrong' = 'wrong';
  let bestAnswer = task.answers[0] ?? '';
  for (const a of task.answers) {
    const c = compare(given, a);
    if (c === 'correct') return result(task, 'correct', given, a, []);
    if (c === 'almost' && best === 'wrong') {
      best = 'almost';
      bestAnswer = a;
    }
  }
  const mistake = task.commonMistakes?.find((m) => normalize(m.answer) === normalize(given));
  // Типичная ошибка важнее «почти»: например, el вместо él — это другое слово, а не опечатка.
  if (mistake) {
    return result(task, 'wrong', given, bestAnswer, [
      { code: 'custom', params: { text: mistake.explanation } },
      { code: 'custom', params: { text: task.explanation } },
    ]);
  }
  if (best === 'almost') return result(task, 'almost', given, bestAnswer, [{ code: 'accent', params: { expected: bestAnswer } }]);
  return result(task, 'wrong', given, bestAnswer, [{ code: 'custom', params: { text: task.explanation } }]);
}

// ---------------- Картинка ----------------

const ARTICLES: Record<string, { gender: 'm' | 'f'; definite: boolean }> = {
  el: { gender: 'm', definite: true },
  la: { gender: 'f', definite: true },
  un: { gender: 'm', definite: false },
  una: { gender: 'f', definite: false },
};

function checkPicture(task: PictureTask, rawInput: string, region: Region): CheckResult {
  const main = nounFor(task, region);
  // В режиме «артикль» человек выбирает только el / la, а слово показано на экране.
  const rawGiven = task.mode === 'article' && normalize(rawInput).split(' ').length === 1
    ? `${normalize(rawInput)} ${main.word}`
    : rawInput;
  const expected = withArticle(main);
  const otherRegion: Region = region === 'es' ? 'latam' : 'es';
  const regionalOther = 'word' in task.noun ? undefined : task.noun[otherRegion];
  const candidates: { noun: NounVariant; note?: Feedback }[] = [
    { noun: main },
    ...(task.alsoAccept ?? []).map((noun) => ({ noun })),
    ...(regionalOther && regionalOther.word !== main.word
      ? [{ noun: regionalOther, note: { code: 'picture.regional', params: { word: regionalOther.word, main: main.word, region: otherRegion } } }]
      : []),
  ];

  const words = normalize(rawGiven).split(' ');
  const hasArticle = words.length >= 2 && ARTICLES[words[0]!] !== undefined;
  const article = hasArticle ? words[0]! : undefined;
  const word = (hasArticle ? words.slice(1) : words).join(' ');

  // Ищем, какое существительное человек имел в виду (с точностью до ударений).
  let matched: { noun: NounVariant; note?: Feedback; accent: boolean } | undefined;
  for (const c of candidates) {
    if (word === c.noun.word) { matched = { ...c, accent: false }; break; }
    if (!matched && stripAccents(word) === stripAccents(c.noun.word)) matched = { ...c, accent: true };
  }

  if (!matched) {
    const close = levenshtein(stripAccents(word), stripAccents(main.word)) <= 1;
    return result(task, 'wrong', rawGiven, expected, [
      close ? { code: 'typo', params: { expected: main.word } } : { code: 'picture.wrong_word', params: { word: main.word, ru: task.ru } },
      { code: 'picture.gender', params: { word: main.word, gender: main.gender, article: articleFor(main) } },
    ]);
  }

  const noun = matched.noun;
  const right = articleFor(noun);
  const target = `${right} ${noun.word}`;
  const notes: Feedback[] = matched.note ? [matched.note] : [];

  if (!article) {
    return result(task, 'wrong', rawGiven, target, [
      { code: 'picture.no_article', params: { word: noun.word, article: right } },
      { code: 'picture.gender', params: { word: noun.word, gender: noun.gender, article: right } },
      ...notes,
    ]);
  }

  const info = ARTICLES[article]!;
  // Особый случай: el agua — существительное женского рода, но с артиклем el.
  const articleOk = noun.article
    ? (info.definite ? article === noun.article : info.gender === noun.gender)
    : info.gender === noun.gender;

  if (!articleOk) {
    const code = noun.article ? 'picture.special_article' : 'picture.wrong_article';
    // Слово с «обманчивым» окончанием (la mano, el mapa) — отдельно напоминаем, что это исключение.
    const misleading = !noun.article && ((noun.word.endsWith('o') && noun.gender === 'f') || (noun.word.endsWith('a') && noun.gender === 'm'));
    return result(task, 'wrong', rawGiven, target, [
      { code, params: { given: article, article: right, word: noun.word, gender: noun.gender } },
      ...(misleading ? [{ code: 'picture.gender', params: { word: noun.word, gender: noun.gender, article: right } }] : []),
      ...notes,
    ]);
  }

  if (matched.accent) {
    return result(task, 'almost', rawGiven, target, [{ code: 'accent', params: { expected: target } }, ...notes]);
  }
  return result(task, 'correct', rawGiven, target, notes);
}

// ---------------- Порядок слов ----------------

function checkOrder(task: OrderTask, given: string): CheckResult {
  const variants = [task.words, ...(task.alternatives ?? [])].map((w) => w.join(' '));
  for (const v of variants) {
    const c = compare(given, v);
    if (c === 'correct') return result(task, 'correct', given, v, []);
    if (c === 'almost') return result(task, 'almost', given, v, [{ code: 'accent', params: { expected: v } }]);
  }
  const usedDistractor = (task.distractors ?? []).find((d) => normalize(given).split(' ').includes(normalize(d)));
  const fb: Feedback[] = [];
  if (usedDistractor) fb.push({ code: 'order.distractor', params: { word: usedDistractor } });
  fb.push({ code: 'order.wrong' });
  return result(task, 'wrong', given, variants[0]!, fb);
}
