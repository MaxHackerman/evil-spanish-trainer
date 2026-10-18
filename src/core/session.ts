// Цикл занятия: выполнить пачку → проверить → разобрать ошибки → исправить → закрепить.
// Сессия — неизменяемые данные: каждая функция возвращает новую сессию, старую не трогает.
// Поэтому сессию легко сохранить, восстановить после перезагрузки или отправить на сервер.

import { checkAnswer } from './checker.ts';
import { PASS_RATIO } from './srs.ts';
import type { CheckContext, CheckResult, Task } from './types.ts';

export type Phase = 'work' | 'report' | 'done';

export interface Round {
  tasks: Task[];
  answers?: Record<string, string>;
  results?: CheckResult[];
}

export interface Session {
  lessonId: string;
  phase: Phase;
  /** Раунд 0 — основная пачка; дальше — работа над ошибками. */
  rounds: Round[];
  usedTaskIds: string[];
  startedAt: string;
}

export const XP = { firstCorrect: 10, firstAlmost: 7, fixed: 3 } as const;

export function startSession(lessonId: string, tasks: Task[], now: Date = new Date()): Session {
  return { lessonId, phase: 'work', rounds: [{ tasks }], usedTaskIds: tasks.map((t) => t.id), startedAt: now.toISOString() };
}

export function currentRound(s: Session): Round {
  return s.rounds[s.rounds.length - 1]!;
}

export function isPassed(r: CheckResult): boolean {
  return r.status === 'correct' || r.status === 'almost';
}

export function submit(s: Session, answers: Record<string, string>, ctx: CheckContext): Session {
  if (s.phase !== 'work') return s;
  const round = currentRound(s);
  const results = round.tasks.map((t) => checkAnswer(t, answers[t.id] ?? '', ctx));
  const rounds = [...s.rounds.slice(0, -1), { ...round, answers, results }];
  return { ...s, rounds, phase: 'report' };
}

export function mistakes(s: Session): { task: Task; result: CheckResult }[] {
  const round = currentRound(s);
  if (!round.results) return [];
  return round.results
    .map((result, i) => ({ task: round.tasks[i]!, result }))
    .filter(({ result }) => !isPassed(result));
}

/**
 * Следующий раунд работы над ошибками: те же задания заново + новые на то же правило.
 * makeSimilar получает задание и результат, возвращает свежие задания.
 */
export function nextRound(s: Session, makeSimilar: (task: Task, result: CheckResult, used: Set<string>) => Task[], similarLimit = 6): Session {
  const wrong = mistakes(s);
  if (wrong.length === 0) return { ...s, phase: 'done' };
  const used = new Set(s.usedTaskIds);
  const fresh: Task[] = [];
  for (const { task, result } of wrong) {
    if (fresh.length >= similarLimit) break;
    for (const t of makeSimilar(task, result, used)) {
      if (fresh.length >= similarLimit) break;
      used.add(t.id);
      fresh.push(t);
    }
  }
  const tasks = [...wrong.map((w) => w.task), ...fresh];
  return { ...s, phase: 'work', rounds: [...s.rounds, { tasks }], usedTaskIds: [...used] };
}

export function finish(s: Session): Session {
  return { ...s, phase: 'done' };
}

export interface SessionSummary {
  total: number;
  correct: number;
  almost: number;
  wrong: number;
  /** Успешность по каждому навыку по первой попытке: true — навык закреплён в этой сессии. */
  skills: Record<string, boolean>;
  xp: number;
  rounds: number;
}

export function summarize(s: Session): SessionSummary {
  const first = s.rounds[0]!;
  const res = first.results ?? [];
  const bySkill: Record<string, { ok: number; all: number }> = {};
  let correct = 0;
  let almost = 0;
  res.forEach((r, i) => {
    const skill = first.tasks[i]!.skill;
    const b = (bySkill[skill] ??= { ok: 0, all: 0 });
    b.all++;
    if (isPassed(r)) b.ok++;
    if (r.status === 'correct') correct++;
    if (r.status === 'almost') almost++;
  });
  let xp = correct * XP.firstCorrect + almost * XP.firstAlmost;
  for (const round of s.rounds.slice(1)) {
    xp += (round.results ?? []).filter(isPassed).length * XP.fixed;
  }
  const skills: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(bySkill)) skills[k] = v.ok / v.all >= PASS_RATIO;
  return { total: res.length, correct, almost, wrong: res.length - correct - almost, skills, xp, rounds: s.rounds.length };
}
