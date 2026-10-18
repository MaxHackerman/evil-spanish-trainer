// Все тексты интерфейса и объяснения ошибок на русском.
// Чтобы добавить другой язык, достаточно сделать такой же файл (например, en.ts).

import type { Feedback, Person, Region } from '../core/types.ts';

export const PERSON_ES: Record<Person, string> = {
  yo: 'yo',
  tu: 'tú',
  el: 'él / ella / usted',
  nosotros: 'nosotros',
  vosotros: 'vosotros',
  ellos: 'ellos / ellas / ustedes',
};

const PERSON_RU: Record<Person, string> = {
  yo: '«я» (yo)',
  tu: '«ты» (tú)',
  el: '«он / она / вы-вежливо» (él / ella / usted)',
  nosotros: '«мы» (nosotros)',
  vosotros: '«вы» (vosotros)',
  ellos: '«они / вы-все» (ellos / ustedes)',
};

const STEM_CHANGE_RU: Record<string, string> = {
  'e>ie': 'e → ie',
  'o>ue': 'o → ue',
  'e>i': 'e → i',
  'u>ue': 'u → ue',
};

export const REGION_RU: Record<Region, string> = { es: 'Испания', latam: 'Латинская Америка' };

export type FeedbackView = { kind: 'text'; text: string } | { kind: 'table'; verb: string };

/** Превращает код обратной связи в понятное объяснение. **жирный** размечается в интерфейсе. */
export function formatFeedback(fb: Feedback): FeedbackView {
  const p = fb.params ?? {};
  const text = (t: string): FeedbackView => ({ kind: 'text', text: t });
  switch (fb.code) {
    case 'empty':
      return text('Ответа нет. Посмотри правильный вариант и попробуй в работе над ошибками.');
    case 'accent':
      return text(`Почти! Не хватает ударения или буквы ñ: правильно **${p.expected}**. Засчитано, но в испанском ударение может менять смысл слова, так что привыкай ставить.`);
    case 'typo':
      return text(`Похоже на опечатку: правильно **${p.expected}**.`);
    case 'custom':
      return text(p.text ?? '');
    case 'conj.infinitive':
      return text(`Глагол остался в начальной форме (**${p.verb}**). В предложении его нужно поставить в форму нужного лица: отбрось окончание -ar/-er/-ir и добавь личное окончание.`);
    case 'conj.wrong_person':
      return text(`Это форма для лица ${PERSON_RU[p.givenPerson as Person]}, а нужна для ${PERSON_RU[p.person as Person]}.`);
    case 'conj.wrong_ending':
      return text(`Основа **${p.stem}-** верная, но окончание не то. Для ${PERSON_RU[p.person as Person]} нужно **-${p.ending}**.`);
    case 'conj.wrong_stem':
      return text(`Окончание верное, но в основе глагола ошибка. Правильно: **${p.expected}**.`);
    case 'conj.stem_missed':
      return text(`**${p.verb}** — глагол со сменой гласной (${STEM_CHANGE_RU[p.change ?? ''] ?? p.change}) в формах yo, tú, él, ellos. Правильно: **${p.expected}**.`);
    case 'conj.stem_extra':
      return text(`В формах nosotros и vosotros гласная **не** меняется: ударение падает на окончание. Правильно: **${p.expected}**.`);
    case 'conj.generic':
      return text(`Нужна форма глагола **${p.verb}** для лица ${PERSON_RU[p.person as Person]}: **${p.expected}**.`);
    case 'conj.table':
      return { kind: 'table', verb: p.verb ?? '' };
    case 'picture.no_article':
      return text(`Не хватает артикля. Существительное в словаре лучше сразу учить вместе с ним: **${p.article} ${p.word}**.`);
    case 'picture.wrong_article':
      return text(`Артикль не тот: **${p.word}** — ${p.gender === 'm' ? 'мужского' : 'женского'} рода, поэтому **${p.article} ${p.word}**.`);
    case 'picture.special_article':
      return text(`Ловушка! **${p.word}** — женского рода, но начинается с ударного «a», поэтому в единственном числе говорят **el ${p.word}** (иначе «la a…» сливается). Во множественном числе снова **las**.`);
    case 'picture.gender':
      return text(p.word?.endsWith('o') && p.gender === 'f' || p.word?.endsWith('a') && p.gender === 'm'
        ? `Запомни исключение: **${p.article} ${p.word}** (${p.gender === 'm' ? 'мужской' : 'женский'} род, хотя окончание обманчивое).`
        : `**${p.article} ${p.word}** — ${p.gender === 'm' ? 'мужской' : 'женский'} род.`);
    case 'picture.wrong_word':
      return text(`На картинке «${p.ru}»: **${p.word}**.`);
    case 'picture.regional':
      return text(`Верно! Только **${p.word}** так говорят скорее в регионе «${REGION_RU[p.region as Region]}». В выбранном регионе чаще: **${p.main}**.`);
    case 'order.distractor':
      return text(`Слово **${p.word}** здесь лишнее: это ловушка с неподходящей формой.`);
    case 'order.wrong':
      return text('Порядок или набор слов неверный. Сравни со схемой ниже: базовый порядок в испанском — подлежащее, глагол, остальное; отрицание no ставится прямо перед глаголом.');
    default:
      return text(fb.code);
  }
}

export const T = {
  appName: 'Evil Spanish',
  nav: { lessons: 'Уроки', rules: 'Правила', settings: 'Настройки' },
  loading: 'Загружаю…',
  loadError: 'Не получилось загрузить данные. Проверь интернет и обнови страницу.',
  home: {
    title: 'Уроки',
    due: 'Пора повторить',
    dueHint: 'Эти темы пора освежить, иначе они начнут забываться.',
    start: 'Начать',
    repeat: 'Повторить',
    continue: 'Продолжить',
    status: { new: 'новое', learning: 'в процессе', due: 'пора повторить', mastered: 'закреплено' },
    rule: 'Правило',
    resume: 'У тебя есть незаконченное занятие',
  },
  welcome: {
    title: '¡Hola! Выбери вариант испанского',
    text: 'Грамматика почти одинаковая, но отличаются форма «вы» для компании (vosotros есть только в Испании), часть слов и произношение. Переключить можно в любой момент в настройках.',
  },
  lesson: {
    check: 'Проверить',
    answered: (a: number, b: number) => `Отвечено ${a} из ${b}`,
    round: (n: number) => (n === 1 ? 'Задания' : `Работа над ошибками · раунд ${n - 1}`),
    fixHint: 'Сначала задания, где была ошибка, затем новые на то же правило.',
    placeholder: 'Ответ',
    conjugate: (verb: string, ru: string) => `${verb} — ${ru}`,
    conjugateBare: 'Поставь глагол в нужную форму',
    pictureAsk: 'Что на картинке? Напиши с артиклем (el / la)',
    orderAsk: 'Собери фразу',
    orderReset: 'Сбросить',
    showHint: 'Подсказка',
    leave: 'Выйти из урока',
    leaveConfirm: 'Выйти? Ответы этого раунда сохранятся, можно будет продолжить.',
  },
  report: {
    title: 'Результат',
    score: (ok: number, all: number) => `${ok} из ${all}`,
    yourAnswer: 'Твой ответ',
    right: 'Правильно',
    fix: (n: number) => `Исправить ошибки (${n})`,
    finish: 'Завершить',
    allGood: 'Все ответы верные!',
    ruleLink: 'Повторить правило',
    status: { correct: 'Верно', almost: 'Почти', wrong: 'Ошибка', empty: 'Нет ответа' },
  },
  done: {
    title: 'Занятие завершено',
    xp: (n: number) => `+${n} опыта`,
    firstTry: (ok: number, all: number) => `С первой попытки: ${ok} из ${all}`,
    rounds: (n: number) => (n > 1 ? `Раундов работы над ошибками: ${n - 1}` : 'Без работы над ошибками'),
    next: (days: number) => (days <= 1 ? 'Тема вернётся на повторение завтра.' : `Следующее повторение темы через ${days} дн.`),
    toLessons: 'К урокам',
    again: 'Ещё раз',
  },
  rules: { title: 'Правила', back: '← Все правила', toLesson: 'Тренировать' },
  settings: {
    title: 'Настройки',
    region: 'Вариант испанского',
    tts: 'Озвучка',
    ttsOn: 'Включена',
    ttsOff: 'Выключена',
    ttsUnsupported: 'Этот браузер не умеет озвучивать текст.',
    data: 'Прогресс',
    dataHint: 'Прогресс хранится в этом браузере. Сохрани файл, чтобы перенести его на другое устройство или не потерять при очистке браузера.',
    export: 'Сохранить в файл',
    import: 'Загрузить из файла',
    imported: 'Прогресс загружен.',
    importError: 'Это не похоже на файл прогресса.',
    reset: 'Сбросить прогресс',
    resetConfirm: 'Точно стереть весь прогресс? Это нельзя отменить.',
    stats: (xp: number, streak: number) => `Опыт: ${xp} · Серия: ${streak} дн.`,
  },
  keyboard: 'Вставить букву',
  listen: 'Послушать',
  notFound: 'Страница не найдена',
};
