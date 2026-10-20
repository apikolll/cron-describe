import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExpression, parseExpression } from '../builder';

const roundTrip = (expression: string) => buildExpression(parseExpression(expression));

test('recognises each preset', () => {
  const cases: [string, string][] = [
    ['* * * * *', 'everyMinute'],
    ['*/15 * * * *', 'everyNMinutes'],
    ['30 * * * *', 'hourly'],
    ['0 0 * * *', 'daily'],
    ['0 9 * * 1-5', 'weekly'],
    ['30 0 1 * *', 'monthly'],
    ['0 12 25 12 *', 'yearly'],
    ['0 0,8,16 * * *', 'custom'],
    ['0 0 L * *', 'custom'],
    ['not a cron', 'custom'],
  ];
  for (const [expression, preset] of cases) {
    assert.equal(parseExpression(expression).preset, preset, expression);
  }
});

test('round-trips expressions unchanged', () => {
  for (const expression of ['* * * * *', '*/15 * * * *', '0 0 * * *', '0 9 * * 1,3,5', '30 0 1 * *', '0 0,8,16 * * *']) {
    assert.equal(roundTrip(expression), expression);
  }
});

test('reads day names and ranges, and writes compact numbers', () => {
  assert.deepEqual(parseExpression('0 9 * * MON-FRI').weekdays, [1, 2, 3, 4, 5]);
  assert.deepEqual(parseExpression('0 9 * * 1-7').weekdays, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(roundTrip('0 9 * * MON-FRI'), '0 9 * * 1-5');
  assert.equal(roundTrip('0 9 * * SAT,SUN'), '0 9 * * 0,6');
  assert.equal(roundTrip('@daily'), '0 0 * * *');
});

test('keeps seconds and year fields', () => {
  assert.equal(roundTrip('15 0 9 * * *'), '15 0 9 * * *');
  const state = { ...parseExpression('0 0 9 * * * 2027'), hour: 18 };
  assert.equal(buildExpression(state), '0 0 18 * * * 2027');
});

test('builds from edited state', () => {
  const state = parseExpression('0 0 * * *');
  assert.equal(buildExpression({ ...state, preset: 'weekly', hour: 9, minute: 30, weekdays: [5, 1, 3] }), '30 9 * * 1,3,5');
  assert.equal(buildExpression({ ...state, preset: 'yearly', dayOfMonth: 25, month: 12 }), '0 0 25 12 *');
  assert.equal(buildExpression({ ...state, preset: 'custom', custom: ' 5 4 * * * ' }), '5 4 * * *');
});
