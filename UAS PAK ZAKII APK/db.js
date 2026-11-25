import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Ambil dari Supabase Dashboard > tombol "Connect". Pakai PUBLISHABLE key, bukan secret key.
const SUPABASE_URL = 'https://svqdciawxvtwufomvrbv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_4QCpZo71MKD6IUngqnIbFQ_Q4eWLtP9';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Supabase tidak melempar error: ia mengembalikan { data, error }. must() mengubahnya jadi throw.
const must = ({ data, error }) => { if (error) throw error; return data; };
const hm = time => (time ? time.slice(0, 5) : '');   // '08:02:00' -> '08:02'

// Ubah baris database (snake_case) ke bentuk yang dipakai app.js (camelCase)
const toEmployee = r => ({ id: r.id, userId: r.user_id, nik: r.nik, name: r.name, job: r.job, division: r.division, username: r.email, active: r.active });
const toRecord = (r, audit) => ({ id: String(r.id), employeeId: r.employee_id, date: r.work_date, status: r.status, checkIn: hm(r.check_in), checkOut: hm(r.check_out), audit });

export async function signIn(email, password) {
  return must(await supabase.auth.signInWithPassword({ email, password })).user;
}
export const signOut = () => supabase.auth.signOut();
export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

// RLS otomatis menyaring: karyawan hanya menerima datanya sendiri, admin menerima semuanya.
// Catatan: Supabase membatasi 1000 baris per query secara default.
export async function loadAll() {
  const [emps, recs, audits, cfg, admin] = await Promise.all([
    supabase.from('employees').select('*').order('id'),
    supabase.from('attendance').select('*').order('work_date', { ascending: false }),
    supabase.from('attendance_audit').select('*').order('at'),
    supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
    supabase.rpc('is_admin')
  ]);
  const auditByRecord = {};
  for (const a of must(audits)) {
    (auditByRecord[a.attendance_id] ||= []).push({ at: a.at, by: a.by_name, action: a.action, reason: a.reason, before: a.before, after: a.after });
  }
  const s = must(cfg);
  return {
    isAdmin: must(admin) === true,
    employees: must(emps).map(toEmployee),
    records: must(recs).map(r => toRecord(r, auditByRecord[r.id] || [])),
    settings: s ? { shiftStart: hm(s.shift_start), shiftEnd: hm(s.shift_end), normalWage: s.normal_wage, ratePerBlock: s.rate_per_block } : {}
  };
}

// Absen masuk/pulang: waktunya diambil server di fungsi SQL punch()
export async function punch(kind) { must(await supabase.rpc('punch', { kind })); }

export async function saveEmployee(emp, editing) {
  const row = { nik: emp.nik, name: emp.name, job: emp.job, division: emp.division, email: emp.email, active: emp.active };
  if (editing) must(await supabase.from('employees').update(row).eq('id', emp.id));
  else must(await supabase.from('employees').insert({ id: emp.id, ...row }));
}

// id kosong = tambah manual; id terisi = koreksi. Jejak audit dicatat atomik di dalam fungsi SQL.
export async function saveAttendance(r) {
  must(await supabase.rpc('save_attendance', {
    p_id: r.id ? Number(r.id) : null, p_employee: r.employeeId || null, p_date: r.date || null,
    p_status: r.status, p_in: r.checkIn || null, p_out: r.checkOut || null, p_reason: r.reason
  }));
}

export async function saveSettings(s) {
  const rows = must(await supabase.from('settings')
    .update({ shift_start: s.shiftStart, shift_end: s.shiftEnd, normal_wage: s.normalWage, rate_per_block: s.ratePerBlock })
    .eq('id', 1).select());
  if (!rows.length) throw new Error('Tidak diizinkan mengubah pengaturan.');  // RLS menolak tanpa error
}

// ===== Pembuatan akun karyawan: lewat Edge Function "employee-admin" (secret key hanya ada di server) =====
async function callEmployeeAdmin(body) {
  const { data, error } = await supabase.functions.invoke('employee-admin', { body });
  if (error) {
    let message = error.message;
    try { message = (await error.context.json()).error || message; } catch { /* pakai pesan bawaan */ }
    throw new Error(message);
  }
  return data;
}
export const createEmployee = (emp, password) => callEmployeeAdmin({ mode: 'create', employee: emp, password });
export const setEmployeePassword = (employeeId, password) => callEmployeeAdmin({ mode: 'password', employeeId, password });
