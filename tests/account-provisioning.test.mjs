import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('Auth + hồ sơ nhân sự cùng transaction, chỉ admin cấp quyền',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 const admin='11111111-1111-1111-1111-111111111111',manager='22222222-2222-2222-2222-222222222222';
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text unique,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users(id,email) values($1,\'admin@example.com\'),($2,\'manager@example.com\')',[admin,manager]);await db.query('insert into booking_private.admin_users values($1)',[admin]);
 for(const name of ['20261121_01_team_services.sql','20261121_02_security_hardening.sql','20261121_03_admin_account_creation.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.query("insert into booking_private.staff(user_id,name,role) values($1,'Quản lý','manager')",[manager]);
 const payload=(actor=admin,role='barber')=>({ticabebe_staff:{actor_id:actor,name:'Nhân sự mới',role,active:true,bookable:true}});
 const add=(id,metadata,userData={})=>db.query('insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values($1,$2,$3,$4)',[id,id+'@example.com',metadata,userData]);
 await t.test('admin tạo thợ và admin mới có đủ hồ sơ ngay khi Auth insert xong',async()=>{
   await add('33333333-3333-3333-3333-333333333333',payload());
   assert.equal((await db.query("select role from booking_private.staff where user_id='33333333-3333-3333-3333-333333333333'")).rows[0].role,'barber');
   await add('44444444-4444-4444-4444-444444444444',payload(admin,'admin'));
   assert.equal((await db.query("select count(*)::int as n from booking_private.admin_users where user_id='44444444-4444-4444-4444-444444444444'")).rows[0].n,1);
 });
 await t.test('quản lý hoặc admin vừa bị khóa không tạo được cả Auth lẫn hồ sơ',async()=>{
   const id='55555555-5555-5555-5555-555555555555';await assert.rejects(add(id,payload(manager)),/PROVISION_FORBIDDEN/);
   assert.equal((await db.query('select count(*)::int as n from auth.users where id=$1',[id])).rows[0].n,0);
   await db.query('update booking_private.staff set active=false where user_id=$1',[admin]);await assert.rejects(add(id,payload()),/PROVISION_FORBIDDEN/);
   await db.query('update booking_private.staff set active=true where user_id=$1',[admin]);
 });
 await t.test('user_metadata không được dùng để tự cấp admin; Auth tạo thủ công vẫn hoạt động',async()=>{
   const id='66666666-6666-6666-6666-666666666666';await add(id,{},payload(admin,'admin'));
   assert.equal((await db.query('select count(*)::int as n from booking_private.staff where user_id=$1',[id])).rows[0].n,0);
 });
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[manager]);
 await t.test('client không thể gọi trigger hoặc tự ghi Auth; readiness chỉ dành admin',async()=>{
   await assert.rejects(db.exec('select public.studio_account_creation_ready()'),/FORBIDDEN/);
   await assert.rejects(add('77777777-7777-7777-7777-777777777777',payload()),/permission denied/);
   await assert.rejects(db.exec('select booking_private.provision_auth_staff()'),/permission denied/);
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);assert.equal((await db.query('select public.studio_account_creation_ready() as ready')).rows[0].ready,true);
 });
});
