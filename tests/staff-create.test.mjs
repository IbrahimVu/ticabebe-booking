import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStaffHandler} from '../supabase/functions/staff-create/index.ts';
const origin='https://ulhipapekijwwhylsafq.supabase.co';
const valid={name:'Thợ mới',email:'new@example.com',password:'Test1234',role:'barber',active:true,bookable:true};
function setup({user=true,role='admin',ready=true,createStatus=200,createBody={id:'new-id'},throwCreate=false}={}){
 const calls=[];
 const handler=createStaffHandler({env:name=>({SUPABASE_URL:origin,SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'public-test'}),SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_test'})})[name],fetcher:async(url,options)=>{
   calls.push({url,options});let data,status=200;
   if(url.endsWith('/auth/v1/user')){data=user?{id:'11111111-1111-1111-1111-111111111111'}:{};status=user?200:401;}
   else if(url.endsWith('/studio_profile'))data={role};
   else if(url.endsWith('/studio_account_creation_ready'))data=ready;
   else if(url.endsWith('/auth/v1/admin/users')){if(throwCreate)throw new Error('do not echo credentials');data=createBody;status=createStatus;}
   else throw new Error('Unexpected backend path');
   return new Response(JSON.stringify(data),{status});
 }});
 const send=(body=valid,{token='user-token',origin='https://ibrahimvu.github.io',method='POST'}={})=>handler(new Request('https://edge.test/staff-create',{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})}));
 return {calls,send};
}
test('không đăng nhập/tài khoản thường/quản lý không tạo Auth user',async()=>{
 let x=setup();assert.equal((await x.send(valid,{token:''})).status,401);assert.equal(x.calls.length,0);
 x=setup({user:false});assert.equal((await x.send()).status,401);assert.equal(x.calls.length,1);
 for(const role of ['manager','barber',undefined]){x=setup({role:role||'none'});assert.equal((await x.send({...valid,role:'admin'})).status,403);assert.ok(!x.calls.some(c=>c.url.includes('/admin/users')));}
});
test('chưa có trigger hoặc origin lạ thì không tạo tài khoản',async()=>{
 let x=setup({ready:false});assert.equal((await x.send()).status,503);assert.ok(!x.calls.some(c=>c.url.includes('/admin/users')));
 x=setup();assert.equal((await x.send(valid,{origin:'https://attacker.example'})).status,403);assert.equal(x.calls.length,0);
 assert.equal((await x.send(valid,{method:'OPTIONS',token:''})).status,204);
});
test('admin gửi mật khẩu chỉ tới Auth Admin API, trả receipt tối thiểu',async()=>{
 const x=setup(),r=await x.send({...valid,email:' New@Example.com '});assert.equal(r.status,201);assert.deepEqual(await r.json(),{created:true});
 assert.equal(r.headers.get('cache-control'),'no-store');
 const create=x.calls.find(c=>c.url.endsWith('/admin/users'));assert.ok(create);const payload=JSON.parse(create.options.body);
 assert.equal(payload.email,'new@example.com');assert.equal(payload.password,valid.password);assert.equal(payload.email_confirm,true);
 assert.equal(payload.app_metadata.ticabebe_staff.actor_id,'11111111-1111-1111-1111-111111111111');
 assert.equal(payload.app_metadata.ticabebe_staff.role,'barber');
 for(const c of x.calls){assert.equal(c.options.redirect,'error');if(c!==create){assert.ok(!String(c.options.body).includes(valid.password));assert.equal(c.options.headers.Authorization,'Bearer user-token');assert.equal(c.options.headers.apikey,'public-test');}}
 assert.equal(create.options.headers.apikey,'sb_secret_test');assert.equal(create.options.headers.Authorization,undefined);
});
test('đầu vào sai hoặc mật khẩu yếu không chạm Auth Admin API',async()=>{
 for(const body of [{...valid,password:'Test123'},{...valid,email:'bad'},{...valid,role:'owner'},{...valid,role:'admin',active:false},{...valid,actor_id:'forged'},{...valid,password:'x'.repeat(9000)}]){
   const x=setup(),r=await x.send(body);assert.ok([400,413].includes(r.status));assert.ok(!x.calls.some(c=>c.url.includes('/admin/users')));assert.ok(!(await r.text()).includes(body.password));
 }
});
test('email tồn tại không bị đổi mật khẩu; lỗi không phản chiếu credential',async()=>{
 let x=setup({createStatus:422,createBody:{code:'email_exists',message:valid.password}});let r=await x.send();assert.equal(r.status,409);assert.deepEqual(await r.json(),{code:'EMAIL_EXISTS'});
 assert.ok(x.calls.every(c=>c.options.method!=='PUT'&&c.options.method!=='DELETE'));
 x=setup({createStatus:500,createBody:{message:valid.password,detail:'internal'}});r=await x.send();assert.deepEqual(await r.json(),{code:'ACCOUNT_CREATE_FAILED'});
 x=setup({throwCreate:true});r=await x.send();assert.deepEqual(await r.json(),{code:'CREATION_UNCERTAIN'});
});
