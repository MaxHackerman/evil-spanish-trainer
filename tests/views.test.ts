// Прогон экранов на настоящем контенте: всё рендерится, ошибки подсвечиваются, текст экранируется.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBatch } from '../src/core/generator.ts';
import { applySession, emptyProgress, defaultSettings } from '../src/core/progress.ts';
import { seededRng } from '../src/core/random.ts';
import { startSession, submit, nextRound, summarize } from '../src/core/session.ts';
import { similarTasks } from '../src/core/generator.ts';
import { expectedAnswer } from '../src/core/checker.ts';
import type { ContentIndex, Lesson, Rule, VerbDictionary } from '../src/core/types.ts';
import {
  doneView, homeView, layout, orderAnswer, orderTiles, reportView, ruleView, rulesListView, settingsView, welcomeView, workView,
} from '../src/ui/views.ts';
import { esc, md } from '../src/ui/html.ts';

const dir = join(import.meta.dirname, '..', 'public', 'data');
const read = <T>(p: string): T => JSON.parse(readFileSync(join(dir, p), 'utf8')) as T;
const index = read<ContentIndex>('index.json');
const verbs = read<VerbDictionary>('verbs.json');
const today = '2026-10-19';

test('экранирование', () => {
  assert.equal(esc('<img onerror=x>'), '&lt;img onerror=x&gt;');
  assert.equal(md('**<b>**'), '<strong>&lt;b&gt;</strong>');
});

test('главная, правила, настройки, приветствие рендерятся', () => {
  const p = emptyProgress();
  const home = homeView(index, p, today, null);
  for (const l of index.lessons) assert.ok(home.includes(`#/lesson/${l.id}`));
  assert.ok(layout({ name: 'home' }, p, today, home).includes('Evil Spanish'));
  assert.ok(rulesListView(index).includes('#/rules/presente-ar'));
  for (const r of index.rules) {
    const html = ruleView(read<Rule>(`rules/${r.id}.json`), index, 'latam');
    assert.ok(html.includes('<h1>'), r.id);
  }
  assert.ok(settingsView(defaultSettings(), p, today, true).includes('data-setting="region"'));
  assert.ok(welcomeView().includes('choose-region'));
});

for (const region of ['es', 'latam'] as const) {
  for (const meta of index.lessons) {
    test(`урок ${meta.id} (${region}): задания → отчёт → работа над ошибками → итог`, () => {
      const lesson = read<Lesson>(`lessons/${meta.id}.json`);
      const rng = seededRng(42);
      const tasks = buildBatch(lesson, region, rng);
      assert.equal(tasks.length, lesson.batchSize);
      let s = startSession(lesson.id, tasks);

      const work = workView(s, lesson, { draft: {}, order: {} }, verbs);
      for (const t of tasks) assert.ok(work.includes(`data-task-card="${t.id}"`), `карточка ${t.id}`);
      assert.ok(work.includes('data-action="check"'));
      assert.ok(work.includes('data-char="ñ"'));

      // Половину отвечаем верно, остальное — неверно.
      const ctx = { region, verbs };
      const answers: Record<string, string> = {};
      tasks.forEach((t, i) => {
        if (t.type === 'order') {
          const tiles = orderTiles(t);
          const sel = (i % 2 === 0 ? t.words : [...t.words].reverse()).map((w) => tiles.indexOf(w));
          answers[t.id] = orderAnswer(t, sel);
        } else {
          answers[t.id] = i % 2 === 0 ? expectedAnswer(t, ctx) : 'zzz';
        }
      });
      s = submit(s, answers, ctx);
      const report = reportView(s, lesson, ctx, true);
      assert.ok(report.includes('class="card result wrong"'));
      assert.ok(report.includes('class="card result correct"'));
      assert.ok(report.includes('data-action="fix"'));
      assert.ok(!report.includes('undefined'), 'в отчёте нет undefined');

      s = nextRound(s, (task, res, used) => similarTasks(task, res, lesson, region, rng, used));
      assert.equal(s.phase, 'work');
      const round = s.rounds[1]!;
      const fixAnswers: Record<string, string> = {};
      for (const t of round.tasks) fixAnswers[t.id] = expectedAnswer(t, ctx);
      s = submit(s, fixAnswers, ctx);
      assert.ok(reportView(s, lesson, ctx, false).includes('data-action="finish"'));

      const sum = summarize(s);
      const progress = applySession(emptyProgress(), lesson.id, sum, today);
      assert.ok(progress.xp > 0);
      assert.ok(doneView(lesson, sum, 1).includes('Занятие завершено'));
      assert.ok(homeView(index, progress, today, null).includes('status-learning') || homeView(index, progress, today, null).includes('status-due'));
    });
  }
}
