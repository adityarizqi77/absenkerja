(function (root) {
  'use strict';

  const BLOCK_MINUTES = 15;
  const DEFAULT_SETTINGS = Object.freeze({
    shiftStart: '08:00',
    shiftEnd: '16:00',
    normalWage: 100000,
    ratePerBlock: 3125
  });

  function timeToMinutes(time) {
    if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) return null;
    const [hours, minutes] = time.split(':').map(Number);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function toNumber(value) {
    return value === '' || value === null || value === undefined ? NaN : Number(value);
  }

  // Mengembalikan { ok, value } bila valid, atau { ok: false, error }.
  function validateSettings(raw = {}) {
    const value = {
      shiftStart: String(raw.shiftStart ?? ''),
      shiftEnd: String(raw.shiftEnd ?? ''),
      normalWage: toNumber(raw.normalWage),
      ratePerBlock: toNumber(raw.ratePerBlock)
    };
    const start = timeToMinutes(value.shiftStart);
    const end = timeToMinutes(value.shiftEnd);
    if (start === null || end === null) return { ok: false, error: 'Jam masuk dan jam selesai harus berformat JJ:MM.' };
    if (end <= start) return { ok: false, error: 'Jam selesai harus lebih besar dari jam masuk.' };
    if (![value.normalWage, value.ratePerBlock].every(n => Number.isFinite(n) && n >= 0)) {
      return { ok: false, error: 'Upah normal dan tarif per 15 menit harus berupa angka 0 atau lebih.' };
    }
    return { ok: true, value };
  }

  function calculatePay(checkIn, checkOut, settings = DEFAULT_SETTINGS) {
    const start = timeToMinutes(checkIn);
    const end = timeToMinutes(checkOut);
    const shiftStart = timeToMinutes(settings.shiftStart);
    const shiftEnd = timeToMinutes(settings.shiftEnd);
    if (start === null || end === null || end <= start) return null;
    const lateMinutes = Math.max(0, start - shiftStart);
    const lateBlocks = Math.ceil(lateMinutes / BLOCK_MINUTES);
    const overtimeBlocks = Math.floor(Math.max(0, end - shiftEnd) / BLOCK_MINUTES);
    const earlyMinutes = Math.max(0, shiftEnd - end);
    const earlyBlocks = Math.ceil(earlyMinutes / BLOCK_MINUTES);
    const lateDeduction = lateBlocks * settings.ratePerBlock;
    const earlyDeduction = earlyBlocks * settings.ratePerBlock;
    const overtimePay = overtimeBlocks * settings.ratePerBlock;
    return {
      workMinutes: end - start,
      lateMinutes,
      lateBlocks,
      lateDeduction,
      earlyMinutes,
      earlyBlocks,
      earlyDeduction,
      overtimeMinutes: overtimeBlocks * BLOCK_MINUTES,
      overtimePay,
      normalPay: settings.normalWage,
      totalPay: Math.max(0, settings.normalWage - lateDeduction - earlyDeduction + overtimePay)
    };
  }

  const api = { DEFAULT_SETTINGS, BLOCK_MINUTES, timeToMinutes, validateSettings, calculatePay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HadirCalc = api;
})(typeof self !== 'undefined' ? self : this);
