
-- ========== TABEL ==========
create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table employees (
  id        text primary key,                 -- contoh: EMP-001
  user_id   uuid unique references auth.users(id) on delete set null,
  nik       text not null unique,
  name      text not null,
  job       text not null,
  division  text not null,
  email     text not null unique,             -- dipakai untuk login (Supabase Auth)
  active    boolean not null default true
);

create table attendance (
  id          bigint primary key generated always as identity,
  employee_id text not null references employees(id),
  work_date   date not null,
  status      text not null default 'hadir' check (status in ('hadir','izin','sakit','cuti','alpha')),
  check_in    time,
  check_out   time,
  unique (employee_id, work_date)             -- satu catatan per karyawan per tanggal
);

create table attendance_audit (
  id            bigint primary key generated always as identity,
  attendance_id bigint not null references attendance(id) on delete cascade,
  at            timestamptz not null default now(),
  by_name       text not null,
  action        text not null,
  reason        text not null,
  before        jsonb,
  after         jsonb
);

create table settings (
  id             int primary key default 1 check (id = 1),   -- hanya boleh 1 baris
  shift_start    time not null default '08:00',
  shift_end      time not null default '16:00',
  normal_wage    int  not null default 100000 check (normal_wage >= 0),
  rate_per_block int  not null default 3125   check (rate_per_block >= 0)
);
insert into settings (id) values (1);

-- ========== FUNGSI BANTU ==========
create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

-- Hubungkan akun login (auth.users) dengan data karyawan lewat email yang sama
create or replace function link_user_to_employee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update employees set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function link_user_to_employee();

create or replace function link_employee_to_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is null then
    select id into new.user_id from auth.users where lower(email) = lower(new.email) limit 1;
  end if;
  return new;
end $$;
create trigger employees_link_user before insert or update of email on employees
  for each row execute function link_employee_to_user();

-- ========== ABSEN MASUK/PULANG (waktu diambil dari SERVER, bukan browser) ==========
create or replace function punch(kind text) returns void
language plpgsql security definer set search_path = public as $$
declare
  emp employees;
  rec attendance;
  wib timestamp := now() at time zone 'Asia/Jakarta';
  today date := (now() at time zone 'Asia/Jakarta')::date;
  hhmm time := date_trunc('minute', now() at time zone 'Asia/Jakarta')::time;
begin
  select * into emp from employees where user_id = auth.uid() and active;
  if not found then raise exception 'Akun karyawan tidak aktif.'; end if;
  select * into rec from attendance where employee_id = emp.id and work_date = today;

  if kind = 'in' then
    if found then raise exception 'Absen masuk hari ini sudah tercatat.'; end if;
    insert into attendance (employee_id, work_date, check_in) values (emp.id, today, hhmm);
  elsif kind = 'out' then
    if not found or rec.check_in is null then raise exception 'Catat absen masuk terlebih dahulu.'; end if;
    if rec.check_out is not null then raise exception 'Absen pulang hari ini sudah tercatat.'; end if;
    if hhmm <= rec.check_in then raise exception 'Jam pulang belum melewati jam masuk. Silakan coba lagi nanti.'; end if;
    update attendance set check_out = hhmm where id = rec.id;
  else
    raise exception 'Jenis absen tidak valid.';
  end if;
end $$;

-- ========== TAMBAH MANUAL / KOREKSI (khusus admin, sekaligus mencatat audit) ==========
create or replace function save_attendance(
  p_id bigint, p_employee text, p_date date, p_status text, p_in time, p_out time, p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  rec attendance;
  new_id bigint;
  who text := coalesce(auth.jwt() ->> 'email', 'Admin HR');
  snap jsonb;
begin
  if not is_admin() then raise exception 'Hanya Admin/HR yang boleh mengubah absensi.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan wajib diisi.'; end if;
  if p_status = 'hadir' and p_in is null then raise exception 'Jam masuk wajib diisi untuk status Hadir.'; end if;
  if p_status <> 'hadir' then p_in := null; p_out := null; end if;
  if p_in is not null and p_out is not null and p_out <= p_in then
    raise exception 'Jam pulang harus lebih besar dari jam masuk.';
  end if;
  snap := jsonb_build_object('status', p_status,
            'checkIn',  coalesce(to_char(p_in,  'HH24:MI'), ''),
            'checkOut', coalesce(to_char(p_out, 'HH24:MI'), ''));

  if p_id is null then
    if p_date is null or p_date > (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'Tanggal tidak boleh kosong atau di masa depan.';
    end if;
    insert into attendance (employee_id, work_date, status, check_in, check_out)
      values (p_employee, p_date, p_status, p_in, p_out) returning id into new_id;
    insert into attendance_audit (attendance_id, by_name, action, reason, before, after)
      values (new_id, who, 'dibuat manual', p_reason, null, snap);
  else
    select * into rec from attendance where id = p_id;
    if not found then raise exception 'Catatan absensi tidak ditemukan.'; end if;
    update attendance set status = p_status, check_in = p_in, check_out = p_out where id = p_id;
    insert into attendance_audit (attendance_id, by_name, action, reason, before, after)
      values (p_id, who, 'koreksi', p_reason,
              jsonb_build_object('status', rec.status,
                'checkIn',  coalesce(to_char(rec.check_in,  'HH24:MI'), ''),
                'checkOut', coalesce(to_char(rec.check_out, 'HH24:MI'), '')),
              snap);
  end if;
end $$;

-- ========== RLS: siapa boleh apa ==========
alter table admins           enable row level security;  -- tanpa policy = tidak bisa diakses lewat API
alter table employees        enable row level security;
alter table attendance       enable row level security;
alter table attendance_audit enable row level security;
alter table settings         enable row level security;

create policy "employees: admin atau diri sendiri" on employees for select to authenticated
  using (is_admin() or user_id = auth.uid());
create policy "employees: admin tambah" on employees for insert to authenticated with check (is_admin());
create policy "employees: admin ubah"   on employees for update to authenticated
  using (is_admin()) with check (is_admin());

create policy "attendance: admin atau milik sendiri" on attendance for select to authenticated
  using (is_admin() or employee_id in (select id from employees where user_id = auth.uid()));
-- insert/update absensi hanya lewat fungsi punch() dan save_attendance()

create policy "audit: admin baca" on attendance_audit for select to authenticated using (is_admin());

create policy "settings: semua login boleh baca" on settings for select to authenticated using (true);
create policy "settings: admin ubah" on settings for update to authenticated
  using (is_admin()) with check (is_admin());

-- ========== HAK AKSES API ==========
grant select, insert, update on employees  to authenticated;
grant select, update         on settings   to authenticated;
grant select                 on attendance, attendance_audit to authenticated;

revoke execute on function punch(text), is_admin(),
  save_attendance(bigint, text, date, text, time, time, text) from public, anon;
grant  execute on function punch(text), is_admin(),
  save_attendance(bigint, text, date, text, time, time, text) to authenticated;

-- ========== LANGKAH MANUAL SETELAH SKRIP INI ==========
-- 1. Dashboard > Authentication > Users > Add user (centang "Auto Confirm User"):
--    buat akun admin, misalnya admin@contoh.com, lalu jadikan admin:
--      insert into admins (user_id) select id from auth.users where email = 'admin@contoh.com';
-- 2. (Opsional) data contoh karyawan — ganti email dengan email akun karyawan yang kamu buat:
--      insert into employees (id, nik, name, job, division, email) values
--        ('EMP-001','3507011201910001','Siti Aminah','Staf Administrasi','Operasional','siti@contoh.com'),
--        ('EMP-002','3507012302940002','Dimas Pratama','Staf Gudang','Logistik','dimas@contoh.com');
-- 3. Buat akun login tiap karyawan di Authentication > Users dengan email yang sama;
--    trigger di atas otomatis menghubungkannya ke data karyawan.
