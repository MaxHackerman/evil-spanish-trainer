import { addDays, isDue, isMastered, review, type SkillState } from './srs.ts';
import type { SessionSummary } from './session.ts';
import type { Region } from './types.ts';

export interface LessonStats {
  sessions: number;
  bestPercent: number;
  lastDay: string;
}

export interface Progress {
  schemaVersion: 1;
  xp: number;
  streak: { count: number; lastDay?: string };
  skills: Record<string, SkillState>;
  lessons: Record<string, LessonStats>;
}

export interface Settings {
  schemaVersion: 1;
  region: Region;
  regionChosen: boolean;
  tts: boolean;
}

export const emptyProgress = (): Progress => ({ schemaVersion: 1, xp: 0, streak: { count: 0 }, skills: {}, lessons: {} });
export const defaultSettings = (): Settings => ({ schemaVersion: 1, region: 'es', regionChosen: false, tts: true });

/** Учитывает законченную сессию: опыт, серия дней, интервальное повторение, статистика урока. */
export function applySession(p: Progress, lessonId: string, sum: SessionSummary, today: string): Progress {
  const skills = { ...p.skills };
  for (const [skill, passed] of Object.entries(sum.skills)) skills[skill] = review(skills[skill], passed, today);

  const last = p.streak.lastDay;
  const count = last === today ? p.streak.count : last === addDays(today, -1) ? p.streak.count + 1 : 1;

  const prev = p.lessons[lessonId];
  const percent = sum.total ? Math.round(((sum.correct + sum.almost) / sum.total) * 100) : 0;
  const lessons = {
    ...p.lessons,
    [lessonId]: { sessions: (prev?.sessions ?? 0) + 1, bestPercent: Math.max(prev?.bestPercent ?? 0, percent), lastDay: today },
  };
  return { ...p, xp: p.xp + sum.xp, streak: { count, lastDay: today }, skills, lessons };
}

/** Серия считается живой, если занимались сегодня или вчера. */
export function currentStreak(p: Progress, today: string): number {
  const last = p.streak.lastDay;
  return last === today || last === addDays(today, -1) ? p.streak.count : 0;
}

export type LessonStatus = 'new' | 'learning' | 'due' | 'mastered';

export function lessonStatus(p: Progress, lessonId: string, skills: string[], today: string): LessonStatus {
  if (!p.lessons[lessonId]) return 'new';
  const states = skills.map((s) => p.skills[s]);
  if (states.some((s) => isDue(s, today))) return 'due';
  if (states.length > 0 && states.every((s) => isMastered(s))) return 'mastered';
  return 'learning';
}

/** Простая проверка импортируемого файла прогресса. */
export function isProgress(v: unknown): v is Progress {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.schemaVersion === 1 && typeof o.xp === 'number' && typeof o.skills === 'object' && typeof o.lessons === 'object';
}
