import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('ma trận quyền toàn bộ chức năng nhân sự/lịch/dịch vụ',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 const ids={admin:'11111111-1111-1111-1111-111111111111',manager:'22222222-2222-2222-2222-222222222222',barber:'33333333-3333-3333-3333-333333333333',outsider:'44444444-4444-4444-4444-444444444444'};
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text unique,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 for(const [role,id] of Object.entries(ids))await db.query('insert into auth.users(id,email) values($1,$2)',[id,role+'@example.com']);
 await db.query('insert into booking_private.admin_users values($1)',[ids.admin]);
 for(const name of ['20261121_01_team_services.sql','20261121_02_security_hardening.sql','20261121_03_admin_account_creation.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.query("insert into booking_private.staff(user_id,name,role) values($1,'Quản lý','manager'),($2,'Thợ','barber')",[ids.manager,ids.barber]);
 await db.exec('update booking_private.prices set price=100000;insert into booking_private.prices values(2,1,120000,true),(3,1,80000,true);update booking_private.studio_state set enabled=true');
 const {rows:[{day}]}=await db.query("select ((now() at time zone 'Asia/Ho_Chi_Minh')::date+1)::text as day");
 const start=`${day}T10:00:00+07:00`;
 const own=(await db.query("select public.studio_book('Khách riêng','0901234567',$1,3,1,80000) as r",[start])).rows[0].r;
 const other=(await db.query("select public.studio_book('Khách khác','0907654321',$1,2,1,120000) as r",[start])).rows[0].r;
 const matrix=[
  {name:'profile',sql:'select public.studio_profile() as value',args:[],allow:['admin','manager','barber']},
  {name:'management',sql:'select public.studio_management() as value',args:[],allow:['admin','manager'],check:(r,role)=>{assert.equal(r.rows[0].value.staff.length,3);if(role==='manager')assert.ok(r.rows[0].value.staff.every(t=>t.email===null));}},
  {name:'read appointments',sql:'select * from public.studio_appointments($1::date,$1::date+1)',args:[day],allow:['admin','manager','barber'],check:(r,role)=>{assert.equal(r.rows.length,role==='barber'?1:2);if(role==='barber')assert.equal(r.rows[0].id,own.id);}},
  {name:'edit own/assigned booking',sql:'select public.studio_edit($1,null,null,null,true)',args:[own.id],allow:['admin','manager','barber']},
  {name:'edit another person booking',sql:'select public.studio_edit($1,null,null,null,true)',args:[other.id],allow:['admin','manager']},
  {name:'exclude own booking',sql:'select * from public.studio_availability($1::date,3,$2::uuid)',args:[day,own.id],allow:['admin','manager','barber']},
  {name:'exclude another booking',sql:'select * from public.studio_availability($1::date,2,$2::uuid)',args:[day,other.id],allow:['admin','manager']},
  {name:'assign role',sql:"select public.studio_staff_save(null,'Tài khoản thử','outsider@example.com','admin',true,false)",args:[],allow:['admin']},
  {name:'save service',sql:"select public.studio_service_save(null,'Dịch vụ thử',30,15,true)",args:[],allow:['admin','manager']},
  {name:'save price',sql:'select public.studio_price_save(3,1,90000,true)',args:[],allow:['admin','manager']},
  {name:'save hours',sql:"select public.studio_settings('TiCaBeBe','09:00','20:00',30,'{}')",args:[],allow:['admin','manager']},
  {name:'activate booking',sql:'select public.studio_activate()',args:[],allow:['admin']},
  {name:'account creation readiness',sql:'select public.studio_account_creation_ready()',args:[],allow:['admin']},
  {name:'obsolete admin API',sql:'select * from public.admin_appointments($1::date,$1::date+1)',args:[day],allow:[]},
 ];
 for(const role of ['anon','outsider','barber','manager','admin']){
   await t.test(role,async st=>{
     for(const operation of matrix){
       await st.test(operation.name,async()=>{
         await db.exec('begin');
         try{
           await db.exec('set local role '+(role==='anon'?'anon':'authenticated'));
           await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ids[role]||'']);
           if(operation.allow.includes(role)){const result=await db.query(operation.sql,operation.args);operation.check?.(result,role);}
           else await assert.rejects(db.query(operation.sql,operation.args),/permission denied|NOT_STAFF|FORBIDDEN/);
         }finally{await db.exec('rollback');}
       });
     }
   });
 }
 // Mọi lần ghi thử đều rollback, cả giá và 2 lịch mẫu không bị thay đổi.
 assert.equal((await db.query('select count(*)::int as n from booking_private.appointments where status=\'confirmed\'')).rows[0].n,2);
 const posture=await db.exec(await readFile(new URL('../supabase/audits/security-posture.sql',import.meta.url),'utf8'));
 for(const result of posture)for(const row of result.rows)assert.equal(Number(row.failures),0,row.check_name);
});
