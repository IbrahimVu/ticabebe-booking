-- Chỉ đọc metadata phân quyền, KHÔNG đọc dữ liệu khách, password, token hoặc khóa.
-- Chạy SQL Editor bằng postgres; mỗi mục failures=0 là đạt kiểm tra tương ứng.
select 'private_schema_client_usage' as check_name,count(*) as failures
from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated')
and has_schema_privilege(r.oid,'booking_private','USAGE');

select 'private_tables_without_rls' as check_name,count(*) as failures
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='booking_private' and c.relkind in ('r','p') and not c.relrowsecurity;

select 'private_table_client_grants' as check_name,count(*) as failures
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
cross join pg_catalog.pg_roles r
where n.nspname='booking_private' and c.relkind in ('r','p') and r.rolname in ('anon','authenticated')
and has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');

select 'private_sequence_client_grants' as check_name,count(*) as failures
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
cross join pg_catalog.pg_roles r
where n.nspname='booking_private' and c.relkind='S' and r.rolname in ('anon','authenticated')
and has_sequence_privilege(r.oid,c.oid,'USAGE,SELECT,UPDATE');

select 'private_function_client_grants' as check_name,count(*) as failures
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
cross join pg_catalog.pg_roles r
where n.nspname='booking_private' and r.rolname in ('anon','authenticated')
and has_function_privilege(r.oid,p.oid,'EXECUTE');

select 'app_definer_without_empty_search_path' as check_name,count(*) as failures
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where p.prosecdef and (n.nspname='booking_private' or (n.nspname='public' and
 (p.proname like 'studio_%' or p.proname in ('is_admin','require_admin','availability','book_appointment','legacy_book_appointment','admin_appointments','admin_availability','edit_appointment','update_settings'))))
and not coalesce(p.proconfig @> array['search_path=""'],false);

select 'obsolete_rpc_client_grants' as check_name,count(*) as failures
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
cross join pg_catalog.pg_roles r
where n.nspname='public' and p.proname in ('legacy_book_appointment','admin_appointments','admin_availability','edit_appointment','update_settings')
and r.rolname in ('anon','authenticated') and has_function_privilege(r.oid,p.oid,'EXECUTE');

select 'unexpected_anonymous_app_functions' as check_name,count(*) as failures
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (p.proname like 'studio_%' or p.proname in ('is_admin','require_admin','validate_slot','availability','book_appointment','legacy_book_appointment','admin_appointments','admin_availability','edit_appointment','update_settings'))
and p.proname not in ('availability','book_appointment','studio_catalog','studio_availability','studio_book')
and has_function_privilege('anon',p.oid,'EXECUTE');

select 'public_schema_client_create' as check_name,count(*) as failures
from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated')
and has_schema_privilege(r.oid,'public','CREATE');
