// Источник учебного контента. Сейчас — JSON-файлы рядом с сайтом (папка public/data).
// Позже это может быть база данных или API: достаточно новой реализации ContentRepository.

import { assertLesson, assertRule } from '../core/schema.ts';
import type { ContentIndex, Lesson, Rule, VerbDictionary } from '../core/types.ts';

export interface ContentRepository {
  index(): Promise<ContentIndex>;
  lesson(id: string): Promise<Lesson>;
  rule(id: string): Promise<Rule>;
  verbs(): Promise<VerbDictionary>;
}

export class StaticContentRepository implements ContentRepository {
  private cache = new Map<string, Promise<unknown>>();
  private readonly base: string;
  constructor(base = 'data/') {
    this.base = base;
  }

  private load<T>(path: string): Promise<T> {
    let p = this.cache.get(path);
    if (!p) {
      p = fetch(this.base + path).then((r) => {
        if (!r.ok) throw new Error(`Не удалось загрузить ${path}: ${r.status}`);
        return r.json();
      });
      p.catch(() => this.cache.delete(path));
      this.cache.set(path, p);
    }
    return p as Promise<T>;
  }

  index(): Promise<ContentIndex> {
    return this.load<ContentIndex>('index.json');
  }
  verbs(): Promise<VerbDictionary> {
    return this.load<VerbDictionary>('verbs.json');
  }
  async lesson(id: string): Promise<Lesson> {
    const [raw, verbs] = await Promise.all([this.load<unknown>(`lessons/${id}.json`), this.verbs()]);
    return assertLesson(raw, verbs);
  }
  async rule(id: string): Promise<Rule> {
    return assertRule(await this.load<unknown>(`rules/${id}.json`));
  }
}
