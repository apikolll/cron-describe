import cronstrue from 'cronstrue';

export interface CronMatch {
  expression: string;
  start: number;
  end: number;
  /** Null when the expression looks like cron but isn't valid. */
  description: string | null;
  /** Why it's invalid, when description is null. */
  error?: string;
}

const NAMES = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|MON|TUE|WED|THU|FRI|SAT|SUN';
const PART = `(?:[\\d*?/#LW-]|${NAMES})+`;
// Commas only between values, so list literals like "1, 2, 3, 4, 5" don't look like fields.
const FIELD = `${PART}(?:,${PART})*`;
// 5 fields (standard), 6 (with seconds) or 7 (with year). Not glued to surrounding words, and
// not part of a longer run of fields, which can't be cron.
const CRON = new RegExp(
  `(?<![\\w*/,#-])(?<!${FIELD}[ \\t]+)${FIELD}(?:[ \\t]+${FIELD}){4,6}(?![ \\t]+${FIELD})(?![\\w*/,#-])`,
  'gi',
);
const MACRO = /(?<![\w@])@(?:yearly|annually|monthly|weekly|daily|midnight|hourly)\b/gi;

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const ERROR_TERMS: Record<string, string> = { DOM: 'day-of-month', DOW: 'day-of-week' };

export interface DescribeOptions {
  use24HourTimeFormat?: boolean;
}

export const describe = (
  expression: string,
  options: DescribeOptions = {},
): { description: string } | { error: string } => {
  // cronstrue happily describes a zero step ("Every 0 minutes"), which no scheduler accepts.
  if (/\/0*(?!\d)/.test(expression)) {
    return { error: 'step values must be greater than 0' };
  }
  try {
    const description = cronstrue.toString(MACROS[expression.toLowerCase()] ?? expression, {
      throwExceptionOnParseError: true,
      use24HourTimeFormat: options.use24HourTimeFormat ?? false,
    });
    return { description };
  } catch (e) {
    const error = String(e)
      .replace(/^Error:\s*/, '')
      .replace(/\b(DOM|DOW)\b/g, (term) => ERROR_TERMS[term]);
    return { error };
  }
};

/** Every cron-looking expression on a line, with its column range and description or error. */
export const findCronExpressions = (line: string, options: DescribeOptions = {}): CronMatch[] => {
  const matches: CronMatch[] = [];
  for (const pattern of [CRON, MACRO]) {
    for (const m of line.matchAll(pattern)) {
      const expression = m[0];
      // Pure number runs like "1 2 3 4 5" are almost never cron; require a wildcard, step, range or name.
      if (pattern === CRON && /^[\d\s]+$/.test(expression)) continue;
      const result = describe(expression, options);
      matches.push({
        expression,
        start: m.index,
        end: m.index + expression.length,
        description: 'description' in result ? result.description : null,
        ...('error' in result && { error: result.error }),
      });
    }
  }
  return matches;
};
