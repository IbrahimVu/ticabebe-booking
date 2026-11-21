-- Chạy sau migration team/services. Không xóa hay thay đổi lịch/tài khoản.
begin;

-- Không để quyền admin cũ bỏ qua trạng thái hoạt động của hồ sơ nhân sự.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from booking_private.staff where user_id=auth.uid() and role='admin' and active);
$$;

-- Kiểm tra quyền sau khi lấy khóa cấu hình chung, tránh dùng quyền đã bị thu hồi trong lúc chờ.
create or replace function public.studio_edit(p_id uuid,p_name text,p_phone text,p_start timestamptz,p_cancel boolean default false,p_progress text default 'scheduled')
returns void language plpgsql security definer set search_path='' as $$
declare me jsonb;a booking_private.appointments;s public.settings;
begin
 select * into s from public.settings where id=1 for update;
 me:=public.studio_profile();
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

-- Kiểm tra quyền sau khi lấy khóa cấu hình chung, tránh dùng quyền đã bị thu hồi trong lúc chờ.
create or replace function public.studio_staff_save(p_id bigint,p_name text,p_email text,p_role text,p_active boolean,p_bookable boolean)
returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid; result bigint;
begin
 perform 1 from public.settings where id=1 for update;
 perform booking_private.require_owner();
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

-- Kiểm tra quyền sau khi lấy khóa cấu hình chung, tránh dùng quyền đã bị thu hồi trong lúc chờ.
create or replace function public.studio_service_save(p_id bigint,p_name text,p_duration integer,p_buffer integer,p_active boolean)
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 perform 1 from public.settings where id=1 for update;
 perform booking_private.require_manager();
 if p_id is null then insert into booking_private.services(name,duration_minutes,buffer_minutes,active) values(trim(p_name),p_duration,p_buffer,p_active) returning id into result;
 else update booking_private.services set name=trim(p_name),duration_minutes=p_duration,buffer_minutes=p_buffer,active=p_active where id=p_id returning id into result;end if;
 if result is null then raise exception 'NOT_FOUND';end if;return result;
end;$$;

-- Kiểm tra quyền sau khi lấy khóa cấu hình chung, tránh dùng quyền đã bị thu hồi trong lúc chờ.
create or replace function public.studio_price_save(p_staff bigint,p_service bigint,p_price integer,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.settings where id=1 for update;
 perform booking_private.require_manager();
 insert into booking_private.prices values(p_staff,p_service,p_price,p_active)
 on conflict(staff_id,service_id) do update set price=excluded.price,active=excluded.active;
end;$$;

-- Kiểm tra quyền sau khi lấy khóa cấu hình chung, tránh dùng quyền đã bị thu hồi trong lúc chờ.
create or replace function public.studio_activate() returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.settings where id=1 for update;
 perform booking_private.require_owner();
 if not exists(select 1 from booking_private.prices p join booking_private.staff t on t.id=p.staff_id join booking_private.services s on s.id=p.service_id
 where p.active and p.price is not null and t.active and t.bookable and s.active) then raise exception 'NO_PRICES';end if;
 update booking_private.studio_state set enabled=true where id=1;
end;$$;

-- Kiểm tra quyền sau khi lấy khóa cấu hình chung, tránh dùng quyền đã bị thu hồi trong lúc chờ.
create or replace function public.studio_settings(p_shop_name text,p_open time,p_close time,p_days integer,p_closed integer[])
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.settings where id=1 for update;
 perform booking_private.require_manager();
 update public.settings set shop_name=trim(p_shop_name),open_time=p_open,close_time=p_close,booking_days=p_days,closed_days=p_closed where id=1;
end;$$;

create or replace function public.studio_availability(p_day date,p_staff bigint,p_exclude uuid default null)
returns table(starts_at timestamptz,blocked_until timestamptz) language plpgsql stable security definer set search_path='' as $$
declare s public.settings; me jsonb;
begin
 select * into s from public.settings where id=1;
 if p_day is null or p_day<(now() at time zone 'Asia/Ho_Chi_Minh')::date or p_day>(now() at time zone 'Asia/Ho_Chi_Minh')::date+s.booking_days then raise exception 'INVALID_SLOT';end if;
 if p_staff is null or p_staff<=0 then raise exception 'OFFER_UNAVAILABLE';end if;
 if p_exclude is null and not exists(
   select 1 from booking_private.staff t join booking_private.prices p on p.staff_id=t.id
   join booking_private.services d on d.id=p.service_id
   where t.id=p_staff and t.active and t.bookable and p.active and p.price is not null and d.active
 ) then raise exception 'OFFER_UNAVAILABLE';end if;
 if p_exclude is not null then
   me:=public.studio_profile();
   if not exists(select 1 from booking_private.appointments a where a.id=p_exclude and a.staff_id=p_staff
      and (me->>'role' in ('admin','manager') or a.staff_id=(me->>'id')::bigint)) then raise exception 'FORBIDDEN';end if;
 end if;
 return query select a.starts_at,a.blocked_until from booking_private.appointments a where a.staff_id=p_staff and a.status='confirmed'
 and (p_exclude is null or a.id<>p_exclude) and a.starts_at<((p_day+1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
 and a.blocked_until>(p_day::timestamp at time zone 'Asia/Ho_Chi_Minh');
end;$$;

-- Website phiên bản 2 không còn dùng các API quản trị cũ này.
revoke all on function public.admin_appointments(date,date,integer,integer),public.admin_availability(date,uuid),public.edit_appointment(uuid,text,text,timestamptz,boolean),public.update_settings(text,time,time,integer,integer,integer,integer[]),public.legacy_book_appointment(text,text,timestamptz) from public,anon,authenticated;
revoke all on schema booking_private from public,anon,authenticated;
revoke all on all tables in schema booking_private from public,anon,authenticated;
revoke all on all sequences in schema booking_private from public,anon,authenticated;
revoke all on all functions in schema booking_private from public,anon,authenticated;
revoke create on schema public from public,anon,authenticated;
-- Hàm/bảng mới do postgres tạo cũng phải được cấp quyền tường minh.
-- PUBLIC có EXECUTE mặc định toàn cục; REVOKE chỉ theo schema không loại bỏ quyền đó.
alter default privileges for role postgres revoke execute on functions from public,anon,authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated;
alter default privileges for role postgres in schema booking_private revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres in schema booking_private revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres in schema booking_private revoke execute on functions from public,anon,authenticated;
-- CREATE OR REPLACE giữ nguyên ACL; nhắc lại quyền tối thiểu cho các hàm thay ở trên.
revoke all on function public.is_admin(),public.studio_edit(uuid,text,text,timestamptz,boolean,text),public.studio_staff_save(bigint,text,text,text,boolean,boolean),public.studio_service_save(bigint,text,integer,integer,boolean),public.studio_price_save(bigint,bigint,integer,boolean),public.studio_activate(),public.studio_settings(text,time,time,integer,integer[]),public.studio_availability(date,bigint,uuid) from public,anon,authenticated;
grant execute on function public.studio_availability(date,bigint,uuid) to anon,authenticated;
grant execute on function public.is_admin(),public.studio_edit(uuid,text,text,timestamptz,boolean,text),public.studio_staff_save(bigint,text,text,text,boolean,boolean),public.studio_service_save(bigint,text,integer,integer,boolean),public.studio_price_save(bigint,bigint,integer,boolean),public.studio_activate(),public.studio_settings(text,time,time,integer,integer[]) to authenticated;
notify pgrst,'reload schema';
commit;
