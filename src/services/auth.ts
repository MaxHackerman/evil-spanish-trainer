// Пользователь. Сейчас он один и локальный: у каждого устройства свой прогресс.
// Когда появятся аккаунты, здесь будет реализация с регистрацией и входом,
// а весь остальной код уже работает через currentUser() и менять его не придётся.

export interface User {
  id: string;
  name: string;
  isGuest: boolean;
}

export interface AuthService {
  currentUser(): Promise<User>;
  /** Пока не поддерживается; появится вместе с аккаунтами. */
  readonly supportsAccounts: boolean;
}

export class LocalAuth implements AuthService {
  readonly supportsAccounts = false;
  async currentUser(): Promise<User> {
    return { id: 'local', name: 'Я', isGuest: true };
  }
}
