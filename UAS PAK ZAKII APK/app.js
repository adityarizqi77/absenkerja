import * as DB from './db.js';

(() => {
  'use strict';

  const Calc = window.HadirCalc;
  const STATUS_LABELS = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', cuti: 'Cuti', alpha: 'Alpha' };
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  let toastTimer;
  let state = { user: null, view: 'dashboard', month: monthKey(new Date()), search: '', division: 'Semua divisi', modal: null };

  function dateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  function monthKey(date) { return dateKey(date).slice(0, 7); }
  function timeNowWib(date = new Date()) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  }
  function formatDate(key, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
    const date = new Date(`${key}T12:00:00+07:00`);
    return new Intl.DateTimeFormat('id-ID', { ...options, timeZone: 'Asia/Jakarta' }).format(date);
  }
  function formatMoney(value, decimals = 0) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value || 0);
  }
  function calculatePay(checkIn, checkOut) { return Calc.calculatePay(checkIn, checkOut, data.settings); }
  function isPresent(record) { return !record.status || record.status === 'hadir'; }
  function lastAudit(record) { return (record.audit || []).slice(-1)[0]; }
  function clockNowWib(date = new Date()) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(date);
  }
  function dateDaysAgo(days) {
    const date = new Date(`${dateKey()}T12:00:00+07:00`);
    date.setUTCDate(date.getUTCDate() - days);
    return dateKey(date);
  }
  function last30DaysRecords(employeeId = null) {
    const start = dateDaysAgo(29);
    const today = dateKey();
    return data.records.filter(record => record.date >= start && record.date <= today && (!employeeId || record.employeeId === employeeId));
  }
  function formatDuration(minutes) {
    if (minutes === null || minutes === undefined) return '—';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}j ${String(mins).padStart(2, '0')}m`;
  }
  function initials(name = '') { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase(); }
  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  let data = { employees: [], records: [], settings: { ...Calc.DEFAULT_SETTINGS } };
  async function refresh() {
    const loaded = await DB.loadAll();
    const cfg = Calc.validateSettings({ ...Calc.DEFAULT_SETTINGS, ...loaded.settings });
    data = { employees: loaded.employees, records: loaded.records, settings: cfg.ok ? cfg.value : { ...Calc.DEFAULT_SETTINGS } };
    return loaded;
  }
  function friendly(error) {
    if (error.code === '23505') {
      if (String(error.message).includes('nik')) return 'NIK sudah digunakan.';
      if (String(error.message).includes('email')) return 'Email sudah digunakan.';
      return 'Karyawan ini sudah punya catatan di tanggal tersebut. Gunakan Koreksi.';
    }
    return error.message || 'Terjadi kesalahan.';
  }
  function employeeFor(id) { return data.employees.find(employee => employee.id === id); }
  function todayRecord(employeeId) { return data.records.find(record => record.employeeId === employeeId && record.date === dateKey()); }
  function selectedEmployeeRecords() {
    return data.records.filter(record => state.user.role === 'admin' || record.employeeId === state.user.employeeId);
  }
  function recordDetails(record) { return isPresent(record) && record.checkOut ? calculatePay(record.checkIn, record.checkOut) : null; }
  function statusLabel(record) {
    if (!isPresent(record)) return `<span class="status neutral">${STATUS_LABELS[record.status]}</span>`;
    if (!record.checkIn) return '<span class="status neutral">Belum masuk</span>';
    if (!record.checkOut) return '<span class="status pending">Belum pulang</span>';
    return '<span class="status">Selesai</span>';
  }
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
  }
  function navItems() {
    return state.user.role === 'admin'
      ? [['dashboard', '◫', 'Ringkasan'], ['attendance', '◷', 'Absensi'], ['employees', '♙', 'Karyawan'], ['reports', '▤', 'Rekap'], ['settings', '⚙', 'Pengaturan']]
      : [['dashboard', '◫', 'Beranda'], ['history', '◷', 'Riwayat']];
  }
  function navMarkup(mobile = false) {
    return `<nav class="${mobile ? 'mobile-nav' : 'side-nav'}" aria-label="Navigasi utama">${navItems().map(([view, symbol, label]) => `<button type="button" class="nav-link ${state.view === view ? 'active' : ''}" data-action="navigate" data-view="${view}"><span class="nav-symbol" aria-hidden="true">${symbol}</span><span>${label}</span></button>`).join('')}</nav>`;
  }
  function pageTitle() {
    return ({ dashboard: state.user.role === 'admin' ? 'Ringkasan hari ini' : 'Beranda', attendance: 'Data absensi', employees: 'Data karyawan', reports: 'Rekap upah', settings: 'Pengaturan', history: 'Riwayat absensi' })[state.view] || 'Ringkasan';
  }
  function shell(content) {
    const user = state.user;
    const roleTitle = user.role === 'admin' ? 'Admin / HR' : 'Karyawan';
    return `<div class="app-shell">
      <aside class="sidebar">
        <div class="nav-caption">Menu utama</div>${navMarkup()}
        <div class="sidebar-bottom"><div class="sidebar-note"></div>
          <div class="user-chip"><span class="avatar">${escapeHtml(initials(user.name))}</span><span class="user-meta"><strong>${escapeHtml(user.name)}</strong><small>${roleTitle}</small></span><button class="logout" type="button" data-action="logout" title="Keluar" aria-label="Keluar">Keluar</button></div>
        </div>
      </aside>
      <section class="main-area">
        <header class="topbar"><div class="breadcrumb">${escapeHtml(pageTitle())}</div><div class="topbar-right"><span class="today-label">${escapeHtml(formatDate(dateKey(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · WIB</span></div></header>
        <main class="page-wrap">${content}</main>
      </section>${navMarkup(true)}${state.modal ? modalMarkup() : ''}
    </div>`;
  }
  function loginMarkup() {
    return `<div class="login-page">
      <section class="login-art">
        <div class="login-art-copy"><p class="eyebrow"></p><h1>Selamat bekerja, Utamakan Keselamatan dan Kesehatan Kerja</h1><p></p></div>
        <div class="login-art-foot"><span>Absensi &amp; upah karyawan</span><span>WIB · Asia/Jakarta</span></div>
      </section>
      <section class="login-panel"><div class="login-box"><p class="eyebrow" style="color:var(--forest)">Selamat datang</p><h2>Masuk ke Hadir</h2><p class="intro"></p>
        <form id="login-form"><div class="field"><label for="username">Email</label><input id="username" name="username" type="email" autocomplete="username" placeholder="nama@perusahaan.com" required></div>
        <div class="field"><label for="password">Kata sandi</label><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Masukkan kata sandi" required></div>
        <button class="btn btn-primary btn-full" type="submit"><span aria-hidden="true">Masuk→</span></button></form>
        <div class="demo-hint">Masuk dengan email dan kata sandi akun anda. Hubungi Admin/HR bila ada kendala pada proses login atau belum punya akun.</div>
      </div></section>
    </div>`;
  }
  function metricCard(label, value, note, symbol) {
    return `<article class="metric"><div class="metric-top"><span>${label}</span><span class="metric-mark" aria-hidden="true">${symbol}</span></div><strong>${value}</strong><small>${note}</small></article>`;
  }
  function employeeTableRows(records, includeActions = false) {
    if (!records.length) return `<tr><td colspan="${includeActions ? 7 : 6}"><div class="empty-state"><strong>Belum ada catatan</strong>Belum ada data yang sesuai dengan pilihan ini.</div></td></tr>`;
    return records.map(record => {
      const employee = employeeFor(record.employeeId) || { name: 'Karyawan dihapus', id: '—', division: '—' };
      const pay = recordDetails(record);
      return `<tr><td>${escapeHtml(formatDate(record.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</td><td><span class="person-cell"><span class="person-mini">${escapeHtml(initials(employee.name))}</span><span><strong>${escapeHtml(employee.name)}</strong><br><span style="color:var(--muted)">${escapeHtml(employee.id)}</span></span></span></td><td>${escapeHtml(employee.division)}</td><td>${escapeHtml(record.checkIn || '—')}</td><td>${escapeHtml(record.checkOut || '—')}</td><td>${pay ? formatDuration(pay.workMinutes) : '—'}</td><td>${pay ? formatMoney(pay.totalPay) : statusLabel(record)}</td>${includeActions ? `<td><button class="action-link" type="button" data-action="correct" data-id="${escapeHtml(record.id)}">Koreksi</button></td>` : ''}</tr>`;
    }).join('');
  }
  function pageHeading(title, subtitle, actions = '') {
    return `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div>${actions ? `<div class="head-actions">${actions}</div>` : ''}</div>`;
  }
  function adminDashboard() {
    const today = dateKey();
    const activeEmployees = data.employees.filter(person => person.active);
    const todayRecords = data.records.filter(record => record.date === today);
    const pending = todayRecords.filter(record => record.checkIn && !record.checkOut).length;
    const completed = todayRecords.filter(record => record.checkOut);
    const paid = completed.reduce((sum, record) => sum + recordDetails(record).totalPay, 0);
    const rows = [...todayRecords].sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));
    return `${pageHeading('Ringkasan hari ini', 'Pantau kehadiran dan upah karyawan untuk hari ini.', `<button class="btn btn-soft" data-action="navigate" data-view="attendance">Lihat semua absensi →</button>`)}
      <div class="metrics">${metricCard('Karyawan aktif', activeEmployees.length, 'Dalam data karyawan', '♙')}${metricCard('Sudah masuk', todayRecords.filter(r => r.checkIn).length, `Dari ${activeEmployees.length} karyawan aktif`, '↗')}${metricCard('Belum pulang', pending, 'Menunggu absen pulang', '◷')}${metricCard('Total upah hari ini', formatMoney(paid), 'Untuk absensi yang selesai', 'Rp')}</div>
      <section class="panel"><div class="panel-head"><div><h2>Aktivitas hari ini</h2><p>${escapeHtml(formatDate(today))} · WIB</p></div><button class="action-link" data-action="navigate" data-view="attendance">Buka data absensi</button></div><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Karyawan</th><th>Divisi</th><th>Masuk</th><th>Pulang</th><th>Durasi</th><th>Upah / status</th></tr></thead><tbody>${employeeTableRows(rows)}</tbody></table></div></section>`;
  }
  function employeeDashboard() {
    const person = employeeFor(state.user.employeeId);
    const record = todayRecord(person.id);
    const pay = record ? recordDetails(record) : null;
    const off = record && !isPresent(record);
    const canCheckIn = !record;
    const canCheckOut = record && !off && !record.checkOut;
    const actionLabel = canCheckIn ? 'Absen masuk' : canCheckOut ? 'Absen pulang' : off ? `Tercatat: ${STATUS_LABELS[record.status]}` : 'Absensi hari ini selesai';
    const action = canCheckIn || canCheckOut ? `<button class="btn btn-lime" data-action="punch" data-kind="${canCheckIn ? 'in' : 'out'}">${actionLabel} →</button>` : `<span class="btn btn-lime">${actionLabel}</span>`;
    const recent = selectedEmployeeRecords().sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5);
    const periodRecords = last30DaysRecords(person.id);
    const completedPeriod = periodRecords.filter(item => item.checkOut).map(recordDetails);
    const presentDays = periodRecords.filter(isPresent).length;
    const totalWork = completedPeriod.reduce((sum, item) => sum + item.workMinutes, 0);
    const totalOvertime = completedPeriod.reduce((sum, item) => sum + item.overtimeMinutes, 0);
    const totalWage = completedPeriod.reduce((sum, item) => sum + item.totalPay, 0);
    return `${pageHeading(`Selamat datang, ${escapeHtml(person.name.split(' ')[0])}`, 'Ringkasan kehadiran dan upah Anda.', `<button class="btn btn-soft" data-action="navigate" data-view="history">Lihat riwayat →</button>`)}
      <div class="metrics employee-period-metrics">${metricCard('Divisi', escapeHtml(person.division), 'Divisi karyawan', '▦')}${metricCard('Hari hadir', `${presentDays} hari`, '30 hari terakhir', '✓')}${metricCard('Total kerja', formatDuration(totalWork), '30 hari terakhir', '◷')}${metricCard('Total lembur', `${totalOvertime} menit`, '30 hari terakhir', '↗')}${metricCard('Total upah', formatMoney(totalWage), '30 hari terakhir', 'Rp')}</div>
      <div class="grid-main"><section class="panel"><div class="panel-head"><div><h2>Absensi hari ini</h2><p>${escapeHtml(formatDate(dateKey(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p></div>${record ? statusLabel(record) : '<span class="status neutral">Belum masuk</span>'}</div><div class="panel-body"><div class="attendance-hero"><span class="attendance-kicker">${off ? 'Tidak hadir hari ini' : record ? record.checkOut ? 'Hari kerja selesai' : 'Jangan lupa absen pulang' : 'Mulai hari kerja'}</span><h2>${off ? `Hari ini tercatat: ${STATUS_LABELS[record.status]}.` : record ? record.checkOut ? 'Terima kasih, kerja hari ini selesai.' : 'Semoga harimu lancar.' : 'Selamat bekerja hari ini.'}</h2><p>Waktu tercatat mengikuti WIB · Asia/Jakarta</p><div class="clock-line"><span class="clock" id="live-clock">${escapeHtml(clockNowWib())} WIB</span>${action}</div></div><div class="checkpoints"><div class="checkpoint"><small>Jam masuk</small><strong>${escapeHtml(record?.checkIn || 'Belum tercatat')}</strong></div><div class="checkpoint"><small>Jam pulang</small><strong>${escapeHtml(record?.checkOut || 'Belum tercatat')}</strong></div></div></div></section>
      <section class="panel"><div class="panel-head"><div><h2>Ringkasan upah</h2><p>${record?.checkOut ? 'Perhitungan hari ini' : 'Dihitung setelah absen pulang'}</p></div></div><div class="panel-body"><div class="wage-summary"><div class="wage-total"><small>Total upah hari ini</small><strong>${pay ? formatMoney(pay.totalPay) : '—'}</strong></div><div class="wage-line"><span>Durasi kerja</span><strong>${pay ? formatDuration(pay.workMinutes) : '—'}</strong></div><div class="wage-line"><span>Upah normal</span><strong>${pay ? formatMoney(pay.normalPay) : '—'}</strong></div><div class="wage-line"><span>Lembur</span><strong>${pay ? `${pay.overtimeMinutes} menit` : '—'}</strong></div><div class="wage-line"><span>Upah lembur</span><strong>${pay ? formatMoney(pay.overtimePay) : '—'}</strong></div><div class="wage-line"><span>Potongan terlambat</span><strong>${pay ? formatMoney(pay.lateDeduction) : '—'}</strong></div><div class="wage-line"><span>Potongan pulang cepat</span><strong>${pay ? formatMoney(pay.earlyDeduction) : '—'}</strong></div></div></div></section></div>
      <section class="panel" style="margin-top:16px"><div class="panel-head"><div><h2>Riwayat terbaru</h2><p>Catatan absensi Anda</p></div><button class="action-link" data-action="navigate" data-view="history">Semua riwayat →</button></div><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Karyawan</th><th>Divisi</th><th>Masuk</th><th>Pulang</th><th>Durasi</th><th>Upah / status</th></tr></thead><tbody>${employeeTableRows(recent)}</tbody></table></div></section>`;
  }
  function attendancePage() {
    const filtered = data.records.filter(record => {
      const employee = employeeFor(record.employeeId);
      const query = state.search.toLowerCase();
      return record.date.startsWith(state.month) && (!query || `${employee?.name || ''} ${employee?.nik || ''} ${employee?.id || ''}`.toLowerCase().includes(query));
    }).sort((a,b) => b.date.localeCompare(a.date) || (a.checkIn || '').localeCompare(b.checkIn || ''));
    const tools = `<div class="toolbar"><input class="search-input" data-filter="search" value="${escapeHtml(state.search)}" placeholder="Cari karyawan atau NIK…" aria-label="Cari karyawan"><input type="month" data-filter="month" value="${escapeHtml(state.month)}" aria-label="Pilih bulan"></div>`;
    return `${pageHeading('Data absensi', 'Catatan masuk, pulang, durasi kerja, dan upah karyawan.', `<button class="btn btn-primary" data-action="add-manual">+ Tambah absensi</button><button class="btn btn-soft" data-action="export">Unduh CSV</button><button class="btn btn-primary" data-action="print">Cetak rekap</button>`)}
      <section class="panel"><div class="panel-head"><div><h2>Semua catatan</h2><p>${filtered.length} catatan pada periode terpilih</p></div>${tools}</div><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Karyawan</th><th>Divisi</th><th>Masuk</th><th>Pulang</th><th>Durasi</th><th>Upah / status</th><th>Aksi</th></tr></thead><tbody>${employeeTableRows(filtered, true)}</tbody></table></div><div class="table-foot"><span>Waktu ditampilkan dalam WIB</span><span>${filtered.length} catatan</span></div></section>
      <p class="page-note">Koreksi jam absensi memerlukan alasan. Jejak perubahan tersimpan di database.</p>`;
  }
  function employeesPage() {
    const query = state.search.toLowerCase();
    const people = data.employees.filter(person => !query || `${person.name} ${person.nik} ${person.id} ${person.division}`.toLowerCase().includes(query));
    const cards = people.map(person => `<article class="employee-card"><div class="employee-card-top"><span class="avatar">${escapeHtml(initials(person.name))}</span><span class="status ${person.active ? '' : 'inactive'}">${person.active ? 'Aktif' : 'Nonaktif'}</span></div><h3>${escapeHtml(person.name)}</h3><p>${escapeHtml(person.job)} · ${escapeHtml(person.division)}</p><div class="employee-meta"><span>${escapeHtml(person.id)}</span><span>NIK ${escapeHtml(person.nik)}</span></div><div class="employee-meta"><span>${escapeHtml(person.username)}</span><button class="action-link" data-action="edit-employee" data-id="${escapeHtml(person.id)}">Ubah data</button></div></article>`).join('');
    return `${pageHeading('Data karyawan', 'Kelola informasi dan status karyawan.', `<button class="btn btn-primary" data-action="add-employee">+ Tambah karyawan</button>`)}
      <div class="toolbar" style="margin-bottom:15px"><input class="search-input" data-filter="search" value="${escapeHtml(state.search)}" placeholder="Cari nama, NIK, divisi…" aria-label="Cari karyawan"></div>
      ${people.length ? `<div class="employee-grid">${cards}</div>` : `<section class="panel"><div class="empty-state"><strong>Karyawan tidak ditemukan</strong>Coba kata pencarian lain.</div></section>`}
      <p class="page-note">Password ditentukan Admin saat menambah karyawan. Karyawan masuk dengan email dan password tersebut; Admin dapat mengganti password lewat "Ubah data".</p>`;
  }
  function reportPage() {
    const divisions = [...new Set(data.employees.map(employee => employee.division))].sort();
    const periodRecords = last30DaysRecords();
    const rows = data.employees.filter(employee => employee.active && (state.division === 'Semua divisi' || employee.division === state.division)).map(employee => {
      const records = periodRecords.filter(record => record.employeeId === employee.id);
      const completed = records.filter(record => record.checkOut).map(recordDetails);
      const work = completed.reduce((sum, item) => sum + item.workMinutes, 0);
      const overtime = completed.reduce((sum, item) => sum + item.overtimeMinutes, 0);
      const pay = completed.reduce((sum, item) => sum + item.totalPay, 0);
      return { employee, days: records.filter(isPresent).length, work, overtime, pay };
    });
    const totalPay = rows.reduce((sum, row) => sum + row.pay, 0);
    const totalDays = rows.reduce((sum, row) => sum + row.days, 0);
    const totalWork = rows.reduce((sum, row) => sum + row.work, 0);
    const totalOvertime = rows.reduce((sum, row) => sum + row.overtime, 0);
    const tableRows = rows.length ? rows.map(row => `<tr><td><span class="person-cell"><span class="person-mini">${escapeHtml(initials(row.employee.name))}</span><span><strong>${escapeHtml(row.employee.name)}</strong><br><span style="color:var(--muted)">${escapeHtml(row.employee.id)}</span></span></span></td><td>${escapeHtml(row.employee.division)}</td><td>${row.days} hari</td><td>${formatDuration(row.work)}</td><td>${row.overtime} menit</td><td><strong>${formatMoney(row.pay)}</strong></td></tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><strong>Belum ada data rekap</strong>Belum ada catatan dalam 30 hari terakhir.</div></td></tr>`;
    const tools = `<div class="toolbar"><select data-filter="division" aria-label="Pilih divisi"><option>Semua divisi</option>${divisions.map(div => `<option ${div === state.division ? 'selected' : ''}>${escapeHtml(div)}</option>`).join('')}</select></div>`;
    return `${pageHeading('Rekap absensi & upah', 'Ringkasan kehadiran setiap karyawan selama 30 hari terakhir.', `<button class="btn btn-soft" data-action="export-report">Unduh CSV</button><button class="btn btn-primary" data-action="print">Cetak rekap</button>`)}
      <section class="panel"><div class="panel-head"><div><h2>Rekap per karyawan</h2><p>${escapeHtml(formatDate(dateDaysAgo(29), { day: 'numeric', month: 'short' }))} – ${escapeHtml(formatDate(dateKey(), { day: 'numeric', month: 'short', year: 'numeric' }))}</p></div>${tools}</div><div class="table-wrap"><table><thead><tr><th>Karyawan</th><th>Divisi</th><th>Hari hadir</th><th>Total kerja</th><th>Total lembur</th><th>Total upah</th></tr></thead><tbody>${tableRows}</tbody></table></div><div class="report-total"><span>${totalDays} hari hadir · ${formatDuration(totalWork)} kerja · ${totalOvertime} menit lembur</span><strong>Total ${formatMoney(totalPay)}</strong></div></section>
      <p class="page-note">Periode mencakup 30 hari kalender terakhir, termasuk hari ini. Upah dihitung untuk catatan yang sudah memiliki jam pulang.</p>`;
  }
  function settingsPage() {
    const cfg = data.settings;
    const field = (id, label, type, value, extra = '') => `<div class="field"><label for="set-${id}">${label}</label><input id="set-${id}" name="${id}" type="${type}" value="${escapeHtml(value)}" ${extra} required></div>`;
    return `${pageHeading('Pengaturan aturan upah', 'Atur jam kerja dan tarif potongan serta lembur.', '<button class="btn btn-soft" data-action="reset-settings">Kembalikan default</button>')}
      <section class="panel"><div class="panel-head"><div><h2>Aturan upah</h2><p>Keterlambatan dan pulang lebih awal dipotong per 15 menit (dibulatkan ke atas); lembur dihitung per 15 menit penuh.</p></div></div>
      <form id="settings-form" class="modal-content"><div class="form-grid">${field('shiftStart', 'Jam masuk normal', 'time', cfg.shiftStart)}${field('shiftEnd', 'Jam selesai normal', 'time', cfg.shiftEnd)}${field('normalWage', 'Upah normal per hari (Rp)', 'number', cfg.normalWage, 'min="0" step="1"')}${field('ratePerBlock', 'Tarif per 15 menit (Rp)', 'number', cfg.ratePerBlock, 'min="0" step="1"')}</div>
      <div class="modal-actions"><button class="btn btn-primary" type="submit">Simpan pengaturan</button></div></form></section>
      <p class="page-note">Perubahan berlaku untuk semua perhitungan, termasuk riwayat yang sudah ada. Status izin, sakit, cuti, dan alpha dihitung Rp0.</p>`;
  }
  function historyPage() {
    const records = selectedEmployeeRecords().filter(record => record.date.startsWith(state.month)).sort((a,b) => b.date.localeCompare(a.date));
    const total = records.filter(record => record.checkOut).reduce((sum, record) => sum + recordDetails(record).totalPay, 0);
    const tools = `<div class="toolbar"><input type="month" data-filter="month" value="${escapeHtml(state.month)}" aria-label="Pilih bulan"></div>`;
    return `${pageHeading('Riwayat absensi', 'Lihat catatan kehadiran dan total upah berdasarkan bulan.', '')}
      <section class="panel"><div class="panel-head"><div><h2>Riwayat saya</h2><p>${records.length} catatan pada periode terpilih</p></div>${tools}</div><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Karyawan</th><th>Divisi</th><th>Masuk</th><th>Pulang</th><th>Durasi</th><th>Upah / status</th></tr></thead><tbody>${employeeTableRows(records)}</tbody></table></div><div class="report-total"><span>Total upah periode</span><strong>${formatMoney(total)}</strong></div></section>`;
  }
  function recordFields(rec = {}) {
    const status = rec.status || 'hadir';
    const disabled = status === 'hadir' ? '' : 'disabled';
    return `<div class="form-grid"><div class="field"><label for="rec-status">Status</label><select id="rec-status" name="status">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${key === status ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field"><label for="rec-in">Jam masuk</label><input id="rec-in" name="checkIn" type="time" value="${escapeHtml(rec.checkIn || '')}" ${disabled}></div>
      <div class="field"><label for="rec-out">Jam pulang (boleh kosong)</label><input id="rec-out" name="checkOut" type="time" value="${escapeHtml(rec.checkOut || '')}" ${disabled}></div></div>
      <div class="field"><label for="rec-reason">Alasan</label><input id="rec-reason" name="reason" maxlength="240" placeholder="Contoh: karyawan lupa absen pulang" required></div>`;
  }
  function auditMarkup(record) {
    const list = (record.audit || []).slice().reverse();
    if (!list.length) return '<div class="demo-hint">Belum ada riwayat perubahan untuk catatan ini.</div>';
    const fmt = item => item ? `${STATUS_LABELS[item.status || 'hadir']} ${item.checkIn || '—'}–${item.checkOut || '—'}` : '—';
    return `<div class="demo-hint"><strong>Riwayat perubahan</strong><br>${list.map(entry => `${escapeHtml(entry.at ? new Date(entry.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '—')} · ${escapeHtml(entry.by)} · ${escapeHtml(entry.action)}: ${escapeHtml(fmt(entry.before))} → ${escapeHtml(fmt(entry.after))} (${escapeHtml(entry.reason)})`).join('<br>')}</div>`;
  }
  function modalShell(title, subtitle, formId, body, submitLabel) {
    return `<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">×</button></div><form id="${formId}" class="modal-content">${body}<div class="modal-actions"><button class="btn btn-soft" type="button" data-action="close-modal">Batal</button><button class="btn btn-primary" type="submit">${submitLabel}</button></div></form></section></div>`;
  }
  function modalMarkup() {
    if (state.modal.type === 'employee') {
      const person = state.modal.id ? employeeFor(state.modal.id) : null;
      return `<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">${person ? 'Ubah data karyawan' : 'Tambah karyawan'}</h2><p>Lengkapi identitas dan status karyawan.</p></div><button class="modal-close" data-action="close-modal" aria-label="Tutup">×</button></div><form id="employee-form" class="modal-content"><input type="hidden" name="id" value="${escapeHtml(person?.id || '')}"><div class="form-grid">
        <div class="field"><label for="emp-nik">NIK</label><input id="emp-nik" name="nik" value="${escapeHtml(person?.nik || '')}" required></div>
        <div class="field"><label for="emp-name">Nama lengkap</label><input id="emp-name" name="name" value="${escapeHtml(person?.name || '')}" required></div>
        <div class="field"><label for="emp-job">Jabatan</label><input id="emp-job" name="job" value="${escapeHtml(person?.job || '')}" required></div>
        <div class="field"><label for="emp-division">Divisi</label><input id="emp-division" name="division" value="${escapeHtml(person?.division || '')}" required></div>
        <div class="field"><label for="emp-username">Email login</label><input id="emp-username" name="username" type="email" value="${escapeHtml(person?.username || '')}" ${person ? 'readonly' : ''} required></div>
        <div class="field"><label for="emp-password">${person ? 'Password baru (kosongkan bila tidak diubah)' : 'Password login'}</label><input id="emp-password" name="password" type="password" minlength="8" autocomplete="new-password" ${person ? '' : 'required'}></div>
        <div class="field"><label for="emp-active">Status akun</label><select id="emp-active" name="active"><option value="true" ${person?.active !== false ? 'selected' : ''}>Aktif</option><option value="false" ${person?.active === false ? 'selected' : ''}>Nonaktif</option></select></div>
        </div><div class="modal-actions"><button class="btn btn-soft" type="button" data-action="close-modal">Batal</button><button class="btn btn-primary" type="submit">Simpan karyawan</button></div></form></section></div>`;
    }
    if (state.modal.type === 'manual') {
      const options = data.employees.filter(person => person.active).map(person => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)} (${escapeHtml(person.id)})</option>`).join('');
      return modalShell('Tambah absensi manual', 'Untuk karyawan yang belum punya catatan pada tanggal tersebut.', 'manual-form', `<div class="form-grid"><div class="field"><label for="man-emp">Karyawan</label><select id="man-emp" name="employeeId" required>${options}</select></div><div class="field"><label for="man-date">Tanggal</label><input id="man-date" name="date" type="date" value="${dateKey()}" max="${dateKey()}" required></div></div>${recordFields()}`, 'Simpan absensi');
    }
    const record = data.records.find(item => item.id === state.modal.id);
    if (!record) return '';
    const person = employeeFor(record.employeeId);
    return modalShell('Koreksi absensi', `${escapeHtml(person?.name || '')} · ${escapeHtml(formatDate(record.date))}`, 'correction-form', `<input type="hidden" name="id" value="${escapeHtml(record.id)}">${recordFields(record)}${auditMarkup(record)}`, 'Simpan koreksi');
  }
  function render() {
    if (!state.user) { app.innerHTML = loginMarkup(); return; }
    const content = state.view === 'dashboard' ? (state.user.role === 'admin' ? adminDashboard() : employeeDashboard())
      : state.view === 'attendance' && state.user.role === 'admin' ? attendancePage()
      : state.view === 'employees' && state.user.role === 'admin' ? employeesPage()
      : state.view === 'reports' && state.user.role === 'admin' ? reportPage()
      : state.view === 'settings' && state.user.role === 'admin' ? settingsPage()
      : state.view === 'history' && state.user.role === 'employee' ? historyPage()
      : adminDashboard();
    app.innerHTML = shell(content);
  }
  async function startSession(user) {
    const loaded = await refresh();
    if (loaded.isAdmin) state.user = { role: 'admin', name: 'Admin HR' };
    else {
      const me = data.employees.find(person => person.userId === user.id);
      if (!me || !me.active) { await DB.signOut(); state.user = null; render(); return showToast('Akun ini belum terdaftar sebagai karyawan aktif.'); }
      state.user = { role: 'employee', name: me.name, employeeId: me.id };
    }
    state.view = 'dashboard';
    render();
  }
  async function login(email, password) {
    try { await startSession(await DB.signIn(email.trim(), password)); }
    catch (error) { showToast('Login gagal: ' + error.message); }
  }
  async function init() {
    const user = await DB.currentUser();
    if (user) await startSession(user); else render();
  }
  async function punch(kind) {
    try {
      await DB.punch(kind); // waktu dicatat oleh server (WIB), bukan jam browser
      await refresh(); render();
      showToast(kind === 'in' ? 'Absen masuk tercatat (waktu server, WIB).' : 'Absen pulang tercatat. Ringkasan upah sudah diperbarui.');
    } catch (error) { showToast(error.message); }
  }
  function escapeCsv(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
  function downloadCsv(rows, filename, headers, rowValues) {
    const csv = '\uFEFF' + [headers, ...rows.map(rowValues)].map(row => row.map(escapeCsv).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('File CSV berhasil diunduh.');
  }
  function exportAttendance() {
    const records = data.records.filter(record => record.date.startsWith(state.month)).sort((a,b) => a.date.localeCompare(b.date));
    downloadCsv(records, `absensi-${state.month}.csv`, ['Tanggal','ID Karyawan','Nama','Divisi','Jam Masuk','Jam Pulang','Status','Durasi Menit','Terlambat Menit','Potongan Terlambat','Pulang Cepat Menit','Potongan Pulang Cepat','Lembur Menit','Upah Normal','Upah Lembur','Total Upah','Alasan Koreksi'], record => {
      const person = employeeFor(record.employeeId) || {};
      const pay = recordDetails(record);
      return [record.date, person.id, person.name, person.division, record.checkIn, record.checkOut, STATUS_LABELS[record.status || 'hadir'], pay?.workMinutes ?? '', pay?.lateMinutes ?? '', pay?.lateDeduction ?? '', pay?.earlyMinutes ?? '', pay?.earlyDeduction ?? '', pay?.overtimeMinutes ?? '', pay?.normalPay ?? '', pay?.overtimePay ?? '', pay?.totalPay ?? '', lastAudit(record)?.reason || ''];
    });
  }
  function exportReport() {
    const employees = data.employees.filter(person => person.active && (state.division === 'Semua divisi' || person.division === state.division));
    const rows = employees.map(employee => {
      const records = last30DaysRecords(employee.id);
      const pays = records.filter(record => record.checkOut).map(recordDetails);
      return [employee.id, employee.name, employee.division, records.filter(isPresent).length, pays.reduce((sum,pay) => sum + pay.workMinutes,0), pays.reduce((sum,pay) => sum + pay.overtimeMinutes,0), pays.reduce((sum,pay) => sum + pay.totalPay,0)];
    });
    downloadCsv(rows, `rekap-upah-30-hari-${dateKey()}.csv`, ['ID Karyawan','Nama','Divisi','Hari Hadir','Total Menit Kerja','Total Menit Lembur','Total Upah'], row => row);
  }
  app.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target;
    const formId = form.getAttribute('id'); // form.id bisa tertimpa input bernama "id"
    const values = Object.fromEntries(new FormData(form).entries());
    if (formId === 'login-form') return login(values.username || '', values.password || '');
    try {
      if (formId === 'employee-form') {
        const editing = Boolean(values.id);
        const password = values.password || '';
        if (password && password.length < 8) return showToast('Password minimal 8 karakter.');
        const item = { id: values.id || `EMP-${String(Date.now()).slice(-6)}`, nik: values.nik.trim(), name: values.name.trim(), job: values.job.trim(), division: values.division.trim(), email: values.username.trim().toLowerCase(), active: values.active === 'true' };
        if (editing) { await DB.saveEmployee(item, true); if (password) await DB.setEmployeePassword(item.id, password); }
        else await DB.createEmployee(item, password); // buat akun login + data karyawan (Edge Function)
        await refresh(); state.modal = null; render();
        showToast(editing ? (password ? 'Data dan password karyawan diperbarui.' : 'Data karyawan diperbarui.') : 'Karyawan dan akun login berhasil dibuat.');
      } else if (formId === 'correction-form' || formId === 'manual-form') {
        const manual = formId === 'manual-form';
        // Validasi lengkap (alasan, jam, tanggal, duplikat) dilakukan server di fungsi save_attendance()
        await DB.saveAttendance({ id: manual ? null : values.id, employeeId: values.employeeId, date: values.date, status: values.status || 'hadir', checkIn: values.checkIn, checkOut: values.checkOut, reason: (values.reason || '').trim() });
        await refresh(); state.modal = null; render();
        showToast(manual ? 'Absensi manual tersimpan.' : 'Koreksi dan jejak perubahan berhasil disimpan.');
      } else if (formId === 'settings-form') {
        const result = Calc.validateSettings(values);
        if (!result.ok) return showToast(result.error);
        await DB.saveSettings(result.value); await refresh(); render();
        showToast('Pengaturan disimpan. Perhitungan upah diperbarui.');
      }
    } catch (error) { showToast(friendly(error)); }
  });
  app.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, view, id, kind } = target.dataset;
    if (action === 'navigate') { state.view = view; state.search = ''; render(); }
    if (action === 'logout') { DB.signOut(); state.user = null; state.modal = null; state.view = 'dashboard'; render(); }
    if (action === 'punch') punch(kind);
    if (action === 'add-employee') { state.modal = { type: 'employee' }; render(); }
    if (action === 'edit-employee') { state.modal = { type: 'employee', id }; render(); }
    if (action === 'correct') { state.modal = { type: 'correction', id }; render(); }
    if (action === 'add-manual') { state.modal = { type: 'manual' }; render(); }
    if (action === 'reset-settings') DB.saveSettings({ ...Calc.DEFAULT_SETTINGS }).then(refresh).then(() => { render(); showToast('Pengaturan dikembalikan ke default.'); }).catch(error => showToast(friendly(error)));
    if (action === 'close-modal') { state.modal = null; render(); }
    if (action === 'backdrop' && event.target === target) { state.modal = null; render(); }
    if (action === 'export') exportAttendance();
    if (action === 'export-report') exportReport();
    if (action === 'print') window.print();
  });
  app.addEventListener('input', event => {
    const { filter } = event.target.dataset;
    if (filter === 'search') {
      const start = event.target.selectionStart;
      state.search = event.target.value;
      render();
      const replacement = app.querySelector('[data-filter="search"]');
      if (replacement) { replacement.focus(); replacement.setSelectionRange(start, start); }
    }
  });
  app.addEventListener('change', event => {
    const { filter } = event.target.dataset;
    if (event.target.name === 'status') event.target.form.querySelectorAll('[name="checkIn"],[name="checkOut"]').forEach(input => { input.disabled = event.target.value !== 'hadir'; });
    if (filter === 'month') state.month = event.target.value || monthKey(new Date());
    if (filter === 'division') state.division = event.target.value;
    if (filter) render();
  });
  init().catch(error => { render(); showToast('Gagal terhubung ke Supabase: ' + error.message); });
  setInterval(() => { const clock = document.getElementById('live-clock'); if (clock) clock.textContent = `${clockNowWib()} WIB`; }, 1000);
})();
