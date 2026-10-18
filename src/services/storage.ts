// Хранилище «ключ → значение». Интерфейс асинхронный специально:
// сейчас данные лежат в браузере, а потом их можно перенести в облачную базу (например, Supabase),
// заменив только эту реализацию. Остальной код ничего не заметит.

export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();
  async get<T>(key: string): Promise<T | null> {
    const v = this.data.get(key);
    return v === undefined ? null : (JSON.parse(v) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, JSON.stringify(value));
  }
  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

/** Браузерное хранилище. Если оно недоступно (приватный режим и т. п.), работает в памяти. */
export class LocalStorageStore implements KeyValueStore {
  private fallback = new MemoryStore();
  private readonly prefix: string;
  constructor(prefix = 'est:') {
    this.prefix = prefix;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const v = localStorage.getItem(this.prefix + key);
      return v === null ? null : (JSON.parse(v) as T);
    } catch {
      return this.fallback.get<T>(key);
    }
  }
  async set<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      await this.fallback.set(key, value);
    }
  }
  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch {
      await this.fallback.remove(key);
    }
  }
}
