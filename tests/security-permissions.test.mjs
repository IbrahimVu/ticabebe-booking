import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('siết quyền API cũ, ACL tương lai và hồ sơ admin bị khóa',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 const uid='11111111-1111-1111-1111-111111111111';
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 await db.query("insert into auth.users values($1,'admin@example.com');",[uid]);
 await db.query('insert into booking_private.admin_users values($1)',[uid]);
 for(const file of ['20261121_01_team_services.sql','20261121_02_security_hardening.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 // Migration bảo mật có thể chạy lại mà không tạo thêm dữ liệu/quyền.
 await db.exec(await readFile(new URL('../supabase/migrations/20261121_02_security_hardening.sql',import.meta.url),'utf8'));
 const {rows:[{day}]}=await db.query("select ((now() at time zone 'Asia/Ho_Chi_Minh')::date+1)::text as day");
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 await t.test('admin dùng API mới nhưng không gọi được API quản trị/legacy dư thừa',async()=>{
   assert.equal((await db.query('select public.studio_profile() as p')).rows[0].p.role,'admin');
   for(const sql of ["select * from public.admin_appointments(current_date,current_date+1)","select * from public.admin_availability(current_date,null)","select public.edit_appointment(gen_random_uuid(),'Test','0901234567',now(),true)","select public.update_settings('Test','09:00','20:00',45,15,30,'{}')","select public.legacy_book_appointment('Test','0901234567',now())"]){await assert.rejects(db.exec(sql),/permission denied/);}
   await db.query('select public.studio_service_save(null,$1,45,15,true)',['Dịch vụ thử']);
 });
 await db.exec('reset role');
 await db.exec("update booking_private.staff set active=false where id=1");
 await db.exec('set role authenticated');
 await t.test('admin_users còn bản ghi cũng không cho hồ sơ đã khóa vượt quyền',async()=>{
   assert.equal((await db.query('select public.is_admin() as ok')).rows[0].ok,false);
   await assert.rejects(db.exec('select public.studio_management()'),/NOT_STAFF/);
   await assert.rejects(db.exec("select public.studio_settings('Test','09:00','20:00',30,'{}')"),/NOT_STAFF/);
 });
 await db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");
 await t.test('khách không quét lịch nhân sự bị khóa hoặc không nhận dịch vụ',async()=>{
   await assert.rejects(db.query('select * from public.studio_availability($1::date,1)',[day]),/OFFER_UNAVAILABLE/);
   await assert.rejects(db.query('select * from public.studio_availability($1::date,null)',[day]),/OFFER_UNAVAILABLE/);
   await assert.rejects(db.exec('select * from booking_private.staff'),/permission denied/);
 });
 await db.exec('reset role');
 await t.test('bảng/hàm mới không tự được cấp quyền cho client',async()=>{
   await db.exec("create function public.security_future_probe() returns text language sql as $$select 'private'$$;create table booking_private.security_future_probe(secret text)");
   for(const role of ['anon','authenticated']){
     const {rows:[r]}=await db.query("select has_function_privilege($1,'public.security_future_probe()','execute') as f,has_table_privilege($1,'booking_private.security_future_probe','select') as t,has_schema_privilege($1,'public','create') as c",[role]);
     assert.deepEqual(r,{f:false,t:false,c:false});
   }
 });
});
