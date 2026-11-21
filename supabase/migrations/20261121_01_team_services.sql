-- Nâng cấp từ schema hiện tại. Giữ dữ liệu cũ; chưa bật đặt lịch nhiều nhân sự
-- cho đến khi admin cấu hình giá rồi bấm Kích hoạt trong giao diện.
begin;
alter table public.settings add column studio_version integer not null default 2;
create table booking_private.staff (
 id bigint generated always as identity primary key,
 user_id uuid unique references auth.users(id) on delete set null,
 name text not null check(length(trim(name)) between 2 and 80),
 role text not null check(role in ('admin','manager','barber')),
 active boolean not null default true,
 bookable boolean not null default true
);
create table booking_private.services (
 id bigint generated always as identity primary key,
 name text not null check(length(trim(name)) between 2 and 80),
 duration_minutes integer not null check(duration_minutes between 15 and 240 and duration_minutes%15=0),
 buffer_minutes integer not null check(buffer_minutes between 0 and 120 and buffer_minutes%15=0),
 active boolean not null default true
);
create table booking_private.prices (
 staff_id bigint references booking_private.staff(id),
 service_id bigint references booking_private.services(id),
 price integer check(price between 0 and 100000000),
 active boolean not null default true,
 primary key(staff_id,service_id)
);
create table booking_private.studio_state(id integer primary key check(id=1),enabled boolean not null default false);
insert into booking_private.studio_state values(1,false);
insert into booking_private.staff(user_id,name,role)
 select user_id,'Quản trị viên','admin' from booking_private.admin_users order by user_id;
insert into booking_private.staff(name,role)
 select 'TiCaBeBe','barber' where not exists(select 1 from booking_private.staff);
insert into booking_private.services(name,duration_minutes,buffer_minutes)
 select 'Cắt tóc',duration_minutes,buffer_minutes from public.settings where id=1;
insert into booking_private.prices(staff_id,service_id)
 select t.id,s.id from booking_private.staff t cross join booking_private.services s;
alter table booking_private.appointments
 add column staff_id bigint references booking_private.staff(id),
 add column service_id bigint references booking_private.services(id),
 add column service_name text,
 add column staff_name text,
 add column price integer,
 add column progress text not null default 'scheduled' check(progress in ('scheduled','serving','completed'));
update booking_private.appointments set staff_id=(select min(id) from booking_private.staff),
 service_id=(select min(id) from booking_private.services),service_name='Cắt tóc',
 staff_name=(select name from booking_private.staff order by id limit 1);
alter table booking_private.appointments alter column staff_id set not null;
alter table booking_private.appointments drop constraint no_overlapping_appointments;
-- Hai range GiST dùng built-in PostgreSQL, không cần extension UUID GiST.
alter table booking_private.appointments add constraint no_overlapping_appointments
 exclude using gist(int8range(staff_id,staff_id,'[]') with &&,tstzrange(starts_at,blocked_until,'[)') with &&) where(status='confirmed');
alter table booking_private.staff enable row level security;
alter table booking_private.services enable row level security;
alter table booking_private.prices enable row level security;
alter table booking_private.studio_state enable row level security;
revoke all on all tables in schema booking_private from public,anon,authenticated;
revoke all on all sequences in schema booking_private from public,anon,authenticated;

create function public.studio_profile() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t booking_private.staff;
begin
 select * into t from booking_private.staff where user_id=auth.uid() and active;
 if not found then raise exception 'NOT_STAFF';end if;
 return jsonb_build_object('id',t.id,'name',t.name,'role',t.role,'bookable',t.bookable);
end;$$;
create function booking_private.require_manager() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if (public.studio_profile()->>'role') not in ('admin','manager') then raise exception 'FORBIDDEN';end if;
end;$$;
create function booking_private.require_owner() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if public.studio_profile()->>'role'<>'admin' then raise exception 'FORBIDDEN';end if;
end;$$;

create function public.studio_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'enabled',(select enabled from booking_private.studio_state where id=1),
 'offers',coalesce((select jsonb_agg(jsonb_build_object('staff_id',t.id,'staff_name',t.name,'service_id',s.id,'service_name',s.name,
 'duration_minutes',s.duration_minutes,'buffer_minutes',s.buffer_minutes,'price',p.price) order by s.id,t.id)
 from booking_private.prices p join booking_private.staff t on t.id=p.staff_id join booking_private.services s on s.id=p.service_id
 where t.active and t.bookable and s.active and p.active and p.price is not null),'[]'::jsonb));
$$;
create function public.studio_availability(p_day date,p_staff bigint,p_exclude uuid default null)
returns table(starts_at timestamptz,blocked_until timestamptz) language plpgsql stable security definer set search_path='' as $$
declare s public.settings; me jsonb;
begin
 select * into s from public.settings where id=1;
 if p_day is null or p_day<(now() at time zone 'Asia/Ho_Chi_Minh')::date or p_day>(now() at time zone 'Asia/Ho_Chi_Minh')::date+s.booking_days then raise exception 'INVALID_SLOT';end if;
 if p_exclude is not null then
   me:=public.studio_profile();
   if not exists(select 1 from booking_private.appointments a where a.id=p_exclude and a.staff_id=p_staff
      and (me->>'role' in ('admin','manager') or a.staff_id=(me->>'id')::bigint)) then raise exception 'FORBIDDEN';end if;
 end if;
 return query select a.starts_at,a.blocked_until from booking_private.appointments a where a.staff_id=p_staff and a.status='confirmed'
 and (p_exclude is null or a.id<>p_exclude) and a.starts_at<((p_day+1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
 and a.blocked_until>(p_day::timestamp at time zone 'Asia/Ho_Chi_Minh');
end;$$;
create function public.studio_book(p_name text,p_phone text,p_start timestamptz,p_staff bigint,p_service bigint,p_price integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.settings; d booking_private.services; t booking_private.staff; cost integer; a booking_private.appointments;
begin
 select * into s from public.settings where id=1 for update;
 if not (select enabled from booking_private.studio_state where id=1) then raise exception 'NOT_ENABLED';end if;
 select * into t from booking_private.staff where id=p_staff and active and bookable;
 if not found then raise exception 'OFFER_UNAVAILABLE';end if;
 select * into d from booking_private.services where id=p_service and active;
 if not found then raise exception 'OFFER_UNAVAILABLE';end if;
 select price into cost from booking_private.prices where staff_id=p_staff and service_id=p_service and active;
 if cost is null then raise exception 'OFFER_UNAVAILABLE';end if;
 if p_price is distinct from cost then raise exception 'PRICE_CHANGED';end if;
 s.duration_minutes:=d.duration_minutes;s.buffer_minutes:=d.buffer_minutes;
 perform public.validate_slot(p_start,s);
 if p_name is null or length(trim(p_name)) not between 2 and 80 or p_phone is null or trim(p_phone)!~'^[+0-9 ().-]{9,20}$'
 or length(regexp_replace(p_phone,'[^0-9]','','g')) not between 9 and 15 then raise exception 'INVALID_CUSTOMER';end if;
 insert into booking_private.appointments(customer_name,phone,starts_at,ends_at,blocked_until,staff_id,service_id,service_name,staff_name,price)
 values(trim(p_name),trim(p_phone),p_start,p_start+make_interval(mins=>d.duration_minutes),p_start+make_interval(mins=>d.duration_minutes+d.buffer_minutes),t.id,d.id,d.name,t.name,cost) returning * into a;
 return jsonb_build_object('id',a.id,'starts_at',a.starts_at,'ends_at',a.ends_at,'price',a.price,'service_name',a.service_name,'staff_name',a.staff_name);
exception when exclusion_violation then raise exception 'SLOT_TAKEN';
 when check_violation or not_null_violation then raise exception 'INVALID_CUSTOMER';
end;$$;
create function public.studio_appointments(p_from date,p_to date,p_offset integer default 0)
returns setof booking_private.appointments language plpgsql stable security definer set search_path='' as $$
declare me jsonb:=public.studio_profile();
begin
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>62 or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'INVALID_RANGE';end if;
 return query select a.* from booking_private.appointments a where a.starts_at>=(p_from::timestamp at time zone 'Asia/Ho_Chi_Minh')
 and a.starts_at<(p_to::timestamp at time zone 'Asia/Ho_Chi_Minh') and (me->>'role' in ('admin','manager') or a.staff_id=(me->>'id')::bigint)
 order by a.starts_at,a.id limit 500 offset p_offset;
end;$$;
create function public.studio_edit(p_id uuid,p_name text,p_phone text,p_start timestamptz,p_cancel boolean default false,p_progress text default 'scheduled')
returns void language plpgsql security definer set search_path='' as $$
declare me jsonb:=public.studio_profile();a booking_private.appointments;s public.settings;
begin
 select * into s from public.settings where id=1 for update;
 select * into a from booking_private.appointments where id=p_id for update;
 if not found or not(me->>'role' in ('admin','manager') or a.staff_id=(me->>'id')::bigint) then raise exception 'FORBIDDEN';end if;
 if a.status='cancelled' then raise exception 'APPOINTMENT_CANCELLED';end if;
 if p_cancel then update booking_private.appointments set status='cancelled',updated_at=now() where id=p_id;return;end if;
 if p_start is null or p_name is null or p_phone is null or p_progress is null then raise exception 'INVALID_CUSTOMER';end if;
 if a.progress='completed' and p_start<>a.starts_at then raise exception 'APPOINTMENT_COMPLETED';end if;
 if p_start<>a.starts_at then
   -- Giữ thời lượng/giá đã chốt tại lúc đặt, kể cả dịch vụ đổi sau đó.
   s.duration_minutes:=extract(epoch from a.ends_at-a.starts_at)::integer/60;
   s.buffer_minutes:=extract(epoch from a.blocked_until-a.ends_at)::integer/60;
   perform public.validate_slot(p_start,s);
 end if;
 update booking_private.appointments set customer_name=trim(p_name),phone=trim(p_phone),starts_at=p_start,
 ends_at=p_start+(a.ends_at-a.starts_at),blocked_until=p_start+(a.blocked_until-a.starts_at),progress=p_progress,updated_at=now() where id=p_id;
exception when exclusion_violation then raise exception 'SLOT_TAKEN';
 when check_violation or not_null_violation then raise exception 'INVALID_CUSTOMER';
end;$$;
create function public.studio_management() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform booking_private.require_manager();
 return jsonb_build_object('enabled',(select enabled from booking_private.studio_state where id=1),
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'role',t.role,'active',t.active,'bookable',t.bookable,
 'email',case when public.studio_profile()->>'role'='admin' then u.email else null end) order by t.id) from booking_private.staff t left join auth.users u on u.id=t.user_id),'[]'::jsonb),
 'services',coalesce((select jsonb_agg(s order by id) from booking_private.services s),'[]'::jsonb),
 'prices',coalesce((select jsonb_agg(p order by staff_id,service_id) from booking_private.prices p),'[]'::jsonb));
end;$$;
create function public.studio_staff_save(p_id bigint,p_name text,p_email text,p_role text,p_active boolean,p_bookable boolean)
returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid; result bigint;
begin
 perform booking_private.require_owner();
 perform 1 from public.settings where id=1 for update;
 perform 1 from booking_private.studio_state where id=1 for update;
 if nullif(trim(p_email),'') is not null then
 select id into uid from auth.users where lower(email)=lower(trim(p_email));
 if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;
 end if;
 if p_id is not null and not exists(select 1 from booking_private.staff where id=p_id) then raise exception 'NOT_FOUND';end if;
 if p_role='admin' and (uid is null or not p_active) then raise exception 'INVALID_ADMIN';end if;
 if p_id is not null and exists(select 1 from booking_private.staff where id=p_id and role='admin' and active)
 and (p_role<>'admin' or not p_active or uid is null)
 and not exists(select 1 from booking_private.staff where id<>p_id and role='admin' and active and user_id is not null) then raise exception 'LAST_ADMIN';end if;
 if p_id is null then
 insert into booking_private.staff(user_id,name,role,active,bookable) values(uid,trim(p_name),p_role,p_active,p_bookable) returning id into result;
 else
 -- Đồng bộ danh sách admin cũ để mọi API cũ cũng mất quyền khi hạ vai trò.
 delete from booking_private.admin_users where user_id=(select user_id from booking_private.staff where id=p_id);
 update booking_private.staff set user_id=uid,name=trim(p_name),role=p_role,active=p_active,bookable=p_bookable where id=p_id returning id into result;
 end if;
 if p_role='admin' and p_active then insert into booking_private.admin_users(user_id) values(uid) on conflict do nothing;end if;
 return result;
exception when unique_violation then raise exception 'ACCOUNT_ALREADY_LINKED';
end;$$;
create function public.studio_service_save(p_id bigint,p_name text,p_duration integer,p_buffer integer,p_active boolean)
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 perform booking_private.require_manager();
 perform 1 from public.settings where id=1 for update;
 if p_id is null then insert into booking_private.services(name,duration_minutes,buffer_minutes,active) values(trim(p_name),p_duration,p_buffer,p_active) returning id into result;
 else update booking_private.services set name=trim(p_name),duration_minutes=p_duration,buffer_minutes=p_buffer,active=p_active where id=p_id returning id into result;end if;
 if result is null then raise exception 'NOT_FOUND';end if;return result;
end;$$;
create function public.studio_price_save(p_staff bigint,p_service bigint,p_price integer,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform booking_private.require_manager();
 perform 1 from public.settings where id=1 for update;
 insert into booking_private.prices values(p_staff,p_service,p_price,p_active)
 on conflict(staff_id,service_id) do update set price=excluded.price,active=excluded.active;
end;$$;
create function public.studio_activate() returns void language plpgsql security definer set search_path='' as $$
begin
 perform booking_private.require_owner();
 perform 1 from public.settings where id=1 for update;
 if not exists(select 1 from booking_private.prices p join booking_private.staff t on t.id=p.staff_id join booking_private.services s on s.id=p.service_id
 where p.active and p.price is not null and t.active and t.bookable and s.active) then raise exception 'NO_PRICES';end if;
 update booking_private.studio_state set enabled=true where id=1;
end;$$;
create function public.studio_settings(p_shop_name text,p_open time,p_close time,p_days integer,p_closed integer[])
returns void language plpgsql security definer set search_path='' as $$
begin
 perform booking_private.require_manager();
 update public.settings set shop_name=trim(p_shop_name),open_time=p_open,close_time=p_close,booking_days=p_days,closed_days=p_closed where id=1;
end;$$;
-- Giữ luồng cũ hoạt động trong thời gian chuẩn bị giá; sau kích hoạt không
-- cho API cũ bỏ qua việc chọn dịch vụ/người thực hiện.
alter function public.book_appointment(text,text,timestamptz) rename to legacy_book_appointment;
revoke all on function public.legacy_book_appointment(text,text,timestamptz) from public,anon,authenticated;
create function public.book_appointment(p_name text,p_phone text,p_start timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt jsonb;
begin
 perform 1 from public.settings where id=1 for update;
 if (select enabled from booking_private.studio_state where id=1) then raise exception 'UPGRADE_REQUIRED';end if;
 -- Legacy insert cần staff_id sau nâng cấp; default chỉ dùng trong giai đoạn chuẩn bị.
 return public.legacy_book_appointment(p_name,p_phone,p_start);
end;$$;
alter table booking_private.appointments alter column staff_id set default 1;
-- Không để mặc định phụ thuộc vào id=1 nếu sequence/schema trước đó khác.
do $$declare first_staff bigint;begin select min(id) into first_staff from booking_private.staff;
execute format('alter table booking_private.appointments alter column staff_id set default %s',first_staff);end;$$;

revoke all on all functions in schema booking_private from public,anon,authenticated;
revoke all on function public.studio_profile(),public.studio_catalog(),public.studio_availability(date,bigint,uuid),public.studio_book(text,text,timestamptz,bigint,bigint,integer),
 public.studio_appointments(date,date,integer),public.studio_edit(uuid,text,text,timestamptz,boolean,text),public.studio_management(),
 public.studio_staff_save(bigint,text,text,text,boolean,boolean),public.studio_service_save(bigint,text,integer,integer,boolean),
 public.studio_price_save(bigint,bigint,integer,boolean),public.studio_activate(),public.studio_settings(text,time,time,integer,integer[]),public.book_appointment(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.studio_catalog(),public.studio_availability(date,bigint,uuid),public.studio_book(text,text,timestamptz,bigint,bigint,integer),public.book_appointment(text,text,timestamptz) to anon,authenticated;
grant execute on function public.studio_profile(),public.studio_appointments(date,date,integer),public.studio_edit(uuid,text,text,timestamptz,boolean,text),public.studio_management(),
 public.studio_staff_save(bigint,text,text,text,boolean,boolean),public.studio_service_save(bigint,text,integer,integer,boolean),
 public.studio_price_save(bigint,bigint,integer,boolean),public.studio_activate(),public.studio_settings(text,time,time,integer,integer[]) to authenticated;
notify pgrst,'reload schema';
commit;
