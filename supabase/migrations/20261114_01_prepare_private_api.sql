-- Bước 1: thêm API quản trị trước khi cập nhật frontend, chưa di chuyển bảng.
begin;
create or replace function public.admin_appointments(p_from date,p_to date,p_offset integer default 0,p_limit integer default 500)
returns table(id uuid,customer_name text,phone text,starts_at timestamptz,ends_at timestamptz,blocked_until timestamptz,status text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.require_admin();
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>62
    or p_offset is null or p_offset<0 or p_offset>100000 or p_limit is null or p_limit<1 or p_limit>500
    then raise exception 'INVALID_RANGE'; end if;
  return query select a.id,a.customer_name,a.phone,a.starts_at,a.ends_at,a.blocked_until,a.status,a.created_at,a.updated_at
    from public.appointments a
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
  return query select a.starts_at,a.blocked_until from public.appointments a
    where a.status='confirmed' and (p_exclude is null or a.id<>p_exclude)
      and a.starts_at<((p_day+1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and a.blocked_until>(p_day::timestamp at time zone 'Asia/Ho_Chi_Minh');
end; $$;
revoke all on function public.admin_appointments(date,date,integer,integer),public.admin_availability(date,uuid) from public,anon,authenticated;
grant execute on function public.admin_appointments(date,date,integer,integer),public.admin_availability(date,uuid) to authenticated;
commit;
