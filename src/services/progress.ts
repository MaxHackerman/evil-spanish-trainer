// Прогресс и настройки конкретного пользователя.
// Ключи привязаны к id пользователя: при появлении аккаунтов у каждого будет своё.

import { defaultSettings, emptyProgress, type Progress, type Settings } from '../core/progress.ts';
import type { Session } from '../core/session.ts';
import type { KeyValueStore } from './storage.ts';

export interface ActiveSession {
  session: Session;
  /** Черновик ответов текущего раунда (ещё не отправленных на проверку). */
  work: { draft: Record<string, string>; order: Record<string, number[]> };
}

export class ProgressRepository {
  private readonly store: KeyValueStore;
  private readonly userId: string;
  constructor(store: KeyValueStore, userId: string) {
    this.store = store;
    this.userId = userId;
  }

  private key(name: string): string {
    return `u:${this.userId}:${name}`;
  }

  async progress(): Promise<Progress> {
    return (await this.store.get<Progress>(this.key('progress'))) ?? emptyProgress();
  }
  saveProgress(p: Progress): Promise<void> {
    return this.store.set(this.key('progress'), p);
  }

  async settings(): Promise<Settings> {
    return { ...defaultSettings(), ...((await this.store.get<Settings>(this.key('settings'))) ?? {}) };
  }
  saveSettings(s: Settings): Promise<void> {
    return this.store.set(this.key('settings'), s);
  }

  /** Незаконченная сессия: чтобы не потерять ответы при случайной перезагрузке страницы. */
  async activeSession(): Promise<ActiveSession | null> {
    const v = await this.store.get<ActiveSession>(this.key('session'));
    return v && typeof v === 'object' && 'session' in v && 'work' in v ? v : null;
  }
  saveSession(s: ActiveSession | null): Promise<void> {
    return s ? this.store.set(this.key('session'), s) : this.store.remove(this.key('session'));
  }

  async reset(): Promise<void> {
    await Promise.all(['progress', 'session'].map((k) => this.store.remove(this.key(k))));
  }
}
