// Экраны приложения. Каждый экран — функция «данные → HTML-строка», без побочных эффектов.
// Обработка кликов живёт в app.ts.

import { conjugateAll, verbGroup } from '../core/conjugator.ts';
import { expectedAnswer, nounFor } from '../core/checker.ts';
import { currentStreak, lessonStatus, type Progress, type Settings } from '../core/progress.ts';
import { seededRng, shuffle } from '../core/random.ts';
import { currentRound, isPassed, type Session, type SessionSummary } from '../core/session.ts';
import { PERSONS } from '../core/types.ts';
import type {
  CheckContext, CheckResult, ContentIndex, DiffPart, Lesson, Region, Rule, RuleBlock, Task, VerbDictionary,
} from '../core/types.ts';
import { formatFeedback, PERSON_ES, REGION_RU, T } from '../i18n/ru.ts';
import { esc, hashString, md } from './html.ts';

export type Route =
  | { name: 'home' }
  | { name: 'lesson'; id: string }
  | { name: 'rules' }
  | { name: 'rule'; id: string }
  | { name: 'settings' };

const ACCENT_CHARS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'];

/** onboarding: до выбора варианта испанского показываем только логотип и экран выбора, без вкладок и счётчиков. */
export function layout(route: Route, progress: Progress, today: string, body: string, onboarding = false): string {
  if (onboarding) {
    return `
  <header class="top">
    <span class="logo"><span class="logo-mark" aria-hidden="true">😈</span>${esc(T.appName)}</span>
  </header>
  <main class="page">${body}</main>`;
  }
  const active = (n: string) => (route.name === n || (n === 'rules' && route.name === 'rule') || (n === 'home' && route.name === 'lesson') ? ' aria-current="page"' : '');
  const streak = currentStreak(progress, today);
  return `
  <header class="top">
    <a class="logo" href="#/"><span class="logo-mark" aria-hidden="true">😈</span>${esc(T.appName)}</a>
    <div class="stats" title="Опыт и серия дней">
      <span class="stat"><b>${progress.xp}</b> XP</span>
      <span class="stat${streak ? ' hot' : ''}">🔥 <b>${streak}</b></span>
    </div>
  </header>
  <nav class="tabs">
    <a href="#/"${active('home')}>${T.nav.lessons}</a>
    <a href="#/rules"${active('rules')}>${T.nav.rules}</a>
    <a href="#/settings"${active('settings')}>${T.nav.settings}</a>
  </nav>
  <main class="page">${body}</main>`;
}

export function loadingView(): string {
  return `<div class="center muted">${T.loading}</div>`;
}

export function errorView(message: string): string {
  return `<div class="card error"><p>${esc(T.loadError)}</p><pre>${esc(message)}</pre></div>`;
}

export function welcomeView(): string {
  return `
  <section class="card welcome">
    <h1>${esc(T.welcome.title)}</h1>
    <p>${esc(T.welcome.text)}</p>
    <div class="region-pick">
      <button class="btn big" data-action="choose-region" data-region="es">🇪🇸 ${esc(REGION_RU.es)}</button>
      <button class="btn big" data-action="choose-region" data-region="latam">🌎 ${esc(REGION_RU.latam)}</button>
    </div>
  </section>`;
}

// ---------------- Главная ----------------

export function homeView(index: ContentIndex, progress: Progress, today: string, resumeLessonId: string | null): string {
  const lessons = index.lessons.map((l) => ({ ...l, status: lessonStatus(progress, l.id, l.skills, today) }));
  const due = lessons.filter((l) => l.status === 'due');
  const resume = resumeLessonId ? lessons.find((l) => l.id === resumeLessonId) : undefined;
  const card = (l: (typeof lessons)[number]) => {
    const stats = progress.lessons[l.id];
    const action = l.id === resumeLessonId ? T.home.continue : l.status === 'new' ? T.home.start : T.home.repeat;
    return `
    <article class="lesson-card status-${l.status}">
      <div class="lesson-head">
        <span class="level">${esc(l.level)}</span>
        <span class="badge">${esc(T.home.status[l.status])}</span>
      </div>
      <h3>${esc(l.title)}</h3>
      <p class="muted">${esc(l.description)}</p>
      ${stats ? `<p class="small muted">Лучший результат: ${stats.bestPercent}% · занятий: ${stats.sessions}</p>` : ''}
      <div class="row">
        <a class="btn primary" href="#/lesson/${esc(l.id)}">${esc(action)}</a>
        ${l.ruleId ? `<a class="btn ghost" href="#/rules/${esc(l.ruleId)}">${esc(T.home.rule)}</a>` : ''}
      </div>
    </article>`;
  };
  return `
  ${resume ? `<a class="card resume" href="#/lesson/${esc(resume.id)}">⏸ ${esc(T.home.resume)}: <b>${esc(resume.title)}</b></a>` : ''}
  ${due.length ? `<section><h2>${esc(T.home.due)}</h2><p class="muted small">${esc(T.home.dueHint)}</p><div class="grid">${due.map(card).join('')}</div></section>` : ''}
  <section>
    <h2>${esc(T.home.title)}</h2>
    <div class="grid">${lessons.filter((l) => l.status !== 'due').map(card).join('')}</div>
  </section>`;
}

// ---------------- Выполнение заданий ----------------

export interface WorkState {
  draft: Record<string, string>;
  /** Для заданий «собери фразу»: индексы выбранных плиток по порядку. */
  order: Record<string, number[]>;
}

export function orderTiles(task: Task): string[] {
  if (task.type !== 'order') return [];
  return shuffle([...task.words, ...(task.distractors ?? [])], seededRng(hashString(task.id)));
}

export function orderAnswer(task: Task, selected: number[]): string {
  const tiles = orderTiles(task);
  return selected.map((i) => tiles[i]).join(' ');
}

function input(task: Task, value: string, cls = ''): string {
  return `<input class="answer ${cls}" type="text" data-task="${esc(task.id)}" value="${esc(value)}"
    autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="es"
    placeholder="${esc(T.lesson.placeholder)}" aria-label="${esc(T.lesson.placeholder)}">`;
}

function hint(text: string | undefined): string {
  return text ? `<details class="hint"><summary>${esc(T.lesson.showHint)}</summary>${md(text)}</details>` : '';
}

function taskBody(task: Task, ws: WorkState, verbs: VerbDictionary): string {
  const value = ws.draft[task.id] ?? '';
  switch (task.type) {
    case 'conjugate': {
      const ru = verbs[task.verb]?.ru ?? '';
      if (task.sentence) {
        const [before, after] = task.sentence.split('___');
        return `
          <p class="es-line">${esc(before)}${input(task, value, 'inline')}${esc(after ?? '')}</p>
          <p class="verb-tag">${esc(T.lesson.conjugate(task.verb, ru))}</p>
          ${task.translation ? `<p class="muted small">${esc(task.translation)}</p>` : ''}
          ${hint(task.hint)}`;
      }
      return `
        <p class="muted small">${esc(T.lesson.conjugateBare)}</p>
        <p class="es-line"><b>${esc(task.verb)}</b> <span class="muted">(${esc(ru)})</span> → <span class="person">${esc(PERSON_ES[task.person])}</span></p>
        ${input(task, value)}
        ${hint(task.hint)}`;
    }
    case 'choice': {
      const opts = shuffle(task.options, seededRng(hashString(task.id)));
      return `
        <p class="question">${md(task.question)}</p>
        <div class="options" role="radiogroup">
          ${opts.map((o) => `
            <label class="option${value === o ? ' selected' : ''}">
              <input type="radio" name="${esc(task.id)}" value="${esc(o)}" data-task="${esc(task.id)}"${value === o ? ' checked' : ''}>
              <span lang="es">${esc(o)}</span>
            </label>`).join('')}
        </div>
        ${hint(task.hint)}`;
    }
    case 'text':
      return `<p class="question">${md(task.question)}</p>${input(task, value)}${hint(task.hint)}`;
    case 'picture':
      return `
        <p class="muted small">${esc(T.lesson.pictureAsk)}</p>
        ${imageHtml(task.image)}
        ${input(task, value)}
        ${hint(task.hint ?? task.ru)}`;
    case 'order': {
      const tiles = orderTiles(task);
      const sel = ws.order[task.id] ?? [];
      return `
        <p class="muted small">${esc(T.lesson.orderAsk)}</p>
        <p class="question">${esc(task.translation)}</p>
        <div class="order-line" aria-live="polite">
          ${sel.length ? sel.map((i, pos) => `<button class="tile chosen" data-action="order-remove" data-task="${esc(task.id)}" data-pos="${pos}" lang="es">${esc(tiles[i])}</button>`).join('') : '<span class="muted small">…</span>'}
        </div>
        <div class="order-bank">
          ${tiles.map((w, i) => `<button class="tile" data-action="order-add" data-task="${esc(task.id)}" data-index="${i}"${sel.includes(i) ? ' disabled' : ''} lang="es">${esc(w)}</button>`).join('')}
        </div>
        ${sel.length ? `<button class="link small" data-action="order-reset" data-task="${esc(task.id)}">${esc(T.lesson.orderReset)}</button>` : ''}
        ${hint(task.hint)}`;
    }
  }
}

function imageHtml(img: Extract<Task, { type: 'picture' }>['image']): string {
  if (img.kind === 'emoji') return `<div class="picture" role="img" aria-label="картинка">${esc(img.value)}</div>`;
  return `<figure class="picture-img"><img src="${esc(img.src)}" alt=""><figcaption>${esc(img.credit)} · ${esc(img.license)}</figcaption></figure>`;
}

export function isAnswered(task: Task, ws: WorkState): boolean {
  if (task.type === 'order') return (ws.order[task.id] ?? []).length > 0;
  return (ws.draft[task.id] ?? '').trim() !== '';
}

export function workView(session: Session, lesson: Lesson, ws: WorkState, verbs: VerbDictionary): string {
  const round = currentRound(session);
  const n = session.rounds.length;
  const answered = round.tasks.filter((t) => isAnswered(t, ws)).length;
  return `
  <div class="lesson-top">
    <button class="link small" data-action="leave">← ${esc(T.lesson.leave)}</button>
    <h1>${esc(lesson.title)}</h1>
    <p class="muted">${esc(T.lesson.round(n))}${n > 1 ? ` · ${esc(T.lesson.fixHint)}` : ''}</p>
  </div>
  <ol class="tasks">
    ${round.tasks.map((t, i) => `
      <li class="card task" data-task-card="${esc(t.id)}">
        <span class="num">${i + 1}</span>
        ${taskBody(t, ws, verbs)}
      </li>`).join('')}
  </ol>
  <div class="dock">
    <div class="accents" role="toolbar" aria-label="${esc(T.keyboard)}">
      ${ACCENT_CHARS.map((c) => `<button class="key" data-action="insert" data-char="${c}" tabindex="-1">${c}</button>`).join('')}
    </div>
    <div class="dock-row">
      <span class="muted small" id="answered">${esc(T.lesson.answered(answered, round.tasks.length))}</span>
      <button class="btn primary" data-action="check">${esc(T.lesson.check)}</button>
    </div>
  </div>`;
}

// ---------------- Отчёт ----------------

function diffHtml(parts: DiffPart[]): string {
  return parts.map((p) => {
    if (p.kind === 'same') return `<span>${esc(p.text)}</span>`;
    if (p.kind === 'extra') return `<del title="лишнее">${esc(p.text)}</del>`;
    return `<ins title="не хватает">${esc(p.text)}</ins>`;
  }).join('');
}

function conjTable(verb: string, verbs: VerbDictionary, region: Region): string {
  if (!verb) return '';
  const forms = conjugateAll(verb, 'presente', verbs);
  const group = verbGroup(verb);
  return `
    <table class="conj">
      <caption>${esc(verb)} — presente (-${group})</caption>
      <tbody>
        ${PERSONS.filter((p) => region === 'es' || p !== 'vosotros').map((p) => `
          <tr><th>${esc(PERSON_ES[p])}</th><td lang="es">${esc(forms[p])}</td></tr>`).join('')}
      </tbody>
    </table>`;
}

function taskRecap(task: Task, verbs: VerbDictionary, region: Region): string {
  switch (task.type) {
    case 'conjugate':
      return task.sentence
        ? `${esc(task.sentence)} <span class="muted">(${esc(task.verb)})</span>`
        : `${esc(task.verb)} → ${esc(PERSON_ES[task.person])} <span class="muted">(${esc(verbs[task.verb]?.ru ?? '')})</span>`;
    case 'choice':
    case 'text':
      return md(task.question);
    case 'picture':
      return `<span class="mini-pic">${task.image.kind === 'emoji' ? esc(task.image.value) : '🖼'}</span> ${esc(task.ru)} <span class="muted">· ${esc(nounFor(task, region).word)}</span>`;
    case 'order':
      return esc(task.translation);
  }
}

export function resultCard(task: Task, r: CheckResult, ctx: CheckContext, ttsOn: boolean, index: number): string {
  const ok = isPassed(r);
  const views = r.feedback.map(formatFeedback);
  const expected = r.expected || expectedAnswer(task, ctx);
  return `
  <li class="card result ${r.status}">
    <div class="result-head">
      <span class="num">${index + 1}</span>
      <span class="status-pill">${esc(T.report.status[r.status])}</span>
    </div>
    <p class="recap">${taskRecap(task, ctx.verbs, ctx.region)}</p>
    ${r.status !== 'correct' && r.status !== 'empty' ? `
      <p class="answer-line"><span class="label">${esc(T.report.yourAnswer)}:</span>
        <span class="given" lang="es">${r.diff ? diffHtml(r.diff) : esc(r.given)}</span></p>` : ''}
    <p class="answer-line"><span class="label">${esc(ok && r.status === 'correct' ? T.report.yourAnswer : T.report.right)}:</span>
      <b lang="es">${esc(r.status === 'correct' ? r.given : expected)}</b>
      ${ttsOn ? `<button class="key say" data-action="say" data-text="${esc(expected)}" aria-label="${esc(T.listen)}">🔊</button>` : ''}
    </p>
    ${views.length ? `<div class="feedback">${views.map((v) => v.kind === 'text' ? `<p>${md(v.text)}</p>` : conjTable(v.verb, ctx.verbs, ctx.region)).join('')}</div>` : ''}
  </li>`;
}

export function reportView(session: Session, lesson: Lesson, ctx: CheckContext, ttsOn: boolean): string {
  const round = currentRound(session);
  const results = round.results ?? [];
  const okCount = results.filter(isPassed).length;
  const wrong = results.length - okCount;
  // Ошибки сверху: на них сейчас главное внимание.
  const items = results.map((r, i) => ({ r, task: round.tasks[i]!, i }))
    .sort((a, b) => Number(isPassed(a.r)) - Number(isPassed(b.r)) || a.i - b.i);
  return `
  <div class="lesson-top">
    <h1>${esc(T.report.title)}</h1>
    <p class="score ${wrong ? 'has-errors' : 'clean'}">${esc(T.report.score(okCount, results.length))}</p>
    ${wrong === 0 ? `<p>${esc(T.report.allGood)}</p>` : ''}
  </div>
  <ol class="tasks">${items.map(({ r, task, i }) => resultCard(task, r, ctx, ttsOn, i)).join('')}</ol>
  <div class="dock">
    <div class="dock-row">
      ${lesson.ruleId ? `<a class="btn ghost" href="#/rules/${esc(lesson.ruleId)}" target="_blank">${esc(T.report.ruleLink)}</a>` : '<span></span>'}
      ${wrong ? `<button class="btn primary" data-action="fix">${esc(T.report.fix(wrong))}</button>`
        : `<button class="btn primary" data-action="finish">${esc(T.report.finish)}</button>`}
    </div>
  </div>`;
}

export function doneView(lesson: Lesson, sum: SessionSummary, nextDays: number): string {
  return `
  <section class="card done">
    <div class="done-mark" aria-hidden="true">${sum.correct + sum.almost === sum.total ? '🏆' : '💪'}</div>
    <h1>${esc(T.done.title)}</h1>
    <p class="xp">${esc(T.done.xp(sum.xp))}</p>
    <p>${esc(T.done.firstTry(sum.correct + sum.almost, sum.total))}</p>
    <p class="muted">${esc(T.done.rounds(sum.rounds))}</p>
    <p class="muted">${esc(T.done.next(nextDays))}</p>
    <div class="row center">
      <a class="btn primary" href="#/">${esc(T.done.toLessons)}</a>
      <button class="btn ghost" data-action="again" data-lesson="${esc(lesson.id)}">${esc(T.done.again)}</button>
    </div>
  </section>`;
}

// ---------------- Правила ----------------

export function rulesListView(index: ContentIndex): string {
  return `
  <h1>${esc(T.rules.title)}</h1>
  <ul class="rule-list">
    ${index.rules.map((r) => `<li><a class="card rule-link" href="#/rules/${esc(r.id)}"><span class="level">${esc(r.level)}</span> ${esc(r.title)}</a></li>`).join('')}
  </ul>`;
}

function ruleBlock(b: RuleBlock, region: Region): string {
  switch (b.type) {
    case 'h': return `<h2>${md(b.text)}</h2>`;
    case 'p': return `<p>${md(b.text)}</p>`;
    case 'tip': return `<aside class="tip">${md(b.text)}</aside>`;
    case 'table': return `
      <div class="table-wrap"><table>
        <thead><tr>${b.head.map((h) => `<th>${md(h)}</th>`).join('')}</tr></thead>
        <tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${md(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    case 'examples': return `
      <ul class="examples">${b.items.map((e) => `<li><span lang="es">${md(e.es)}</span><span class="muted">${md(e.ru)}</span></li>`).join('')}</ul>`;
    case 'regional': return `
      <div class="regional">
        <div class="${region === 'es' ? 'mine' : ''}"><b>🇪🇸 ${esc(REGION_RU.es)}</b><p>${md(b.es)}</p></div>
        <div class="${region === 'latam' ? 'mine' : ''}"><b>🌎 ${esc(REGION_RU.latam)}</b><p>${md(b.latam)}</p></div>
      </div>`;
  }
}

export function ruleView(rule: Rule, index: ContentIndex, region: Region): string {
  const lesson = index.lessons.find((l) => l.ruleId === rule.id);
  return `
  <a class="link small" href="#/rules">${esc(T.rules.back)}</a>
  <article class="rule">
    <span class="level">${esc(rule.level)}</span>
    <h1>${esc(rule.title)}</h1>
    ${rule.blocks.map((b) => ruleBlock(b, region)).join('')}
  </article>
  ${lesson ? `<div class="row"><a class="btn primary" href="#/lesson/${esc(lesson.id)}">${esc(T.rules.toLesson)}: ${esc(lesson.title)}</a></div>` : ''}`;
}

// ---------------- Настройки ----------------

export function settingsView(settings: Settings, progress: Progress, today: string, ttsSupported: boolean): string {
  const radio = (name: string, value: string, label: string, checked: boolean) => `
    <label class="option${checked ? ' selected' : ''}">
      <input type="radio" name="${name}" value="${value}" data-setting="${name}"${checked ? ' checked' : ''}><span>${label}</span>
    </label>`;
  return `
  <h1>${esc(T.settings.title)}</h1>
  <section class="card">
    <h2>${esc(T.settings.region)}</h2>
    <div class="options">
      ${radio('region', 'es', `🇪🇸 ${esc(REGION_RU.es)}`, settings.region === 'es')}
      ${radio('region', 'latam', `🌎 ${esc(REGION_RU.latam)}`, settings.region === 'latam')}
    </div>
  </section>
  <section class="card">
    <h2>${esc(T.settings.tts)}</h2>
    ${ttsSupported ? `<div class="options">
      ${radio('tts', 'on', esc(T.settings.ttsOn), settings.tts)}
      ${radio('tts', 'off', esc(T.settings.ttsOff), !settings.tts)}
    </div>` : `<p class="muted">${esc(T.settings.ttsUnsupported)}</p>`}
  </section>
  <section class="card">
    <h2>${esc(T.settings.data)}</h2>
    <p>${esc(T.settings.stats(progress.xp, currentStreak(progress, today)))}</p>
    <p class="muted small">${esc(T.settings.dataHint)}</p>
    <div class="row">
      <button class="btn" data-action="export">${esc(T.settings.export)}</button>
      <label class="btn">${esc(T.settings.import)}<input type="file" accept="application/json" data-action="import" hidden></label>
      <button class="btn danger" data-action="reset">${esc(T.settings.reset)}</button>
    </div>
  </section>`;
}

export function notFoundView(): string {
  return `<div class="center"><p>${esc(T.notFound)}</p><a class="btn" href="#/">${esc(T.nav.lessons)}</a></div>`;
}
