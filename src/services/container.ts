// Единственное место, где выбираются конкретные реализации сервисов.
// Переход на облако, подписки или ИИ = поменять строчки здесь.

import { DisabledAi, type AiService } from './ai.ts';
import { LocalAuth, type AuthService } from './auth.ts';
import { StaticContentRepository, type ContentRepository } from './content.ts';
import { OpenAccess, type Entitlements } from './entitlements.ts';
import { ProgressRepository } from './progress.ts';
import { LocalStorageStore, type KeyValueStore } from './storage.ts';
import { BrowserSpeech, type Speech } from './tts.ts';

export interface Services {
  auth: AuthService;
  store: KeyValueStore;
  content: ContentRepository;
  entitlements: Entitlements;
  ai: AiService;
  speech: Speech;
  progress: ProgressRepository;
}

export async function createServices(): Promise<Services> {
  const auth = new LocalAuth();
  const store = new LocalStorageStore();
  const user = await auth.currentUser();
  return {
    auth,
    store,
    content: new StaticContentRepository(),
    entitlements: new OpenAccess(),
    ai: new DisabledAi(),
    speech: new BrowserSpeech(),
    progress: new ProgressRepository(store, user.id),
  };
}
