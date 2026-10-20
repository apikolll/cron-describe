// Turns cron expressions into editor form state and back. Kept free of vscode imports so it's testable.

export type Preset = 'everyMinute' | 'everyNMinutes' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface BuilderState {
  preset: Preset;
  /** everyNMinutes */
  interval: number;
  minute: number;
  hour: number;
  /** 0 (Sunday) – 6 (Saturday) */
  weekdays: number[];
  dayOfMonth: number;
  /** 1 – 12 */
  month: number;
  /** The full expression, used as-is when preset is custom. */
  custom: string;
  /** Leading seconds field and trailing year field of 6/7-field expressions, kept when rebuilding. */
  seconds?: string;
  year?: string;
}

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const single = (field: string, min: number, max: number): number | null => {
  if (!/^\d+$/.test(field)) return null;
  const n = Number(field);
  return n >= min && n <= max ? n : null;
};

const dayNumber = (token: string): number | null => {
  const name = DAY_NAMES.indexOf(token.toUpperCase());
  if (name !== -1) return name;
  const n = single(token, 0, 7);
  return n === null ? null : n % 7;
};

/** "1-5" or "MON,WED,FRI" → [1, 2, 3, 4, 5] / [1, 3, 5]; null for steps, L, # and the like. */
const parseWeekdays = (field: string): number[] | null => {
  const days = new Set<number>();
  for (const token of field.split(',')) {
    const [from, to, ...rest] = token.split('-');
    const a = dayNumber(from);
    const b = to === undefined ? a : dayNumber(to);
    if (a === null || b === null || rest.length || (to !== undefined && b < a && b !== 0)) return null;
    // "1-7" / "MON-SUN" run up to Sunday, which is 0 after normalising.
    const end = to !== undefined && b === 0 && a > 0 ? 7 : b;
    for (let d = a; d <= end; d++) days.add(d % 7);
  }
  return [...days].sort((x, y) => x - y);
};

/** [1, 2, 3, 4, 5] → "1-5"; [1, 3, 5] → "1,3,5". */
const formatWeekdays = (days: number[]): string => {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}-${sorted[j]}` : sorted.slice(i, j + 1).join(','));
    i = j + 1;
  }
  return parts.join(',');
};

export const parseExpression = (expression: string): BuilderState => {
  const trimmed = expression.trim();
  const state: BuilderState = {
    preset: 'custom',
    interval: 5,
    minute: 0,
    hour: 9,
    weekdays: [1],
    dayOfMonth: 1,
    month: 1,
    custom: trimmed,
  };

  const fields = (MACROS[trimmed.toLowerCase()] ?? trimmed).split(/\s+/);
  if (fields.length < 5 || fields.length > 7) return state;
  if (fields.length >= 6) state.seconds = fields.shift();
  if (fields.length === 6) state.year = fields.pop();

  const [min, hr, dom, mon, dow] = fields;
  const minute = single(min, 0, 59);
  const hour = single(hr, 0, 23);
  const step = /^\*\/(\d+)$/.exec(min);

  if (minute !== null) state.minute = minute;
  if (hour !== null) state.hour = hour;

  const rest = `${hr} ${dom} ${mon} ${dow}`;
  if (min === '*' && rest === '* * * *') return { ...state, preset: 'everyMinute' };
  if (step && Number(step[1]) >= 1 && Number(step[1]) <= 59 && rest === '* * * *') {
    return { ...state, preset: 'everyNMinutes', interval: Number(step[1]) };
  }
  if (minute === null) return state;
  if (rest === '* * * *') return { ...state, preset: 'hourly' };
  if (hour === null) return state;

  if (dom === '*' && mon === '*') {
    if (dow === '*') return { ...state, preset: 'daily' };
    const weekdays = parseWeekdays(dow);
    return weekdays?.length ? { ...state, preset: 'weekly', weekdays } : state;
  }

  const dayOfMonth = single(dom, 1, 31);
  if (dayOfMonth === null || dow !== '*') return state;
  if (mon === '*') return { ...state, preset: 'monthly', dayOfMonth };
  const month = single(mon, 1, 12);
  return month === null ? state : { ...state, preset: 'yearly', dayOfMonth, month };
};

export const buildExpression = (state: BuilderState): string => {
  if (state.preset === 'custom') return state.custom.trim();

  const { minute: m, hour: h } = state;
  const core = {
    everyMinute: '* * * * *',
    everyNMinutes: `*/${state.interval} * * * *`,
    hourly: `${m} * * * *`,
    daily: `${m} ${h} * * *`,
    weekly: `${m} ${h} * * ${formatWeekdays(state.weekdays)}`,
    monthly: `${m} ${h} ${state.dayOfMonth} * *`,
    yearly: `${m} ${h} ${state.dayOfMonth} ${state.month} *`,
  }[state.preset];

  return [state.seconds, core, state.year].filter((part) => part !== undefined).join(' ');
};
