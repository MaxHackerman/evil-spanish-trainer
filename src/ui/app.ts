// Контроллер: маршруты, состояние, обработка действий пользователя.

import { buildBatch, similarTasks } from '../core/generator.ts';
import { applySession, isProgress, type Progress, type Settings } from '../core/progress.ts';
import { dayString } from '../core/srs.ts';
import { currentRound, finish, nextRound, startSession, submit, summarize } from '../core/session.ts';
import type { CheckContext, ContentIndex, Lesson, Region, VerbDictionary } from '../core/types.ts';
import { T } from '../i18n/ru.ts';
import type { Services } from '../services/container.ts';
import type { ActiveSession } from '../services/progress.ts';
import {
  doneView, errorView, homeView, isAnswered, layout, loadingView, notFoundView, orderAnswer, reportView,
  ruleView, rulesListView, settingsView, welcomeView, workView, type Route,
} from './views.ts';

type Active = ActiveSession;

export class App {
  private readonly root: HTMLElement;
  private readonly s: Services;
  private progress!: Progress;
  private settings!: Settings;
  private index!: ContentIndex;
  private verbs!: VerbDictionary;
  private route: Route = { name: 'home' };
  private lesson: Lesson | null = null;
  private active: Active | null = null;
  private doneHtml: string | null = null;
  private lastInput: HTMLInputElement | null = null;
  private saveTimer: number | undefined;

  constructor(root: HTMLElement, services: Services) {
    this.root = root;
    this.s = services;
  }

  async start(): Promise<void> {
    this.root.innerHTML = loadingView();
    try {
      [this.progress, this.settings, this.index, this.verbs] = await Promise.all([
        this.s.progress.progress(), this.s.progress.settings(), this.s.content.index(), this.s.content.verbs(),
      ]);
      this.active = await this.s.progress.activeSession();
    } catch (e) {
      this.root.innerHTML = errorView(String(e));
      return;
    }
    this.bindEvents();
    window.addEventListener('hashchange', () => void this.navigate());
    await this.navigate();
  }

  private today(): string {
    return dayString(new Date());
  }

  private ctx(): CheckContext {
    return { region: this.settings.region, verbs: this.verbs };
  }

  private parseRoute(): Route {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.length === 0) return { name: 'home' };
    if (parts[0] === 'lesson' && parts[1]) return { name: 'lesson', id: parts[1] };
    if (parts[0] === 'rules' && parts[1]) return { name: 'rule', id: parts[1] };
    if (parts[0] === 'rules') return { name: 'rules' };
    if (parts[0] === 'settings') return { name: 'settings' };
    return { name: 'home' };
  }

  private async navigate(): Promise<void> {
    this.route = this.parseRoute();
    if (this.route.name !== 'lesson') this.doneHtml = null;
    if (this.route.name === 'lesson') await this.openLesson(this.route.id);
    await this.render();
    window.scrollTo(0, 0);
  }

  private async openLesson(id: string): Promise<void> {
    try {
      this.lesson = await this.s.content.lesson(id);
    } catch (e) {
      this.lesson = null;
      this.root.innerHTML = errorView(String(e));
      return;
    }
    if (this.active?.session.lessonId === id && this.active.session.phase !== 'done') return;
    if (this.doneHtml) return;
    this.newSession(this.lesson);
  }

  private newSession(lesson: Lesson): void {
    const tasks = buildBatch(lesson, this.settings.region, Math.random);
    this.active = { session: startSession(lesson.id, tasks), work: { draft: {}, order: {} } };
    this.doneHtml = null;
    void this.persistActive();
  }

  private async render(): Promise<void> {
    let body: string;
    if (!this.settings.regionChosen) {
      body = welcomeView();
    } else {
      switch (this.route.name) {
        case 'home':
          body = homeView(this.index, this.progress, this.today(), this.active && this.active.session.phase !== 'done' ? this.active.session.lessonId : null);
          break;
        case 'lesson':
          body = this.lessonBody();
          break;
        case 'rules':
          body = rulesListView(this.index);
          break;
        case 'rule':
          try {
            body = ruleView(await this.s.content.rule(this.route.id), this.index, this.settings.region);
          } catch {
            body = notFoundView();
          }
          break;
        case 'settings':
          body = settingsView(this.settings, this.progress, this.today(), this.s.speech.supported);
          break;
      }
    }
    this.root.innerHTML = layout(this.route, this.progress, this.today(), body);
    document.body.classList.toggle('has-dock', this.root.querySelector('.dock') !== null);
  }

  private lessonBody(): string {
    if (this.doneHtml) return this.doneHtml;
    if (!this.lesson || !this.active) return notFoundView();
    const { session, work } = this.active;
    if (session.phase === 'work') return workView(session, this.lesson, work, this.verbs);
    if (session.phase === 'report') return reportView(session, this.lesson, this.ctx(), this.settings.tts && this.s.speech.supported);
    return notFoundView();
  }

  private persistActive(): Promise<void> {
    return this.s.progress.saveSession(this.active);
  }

  private persistSoon(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.persistActive(), 400);
  }

  // ---------------- События ----------------

  private bindEvents(): void {
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!el || el.tagName === 'INPUT') return;
      void this.onAction(el.dataset.action!, el);
    });
    // Кнопки с буквами не должны забирать фокус из поля ввода.
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('[data-action="insert"]')) e.preventDefault();
    });
    this.root.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement && t.classList.contains('answer')) this.lastInput = t;
    });
    this.root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.classList.contains('answer')) this.setDraft(t.dataset.task!, t.value, false);
    });
    this.root.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type === 'radio' && t.dataset.task) this.setDraft(t.dataset.task, t.value, true);
      else if (t.dataset.setting) void this.changeSetting(t.dataset.setting, t.value);
      else if (t.dataset.action === 'import' && t.files?.[0]) void this.importProgress(t.files[0]);
    });
    this.root.addEventListener('keydown', (e) => {
      // Enter в поле ответа переводит к следующему полю.
      const t = e.target as HTMLElement;
      if (e.key !== 'Enter' || !(t instanceof HTMLInputElement) || !t.classList.contains('answer')) return;
      e.preventDefault();
      const all = [...this.root.querySelectorAll<HTMLInputElement>('input.answer')];
      const next = all[all.indexOf(t) + 1];
      if (next) next.focus();
      else this.root.querySelector<HTMLButtonElement>('[data-action="check"]')?.focus();
    });
  }

  private setDraft(taskId: string, value: string, rerender: boolean): void {
    if (!this.active) return;
    this.active.work.draft[taskId] = value;
    this.persistSoon();
    if (rerender) void this.renderKeepScroll();
    else this.updateCounter();
  }

  private updateCounter(): void {
    if (!this.active) return;
    const round = currentRound(this.active.session);
    const done = round.tasks.filter((t) => isAnswered(t, this.active!.work)).length;
    const el = this.root.querySelector('#answered');
    if (el) el.textContent = T.lesson.answered(done, round.tasks.length);
  }

  private async renderKeepScroll(): Promise<void> {
    const y = window.scrollY;
    const focusedTask = (document.activeElement as HTMLElement | null)?.dataset?.task;
    await this.render();
    window.scrollTo(0, y);
    if (focusedTask) this.root.querySelector<HTMLInputElement>(`input.answer[data-task="${CSS.escape(focusedTask)}"]`)?.focus();
  }

  private async onAction(action: string, el: HTMLElement): Promise<void> {
    const a = this.active;
    switch (action) {
      case 'choose-region':
        this.settings = { ...this.settings, region: el.dataset.region as Region, regionChosen: true };
        await this.s.progress.saveSettings(this.settings);
        await this.render();
        return;
      case 'insert': {
        const inp = this.lastInput && this.root.contains(this.lastInput) ? this.lastInput : this.root.querySelector<HTMLInputElement>('input.answer');
        if (!inp) return;
        const start = inp.selectionStart ?? inp.value.length;
        const end = inp.selectionEnd ?? inp.value.length;
        inp.value = inp.value.slice(0, start) + el.dataset.char + inp.value.slice(end);
        inp.focus();
        inp.setSelectionRange(start + 1, start + 1);
        this.setDraft(inp.dataset.task!, inp.value, false);
        return;
      }
      case 'order-add':
      case 'order-remove':
      case 'order-reset': {
        if (!a) return;
        const id = el.dataset.task!;
        const sel = [...(a.work.order[id] ?? [])];
        if (action === 'order-add') sel.push(Number(el.dataset.index));
        if (action === 'order-remove') sel.splice(Number(el.dataset.pos), 1);
        a.work.order[id] = action === 'order-reset' ? [] : sel;
        this.persistSoon();
        await this.renderKeepScroll();
        return;
      }
      case 'check': {
        if (!a) return;
        const round = currentRound(a.session);
        const answers: Record<string, string> = {};
        for (const t of round.tasks) {
          answers[t.id] = t.type === 'order' ? orderAnswer(t, a.work.order[t.id] ?? []) : (a.work.draft[t.id] ?? '');
        }
        a.session = submit(a.session, answers, this.ctx());
        await this.persistActive();
        await this.render();
        window.scrollTo(0, 0);
        return;
      }
      case 'fix': {
        if (!a || !this.lesson) return;
        const lesson = this.lesson;
        a.session = nextRound(a.session, (task, res, used) => similarTasks(task, res, lesson, this.settings.region, Math.random, used));
        a.work = { draft: {}, order: {} };
        await this.persistActive();
        await this.render();
        window.scrollTo(0, 0);
        return;
      }
      case 'finish':
        await this.completeSession();
        return;
      case 'again':
        if (this.lesson) this.newSession(this.lesson);
        await this.render();
        window.scrollTo(0, 0);
        return;
      case 'leave':
        if (confirm(T.lesson.leaveConfirm)) location.hash = '#/';
        return;
      case 'say':
        this.s.speech.speak(el.dataset.text ?? '', this.settings.region);
        return;
      case 'export':
        this.exportProgress();
        return;
      case 'reset':
        if (!confirm(T.settings.resetConfirm)) return;
        await this.s.progress.reset();
        this.progress = await this.s.progress.progress();
        this.active = null;
        await this.render();
        return;
    }
  }

  private async completeSession(): Promise<void> {
    if (!this.active || !this.lesson) return;
    const session = finish(this.active.session);
    const sum = summarize(session);
    const today = this.today();
    this.progress = applySession(this.progress, this.lesson.id, sum, today);
    await this.s.progress.saveProgress(this.progress);
    const skills = Object.keys(sum.skills);
    const due = skills.map((k) => this.progress.skills[k]?.due).filter((d): d is string => !!d).sort()[0] ?? today;
    const days = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
    this.doneHtml = doneView(this.lesson, sum, days);
    this.active = null;
    await this.persistActive();
    await this.render();
    window.scrollTo(0, 0);
  }

  private async changeSetting(name: string, value: string): Promise<void> {
    if (name === 'region') this.settings = { ...this.settings, region: value as Region, regionChosen: true };
    if (name === 'tts') this.settings = { ...this.settings, tts: value === 'on' };
    await this.s.progress.saveSettings(this.settings);
    await this.render();
  }

  private exportProgress(): void {
    const data = JSON.stringify({ progress: this.progress, settings: this.settings, exportedAt: new Date().toISOString() }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `evil-spanish-progress-${this.today()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async importProgress(file: File): Promise<void> {
    try {
      const data = JSON.parse(await file.text()) as { progress?: unknown; settings?: Settings };
      if (!isProgress(data.progress)) throw new Error('bad');
      this.progress = data.progress;
      await this.s.progress.saveProgress(this.progress);
      if (data.settings) {
        this.settings = { ...this.settings, ...data.settings };
        await this.s.progress.saveSettings(this.settings);
      }
      alert(T.settings.imported);
    } catch {
      alert(T.settings.importError);
    }
    await this.render();
  }
}
