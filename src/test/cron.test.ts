import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCronExpressions } from '../cron';

const find = (line: string) => findCronExpressions(line).map((m) => [m.expression, m.description ?? `Invalid: ${m.error}`]);

test('describes a quoted expression in code', () => {
  assert.deepEqual(find("cron.schedule('0 0 * * *', job);"), [['0 0 * * *', 'At 12:00 AM']]);
});

test('reports the column range', () => {
  const [m] = findCronExpressions("cron.schedule('*/5 * * * *', job);");
  assert.equal(m.start, 15);
  assert.equal(m.end, 26);
});

test('handles seconds, names and macros', () => {
  assert.deepEqual(find('"0 30 9 * * MON-FRI"'), [['0 30 9 * * MON-FRI', 'At 09:30 AM, Monday through Friday']]);
  assert.deepEqual(find('schedule: @hourly'), [['@hourly', 'Every hour']]);
});

test('uses 24-hour time when asked', () => {
  const [m] = findCronExpressions('0 18 * * *', { use24HourTimeFormat: true });
  assert.equal(m.description, 'At 18:00');
});

test('ignores things that are not cron', () => {
  assert.deepEqual(find('const xs = [1, 2, 3, 4, 5];'), []);
  assert.deepEqual(find('version 1 2 3 4 5'), []);
  assert.deepEqual(find('a * b * c * d * e'), []);
  assert.deepEqual(find('2 * 3 * 4 * 5 * 6'), []);
});

test('flags cron-looking expressions that are invalid', () => {
  assert.deepEqual(find("'99 99 * * *'"), [['99 99 * * *', 'Invalid: minutes part must be >= 0 and <= 59']]);
  assert.deepEqual(find('0 0 32 * *'), [['0 0 32 * *', 'Invalid: day-of-month part must be >= 1 and <= 31']]);
  assert.deepEqual(find('0 0 * 13 *'), [['0 0 * 13 *', 'Invalid: month part must be >= 1 and <= 12']]);
  assert.deepEqual(find('*/0 * * * *'), [['*/0 * * * *', 'Invalid: step values must be greater than 0']]);
  assert.deepEqual(find('*/10 * * * *'), [['*/10 * * * *', 'Every 10 minutes']]);
});
