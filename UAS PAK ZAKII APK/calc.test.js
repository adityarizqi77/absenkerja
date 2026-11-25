'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePay, validateSettings, timeToMinutes, DEFAULT_SETTINGS } = require('./calc.js');

test('tepat waktu 08:00–16:00: upah normal penuh', () => {
  const p = calculatePay('08:00', '16:00');
  assert.equal(p.workMinutes, 480);
  assert.equal(p.lateBlocks, 0);
  assert.equal(p.overtimeMinutes, 0);
  assert.equal(p.totalPay, 100000);
});

test('keterlambatan dibulatkan ke atas per blok 15 menit', () => {
  assert.equal(calculatePay('08:01', '16:00').lateBlocks, 1);
  assert.equal(calculatePay('08:15', '16:00').lateBlocks, 1);
  assert.equal(calculatePay('08:16', '16:00').lateBlocks, 2);
  assert.equal(calculatePay('08:01', '16:00').totalPay, 96875);
  assert.equal(calculatePay('08:16', '16:00').lateDeduction, 6250);
});

test('lembur hanya dihitung per blok 15 menit penuh', () => {
  assert.equal(calculatePay('08:00', '16:14').overtimeMinutes, 0);
  assert.equal(calculatePay('08:00', '16:15').overtimeMinutes, 15);
  assert.equal(calculatePay('08:00', '16:29').overtimePay, 3125);
  assert.equal(calculatePay('08:00', '17:00').totalPay, 112500);
});

test('masuk lebih awal tidak menambah upah', () => {
  const p = calculatePay('07:50', '16:00');
  assert.equal(p.lateMinutes, 0);
  assert.equal(p.totalPay, 100000);
  assert.equal(p.workMinutes, 490);
});

test('terlambat dan lembur digabung', () => {
  // 08:20 → 2 blok (6.250); 17:00 → 4 blok (12.500)
  assert.equal(calculatePay('08:20', '17:00').totalPay, 106250);
});

test('total upah tidak pernah di bawah nol', () => {
  // masuk 12:00 → terlambat 4 jam = 16 blok × 10.000 = 160.000 > upah normal
  const p = calculatePay('12:00', '13:00', { ...DEFAULT_SETTINGS, ratePerBlock: 10000 });
  assert.equal(p.lateDeduction, 160000);
  assert.equal(p.totalPay, 0);
});

test('input tidak valid mengembalikan null', () => {
  assert.equal(calculatePay('', '16:00'), null);
  assert.equal(calculatePay('08:00', ''), null);
  assert.equal(calculatePay('8:00', '16:00'), null);
  assert.equal(calculatePay('25:00', '26:00'), null);
  assert.equal(calculatePay('16:00', '08:00'), null);
  assert.equal(calculatePay('08:00', '08:00'), null);
});

test('memakai pengaturan kustom', () => {
  const s = { shiftStart: '09:00', shiftEnd: '17:00', normalWage: 150000, ratePerBlock: 5000 };
  // terlambat 10 menit → 1 blok (−5.000); lembur 30 menit → 2 blok (+10.000)
  const p = calculatePay('09:10', '17:30', s);
  assert.equal(p.lateDeduction, 5000);
  assert.equal(p.overtimePay, 10000);
  assert.equal(p.totalPay, 155000);
  assert.equal(p.normalPay, 150000);
});

test('timeToMinutes', () => {
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('08:30'), 510);
  assert.equal(timeToMinutes('24:00'), null);
  assert.equal(timeToMinutes(null), null);
});

test('validateSettings menerima pengaturan valid dan mengubah angka teks', () => {
  const r = validateSettings({ shiftStart: '08:00', shiftEnd: '16:00', normalWage: '120000', ratePerBlock: '4000' });
  assert.equal(r.ok, true);
  assert.equal(r.value.normalWage, 120000);
  assert.equal(r.value.ratePerBlock, 4000);
  assert.equal(validateSettings(DEFAULT_SETTINGS).ok, true);
});

test('validateSettings menolak jam dan angka tidak valid', () => {
  assert.equal(validateSettings({ ...DEFAULT_SETTINGS, shiftEnd: '07:00' }).ok, false);
  assert.equal(validateSettings({ ...DEFAULT_SETTINGS, shiftStart: 'abc' }).ok, false);
  assert.equal(validateSettings({ ...DEFAULT_SETTINGS, normalWage: -1 }).ok, false);
  assert.equal(validateSettings({ ...DEFAULT_SETTINGS, ratePerBlock: '' }).ok, false);
  assert.equal(validateSettings({ ...DEFAULT_SETTINGS, normalWage: 'x' }).ok, false);
  assert.equal(validateSettings({}).ok, false);
});
