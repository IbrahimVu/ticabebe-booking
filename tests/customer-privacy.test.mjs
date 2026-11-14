import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('migration giữ lịch cũ và đóng các đường quét thông tin khách',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(await readFile(new URL('fixtures/schema-before-privacy.sql',import.meta.url),'utf8'));
  const {rows:[{day}]}=await db.query(`select ((now() at time zone 'Asia/Ho_Chi_Minh')::date+1)::text as day`);
  const start=`${day}T15:00:00+07:00`;
  const {rows:[{receipt}]}=await db.query("select public.book_appointment('Khách được bảo vệ','0901234567',$1::timestamptz) as receipt",[start]);
  const admin='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
  await db.query('insert into auth.users values($1),($2)',[admin,other]);
  await db.query('insert into public.admin_users values($1)',[admin]);
  await db.exec(await readFile(new URL('../supabase/migrations/20261114_01_prepare_private_api.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261114_02_customer_privacy.sql',import.meta.url),'utf8'));
  const list=()=>db.query('select * from public.admin_appointments($1::date,$1::date+1)',[day]);

  await t.test('không xóa/mất dữ liệu và quyền admin khi đổi schema',async()=>{
    const {rows:[a]}=await db.query('select * from booking_private.appointments where id=$1',[receipt.id]);
    assert.equal(a.customer_name,'Khách được bảo vệ');assert.equal(a.phone,'0901234567');
    assert.equal((await db.query('select count(*)::int as n from booking_private.admin_users')).rows[0].n,1);
    const {rows:[r]}=await db.query("select to_regclass('public.appointments') as appointments,to_regclass('public.admin_users') as admins");
    assert.equal(r.appointments,null);assert.equal(r.admins,null);
  });
  await db.exec('set role anon');
  await t.test('khách không thể đọc bảng private hoặc tự dùng API quản trị',async()=>{
    await assert.rejects(db.query('select * from booking_private.appointments'),/permission denied/);
    await assert.rejects(db.query('select * from booking_private.admin_users'),/permission denied/);
    await assert.rejects(list(),/permission denied/);
    await assert.rejects(db.query('select * from public.admin_availability($1::date,$2::uuid)',[day,receipt.id]),/permission denied/);
    await assert.rejects(db.query("select public.edit_appointment($1,'X','0901234567',$2,true)",[receipt.id,start]),/permission denied/);
  });
  await t.test('quét availability chỉ trả giờ bận, không trả tên/điện thoại/UUID',async()=>{
    const {rows}=await db.query('select * from public.availability($1::date)',[day]);
    assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),['blocked_until','starts_at']);
    assert.ok(!JSON.stringify(rows).includes('0901234567'));assert.ok(!JSON.stringify(rows).includes(receipt.id));
  });
  await t.test('submit chỉ trả receipt tối thiểu; lỗi không phản chiếu dữ liệu cá nhân',async()=>{
    const {rows:[{r}]}=await db.query("select public.book_appointment('Khách mới','0909999999',$1::timestamptz) as r",[`${day}T13:00:00+07:00`]);
    assert.deepEqual(Object.keys(r).sort(),['ends_at','id','starts_at']);
    assert.ok(!JSON.stringify(r).includes('0909999999'));
    await assert.rejects(db.query("select public.book_appointment('SENSITIVE_NAME','SENSITIVE_PHONE',$1::timestamptz)",[`${day}T09:00:00+07:00`]),e=>e.message==='INVALID_CUSTOMER'&&!String(e.detail).includes('SENSITIVE'));
    await assert.rejects(db.query("select public.book_appointment('Tên quét','0900000000',$1::timestamptz)",[start]),e=>e.message==='SLOT_TAKEN'&&!String(e.detail).includes('0901234567'));
  });
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  await t.test('đăng nhập thường và biết UUID vẫn không đọc/sửa được lịch',async()=>{
    await assert.rejects(list(),/NOT_ADMIN/);
    await assert.rejects(db.query('select * from public.admin_availability($1::date,$2::uuid)',[day,receipt.id]),/NOT_ADMIN/);
    await assert.rejects(db.query("select public.edit_appointment($1,'Tên quét','0900000000',$2,true)",[receipt.id,start]),/NOT_ADMIN/);
    await assert.rejects(db.query('select * from booking_private.appointments where id=$1',[receipt.id]),/permission denied/);
  });
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  await t.test('admin hợp lệ đọc được qua RPC, không đọc trực tiếp bảng',async()=>{
    const {rows}=await list();assert.equal(rows.length,2);assert.equal(rows.find(a=>a.id===receipt.id).phone,'0901234567');
    await assert.rejects(db.query('select * from booking_private.appointments'),/permission denied/);
    const {rows:busy}=await db.query('select * from public.admin_availability($1::date,$2::uuid)',[day,receipt.id]);assert.equal(busy.length,1);
    await assert.rejects(db.query("select * from public.admin_appointments('2026-01-01','2027-01-01')"),/INVALID_RANGE/);
  });
});
