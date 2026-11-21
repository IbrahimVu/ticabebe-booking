-- Chạy sau 20261121_02_security_hardening.sql, trước khi deploy staff-create.
-- Không lưu mật khẩu trong bảng ứng dụng. Auth tự quản lý mật khẩu.
begin;
create or replace function booking_private.provision_auth_staff()
returns trigger language plpgsql security definer set search_path='' as $$
declare payload jsonb:=new.raw_app_meta_data->'ticabebe_staff'; actor uuid; person_name text; person_role text; enabled boolean; can_book boolean;
begin
 -- raw_app_meta_data chỉ được Auth Admin API/backend ghi. Không đọc user_metadata
 -- vì chính người dùng có thể sửa user_metadata.
 if payload is null then return new;end if;
 if jsonb_typeof(payload)<>'object' then raise exception 'INVALID_PROVISION';end if;
 begin
   actor:=(payload->>'actor_id')::uuid;
   enabled:=(payload->>'active')::boolean;
   can_book:=(payload->>'bookable')::boolean;
 exception when invalid_text_representation then raise exception 'INVALID_PROVISION';end;
 person_name:=trim(payload->>'name');person_role:=payload->>'role';
 if actor is null or person_name is null or length(person_name) not between 2 and 80
   or person_role is null or person_role not in ('admin','manager','barber') or enabled is null or can_book is null
   or (person_role='admin' and not enabled) then raise exception 'INVALID_PROVISION';end if;
 -- Cùng khóa với RPC quản lý quyền: kiểm tra admin lại ngay trong transaction Auth.
 perform 1 from public.settings where id=1 for update;
 if not exists(select 1 from booking_private.staff where user_id=actor and role='admin' and active)
   then raise exception 'PROVISION_FORBIDDEN';end if;
 insert into booking_private.staff(user_id,name,role,active,bookable)
 values(new.id,person_name,person_role,enabled,can_book);
 if person_role='admin' then insert into booking_private.admin_users(user_id) values(new.id);end if;
 return new;
end;$$;
drop trigger if exists ticabebe_provision_auth_staff on auth.users;
create trigger ticabebe_provision_auth_staff after insert on auth.users
for each row execute function booking_private.provision_auth_staff();

create or replace function public.studio_account_creation_ready()
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 perform booking_private.require_owner();
 return exists(select 1 from pg_catalog.pg_trigger where tgrelid='auth.users'::regclass
   and tgname='ticabebe_provision_auth_staff' and tgenabled in ('O','A') and not tgisinternal);
end;$$;
revoke all on function booking_private.provision_auth_staff() from public,anon,authenticated;
revoke all on function public.studio_account_creation_ready() from public,anon,authenticated;
grant execute on function public.studio_account_creation_ready() to authenticated;
notify pgrst,'reload schema';
commit;
