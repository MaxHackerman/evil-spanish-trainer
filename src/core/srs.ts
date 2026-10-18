// Интервальное повторение по навыкам (упрощённая система Лейтнера).
// Ошибся — навык возвращается завтра. Ответил хорошо — интервал растёт: 1 → 3 → 7 → 14 → 30 дней.
// Повторный успех в тот же день интервал не увеличивает: закрепление считается только по разным дням.

export interface SkillState {
  box: number;
  /** Дата следующего повторения, YYYY-MM-DD. */
  due: string;
  lastReviewed?: string;
  reviews: number;
  lapses: number;
}

export const INTERVALS = [1, 1, 3, 7, 14, 30] as const;
export const MASTERED_BOX = 3;
/** Доля правильных ответов по навыку в сессии, начиная с которой сессия считается успешной. */
export const PASS_RATIO = 0.8;

export function dayString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return dayString(new Date(y, m - 1, d + n));
}

export function newSkill(today: string): SkillState {
  return { box: 0, due: today, reviews: 0, lapses: 0 };
}

export function review(state: SkillState | undefined, passed: boolean, today: string): SkillState {
  const s = state ?? newSkill(today);
  if (!passed) {
    return { box: 0, due: addDays(today, 1), lastReviewed: today, reviews: s.reviews + 1, lapses: s.lapses + 1 };
  }
  const sameDay = s.lastReviewed === today;
  const box = sameDay ? s.box : Math.min(s.box + 1, INTERVALS.length - 1);
  return { box, due: addDays(today, INTERVALS[box]!), lastReviewed: today, reviews: s.reviews + 1, lapses: s.lapses };
}

export function isDue(s: SkillState | undefined, today: string): boolean {
  return s !== undefined && s.due <= today;
}

export function isMastered(s: SkillState | undefined): boolean {
  return s !== undefined && s.box >= MASTERED_BOX;
}
