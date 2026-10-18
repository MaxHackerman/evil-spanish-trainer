// Озвучка встроенным синтезатором речи браузера. Бесплатно и без серверов.
// Качество голоса зависит от устройства: на телефонах обычно хорошее.

import type { Region } from '../core/types.ts';

export interface Speech {
  readonly supported: boolean;
  speak(text: string, region: Region): void;
}

const LANGS: Record<Region, string[]> = {
  es: ['es-ES'],
  latam: ['es-MX', 'es-US', 'es-419', 'es-AR', 'es-CO'],
};

export class BrowserSpeech implements Speech {
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  speak(text: string, region: Region): void {
    if (!this.supported) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const voice = LANGS[region].map((l) => voices.find((v) => v.lang.replace('_', '-') === l)).find(Boolean)
      ?? voices.find((v) => v.lang.startsWith('es'));
    u.lang = voice?.lang ?? LANGS[region][0]!;
    if (voice) u.voice = voice;
    u.rate = 0.9;
    synth.speak(u);
  }
}
