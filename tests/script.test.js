const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatOffset,
  computeDifferenceHours,
  calculateMeetingSlots,
  searchTimezones,
  zonedTimeToUtc,
} = require('../script.js');

test('formatOffset formats minutes as UTC +/- hh:mm', () => {
  assert.equal(formatOffset(0), 'UTC+00:00');
  assert.equal(formatOffset(-330), 'UTC-05:30');
  assert.equal(formatOffset(345), 'UTC+05:45');
});

test('computeDifferenceHours returns number-like output', () => {
  const diff = computeDifferenceHours('UTC', 'Asia/Tokyo', new Date('2025-01-15T12:00:00Z'));
  assert.equal(typeof diff, 'number');
  assert.ok(diff >= 8 && diff <= 10);
});

test('searchTimezones finds zones by city/region/country', () => {
  const cityResults = searchTimezones('tokyo');
  const regionResults = searchTimezones('europe');
  assert.ok(cityResults.some((item) => item.iana === 'Asia/Tokyo'));
  assert.ok(regionResults.length > 0);
});

test('calculateMeetingSlots returns sorted candidate slots', () => {
  const now = new Date('2025-01-15T12:00:00Z');
  const slots = calculateMeetingSlots(['UTC', 'Europe/London', 'Asia/Tokyo'], {
    startHour: 8,
    endHour: 18,
    durationMinutes: 60,
    lookAheadHours: 24,
    stepMinutes: 30,
  }, now);

  assert.ok(Array.isArray(slots));
  assert.ok(slots.length <= 5);
  if (slots.length > 1) {
    assert.ok(slots[0].score >= slots[1].score);
  }
});

test('zonedTimeToUtc converts date/time + source timezone to Date', () => {
  const result = zonedTimeToUtc('2025-01-01', '09:00', 'UTC');
  assert.equal(result.toISOString(), '2025-01-01T09:00:00.000Z');
});
