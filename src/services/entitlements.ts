// Доступ к функциям. Сейчас всё бесплатно и открыто.
// При монетизации реализация начнёт проверять подписку пользователя,
// а интерфейс уже везде спрашивает canUse() и сам покажет замочек там, где нужно.

export type Feature =
  | 'lessons.basic'
  | 'lessons.advanced'
  | 'ai.topics'
  | 'ai.songs'
  | 'ai.movies'
  | 'sync';

export interface Entitlements {
  canUse(feature: Feature): boolean;
  readonly plan: string;
}

export class OpenAccess implements Entitlements {
  readonly plan = 'free';
  canUse(_feature: Feature): boolean {
    return true;
  }
}
