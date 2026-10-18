// ИИ-режимы. Сейчас выключены. Когда появится сервер-посредник, здесь будет реализация,
// которая ходит к нему (ключ API живёт на сервере, а не в браузере).
// Сгенерированные задания обязательно пропускаются через filterValidTasks из core/schema.

import type { Region, Task } from '../core/types.ts';

export interface RetellingReview {
  ok: boolean;
  corrected: string;
  comments: string[];
}

export interface AiService {
  readonly available: boolean;
  /** Пачка заданий на произвольную тему: «праздники», «аренда квартиры»… */
  generateTopicTasks(topic: string, level: string, region: Region): Promise<Task[]>;
  /** Проверка пересказа фильма или песни. reference — эталонное описание из нашей базы. */
  reviewRetelling(text: string, reference: string, region: Region): Promise<RetellingReview>;
}

export class DisabledAi implements AiService {
  readonly available = false;
  async generateTopicTasks(): Promise<Task[]> {
    throw new Error('ИИ-режим пока не подключён');
  }
  async reviewRetelling(): Promise<RetellingReview> {
    throw new Error('ИИ-режим пока не подключён');
  }
}
