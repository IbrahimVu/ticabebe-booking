-- Chạy một lần trong Supabase > SQL Editor trên dự án mới.
begin;
create schema booking_private;
revoke all on schema booking_private from public,anon,authenticated;
create table public.settings (
  id integer primary key default 1 check(id=1),
  shop_name text not null default 'TiCaBeBe' check(length(trim(shop_name)) between 1 and 80),
  open_time time not null default '09:00', close_time time not null default '20:00',
  duration_minutes integer not null default 45 check(duration_minutes between 15 and 240 and duration_minutes%15=0),
  buffer_minutes integer not null default 15 check(buffer_minutes between 0 and 120 and buffer_minutes%15=0),
  booking_days integer not null default 30 check(booking_days between 1 and 180),
  closed_days integer[] not null default '{}',
  check(open_time<close_time),
  check(extract(minute from open_time)::integer%15=0 and extract(second from open_time)=0),
  check(extract(minute from close_time)::integer%15=0 and extract(second from close_time)=0),
  check(closed_days <@ array[0,1,2,3,4,5,6])
);
insert into public.settings(id) values(1);
create table booking_private.admin_users (user_id uuid primary key references auth.users(id) on delete cascade);
create table booking_private.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check(length(trim(customer_name)) between 2 and 80),
  phone text not null check(phone ~ '^[+0-9 ().-]{9,20}$' and length(regexp_replace(phone,'[^0-9]','','g')) between 9 and 15),
  starts_at timestamptz not null, ends_at timestamptz not null, blocked_until timestamptz not null,
  status text not null default 'confirmed' check(status in ('confirmed','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(ends_at>starts_at and blocked_until>=ends_at),
  constraint no_overlapping_appointments exclude using gist (tstzrange(starts_at,blocked_until,'[)') with &&) where(status='confirmed')
);
create index appointments_start_idx on booking_private.appointments(starts_at);
alter table public.settings enable row level security;
alter table booking_private.admin_users enable row level security;
alter table booking_private.appointments enable row level security;
revoke all on public.settings,booking_private.admin_users,booking_private.appointments from public,anon,authenticated;
grant select on public.settings to anon,authenticated;

create policy settings_public_read on public.settings for select to anon,authenticated using(true);

create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from booking_private.admin_users where user_id=auth.uid());
$$;
create function public.require_admin() returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return true;
end; $$;
create policy admin_read_appointments on booking_private.appointments for select to authenticated using(public.is_admin());

create function public.availability(p_day date)
returns table(starts_at timestamptz,blocked_until timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare s public.settings; today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into s from public.settings where id=1;
  if p_day is null or p_day<today or p_day>today+s.booking_days then raise exception 'INVALID_SLOT'; end if;
  return query select a.starts_at,a.blocked_until from booking_private.appointments a
    where a.status='confirmed' and a.starts_at<((p_day+1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and a.blocked_until>(p_day::timestamp at time zone 'Asia/Ho_Chi_Minh');
end; $$;

-- Validation exécutée côté serveur. Les appels directs ne contournent pas les règles.
create function public.validate_slot(p_start timestamptz,s public.settings) returns void
language plpgsql stable set search_path='' as $$
declare local_start timestamp := p_start at time zone 'Asia/Ho_Chi_Minh';
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if p_start is null or p_start<=now() or local_start::date>today+s.booking_days
    or local_start::date<today or extract(second from local_start)<>0
    or extract(minute from local_start)::integer%15<>0
    or extract(dow from local_start)::integer=any(s.closed_days)
    or local_start::time<s.open_time
    or local_start+make_interval(mins=>s.duration_minutes)>local_start::date+s.close_time
    then raise exception 'INVALID_SLOT';
  end if;
end; $$;

create function public.book_appointment(p_name text,p_phone text,p_start timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.settings; a booking_private.appointments;
begin
  select * into s from public.settings where id=1 for update;
  perform public.validate_slot(p_start,s);
  if p_name is null or length(trim(p_name)) not between 2 and 80
    or p_phone is null or trim(p_phone) !~ '^[+0-9 ().-]{9,20}$'
    or length(regexp_replace(p_phone,'[^0-9]','','g')) not between 9 and 15
    then raise exception 'INVALID_CUSTOMER'; end if;
  insert into booking_private.appointments(customer_name,phone,starts_at,ends_at,blocked_until)
    values(trim(p_name),trim(p_phone),p_start,p_start+make_interval(mins=>s.duration_minutes),p_start+make_interval(mins=>s.duration_minutes+s.buffer_minutes)) returning * into a;
  -- Không trả tên, số điện thoại, lịch sử hoặc dữ liệu của các khách khác.
  return jsonb_build_object('id',a.id,'starts_at',a.starts_at,'ends_at',a.ends_at);
exception when exclusion_violation then raise exception 'SLOT_TAKEN';
  when check_violation or not_null_violation then raise exception 'INVALID_CUSTOMER';
end; $$;

create function public.edit_appointment(p_id uuid,p_name text,p_phone text,p_start timestamptz,p_cancel boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare s public.settings; a booking_private.appointments;
begin
  perform public.require_admin();
  select * into s from public.settings where id=1 for update;
  select * into a from booking_private.appointments where id=p_id for update;
  if not found then raise exception 'Không tìm thấy lịch hẹn'; end if;
  if p_cancel then update booking_private.appointments set status='cancelled',updated_at=now() where id=p_id;return;end if;
  if a.status='cancelled' then raise exception 'Lịch đã hủy không thể chỉnh sửa'; end if;
  if p_start is null or p_name is null or p_phone is null then raise exception 'Thiếu thông tin lịch hẹn'; end if;
  if p_start<>a.starts_at then
    perform public.validate_slot(p_start,s);
    a.ends_at:=p_start+make_interval(mins=>s.duration_minutes);
    a.blocked_until:=p_start+make_interval(mins=>s.duration_minutes+s.buffer_minutes);
  end if;
  update booking_private.appointments set customer_name=trim(p_name),phone=trim(p_phone),starts_at=p_start,
    ends_at=a.ends_at,blocked_until=a.blocked_until,updated_at=now() where id=p_id;
exception when exclusion_violation then raise exception 'SLOT_TAKEN';
  when check_violation or not_null_violation then raise exception 'INVALID_CUSTOMER';
end; $$;

create function public.update_settings(p_shop_name text,p_open time,p_close time,p_duration integer,p_buffer integer,p_days integer,p_closed integer[])
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.require_admin();
  update public.settings set shop_name=trim(p_shop_name),open_time=p_open,close_time=p_close,
    duration_minutes=p_duration,buffer_minutes=p_buffer,booking_days=p_days,closed_days=p_closed where id=1;
end; $$;

revoke all on function public.is_admin(),public.require_admin(),public.availability(date),public.validate_slot(timestamptz,public.settings),public.book_appointment(text,text,timestamptz),public.edit_appointment(uuid,text,text,timestamptz,boolean),public.update_settings(text,time,time,integer,integer,integer,integer[]) from public,anon,authenticated;
grant execute on function public.availability(date),public.book_appointment(text,text,timestamptz) to anon,authenticated;
grant execute on function public.is_admin(),public.require_admin(),public.edit_appointment(uuid,text,text,timestamptz,boolean),public.update_settings(text,time,time,integer,integer,integer,integer[]) to authenticated;
create or replace function public.admin_appointments(p_from date,p_to date,p_offset integer default 0,p_limit integer default 500)
returns table(id uuid,customer_name text,phone text,starts_at timestamptz,ends_at timestamptz,blocked_until timestamptz,status text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.require_admin();
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>62
    or p_offset is null or p_offset<0 or p_offset>100000 or p_limit is null or p_limit<1 or p_limit>500
    then raise exception 'INVALID_RANGE'; end if;
  return query select a.id,a.customer_name,a.phone,a.starts_at,a.ends_at,a.blocked_until,a.status,a.created_at,a.updated_at
    from booking_private.appointments a
    where a.starts_at>=(p_from::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and a.starts_at<(p_to::timestamp at time zone 'Asia/Ho_Chi_Minh')
    order by a.starts_at,a.id limit p_limit offset p_offset;
end; $$;

create or replace function public.admin_availability(p_day date,p_exclude uuid)
returns table(starts_at timestamptz,blocked_until timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare s public.settings; today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  perform public.require_admin();
  select * into s from public.settings where id=1;
  if p_day is null or p_day<today or p_day>today+s.booking_days then raise exception 'INVALID_SLOT'; end if;
  return query select a.starts_at,a.blocked_until from booking_private.appointments a
    where a.status='confirmed' and (p_exclude is null or a.id<>p_exclude)
      and a.starts_at<((p_day+1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and a.blocked_until>(p_day::timestamp at time zone 'Asia/Ho_Chi_Minh');
end; $$;


revoke all on function public.admin_appointments(date,date,integer,integer),public.admin_availability(date,uuid) from public,anon,authenticated;
grant execute on function public.admin_appointments(date,date,integer,integer),public.admin_availability(date,uuid) to authenticated;
commit;
