// Các tình huống phản hồi chậm từng có thể khôi phục phiên/hiển thị PII cũ.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {vnDate} from '../public/booking.mjs';
let browser;try{browser=await chromium.launch({headless:true});}catch{browser=await chromium.launch({channel:'msedge',headless:true});}
const base=process.env.TEST_URL||'http://127.0.0.1:4173',origin='https://ulhipapekijwwhylsafq.supabase.co',now=Date.now();
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settings={studio_version:2,id:1,shop_name:'TiCaBeBe',open_time:'09:00',close_time:'20:00',duration_minutes:45,buffer_minutes:15,booking_days:30,closed_days:[]};
const appointment={id:'11111111-1111-1111-1111-111111111111',customer_name:'PRIVATE_CUSTOMER',phone:'0901234567',staff_id:1,service_id:1,staff_name:'Thợ thử',service_name:'Cắt tóc',price:80000,status:'confirmed',progress:'scheduled',starts_at:`${vnDate()}T10:00:00+07:00`,ends_at:`${vnDate()}T10:45:00+07:00`,blocked_until:`${vnDate()}T11:00:00+07:00`};
async function setup({seed=true,expired=false,idle=false}={}){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],revoked=[];
 const state={listGate:null,refreshGate:null,loginGate:null,denied:false,apiCalls:0};
 page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(now)});
 if(seed)await page.addInitScript(({now,expired,idle})=>{if(!sessionStorage.getItem('test-seeded')){sessionStorage.setItem('test-seeded','yes');sessionStorage.setItem('ticabebe-session',JSON.stringify({version:1,lastActive:now-(idle?29*60000:0),session:{access_token:'old-token',refresh_token:'old-refresh',expires_at:now/1000+(expired?10:120)}}));}},{now,expired,idle});
 await page.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:`window.APP_CONFIG=${JSON.stringify({supabaseUrl:origin,supabaseKey:'sb_publishable_test',adminId:'admin',adminEmail:'admin@example.com'})}`}));
 await page.route(origin+'/**',async route=>{
   state.apiCalls++;
   const req=route.request(),u=new URL(req.url()),name=u.pathname.split('/').at(-1),token=req.headers().authorization;let body=null,status=200;
   if(name==='settings')body=[settings];
   else if(name==='studio_catalog')body={version:2,enabled:true,offers:[{staff_id:1,staff_name:'Thợ thử',service_id:1,service_name:'Cắt tóc',duration_minutes:45,buffer_minutes:15,price:80000}]};
   else if(name==='token'){
     if(u.searchParams.get('grant_type')==='refresh_token'){if(state.refreshGate){state.refreshGate.seen.resolve();await state.refreshGate.release.promise;}body={access_token:'refreshed-token',refresh_token:'refreshed-refresh',expires_at:now/1000+7200};}
     else{if(state.loginGate){state.loginGate.seen.resolve();await state.loginGate.release.promise;}body={access_token:'new-token',refresh_token:'new-refresh',expires_at:now/1000+7200};}
   }else if(name==='studio_profile'){
     if(state.denied){status=400;body={message:'NOT_STAFF'};}else body={id:token==='Bearer new-token'?2:1,role:'barber',name:'Thợ thử'};
   }else if(name==='studio_appointments'){
     if(state.listGate&&token==='Bearer old-token'){state.listGate.seen.resolve();await state.listGate.release.promise;}
     body=token==='Bearer new-token'?[]:[appointment];
   }else if(name==='logout')revoked.push(token);
   else if(name==='studio_availability')body=[];
   else throw new Error('Unexpected API '+name);
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'Access-Control-Allow-Origin':'*'}});
 });
 return {context,page,state,errors,revoked,close:async()=>{for(const key of ['listGate','refreshGate','loginGate'])state[key]?.release.resolve();await context.close();}};
}
const gate=()=>({seen:deferred(),release:deferred()});
try{
 // Phản hồi của tài khoản A không được hiển thị trên phiên B.
 let env=await setup();try{
   const {page,state}=env;await page.goto(base+'/#admin');await page.locator('[data-appointment]').waitFor();
   state.listGate=gate();await page.locator('#studio-refresh').click();await state.listGate.seen.promise;
   await page.locator('#studio-logout').click();await page.locator('#login').waitFor();
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('ticabebe-session')),null);assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE_CUSTOMER'));
   await page.locator('[name=id]').fill('other@example.com');await page.locator('[name=password]').fill('test-only');await page.locator('#login button').click();await page.locator('#studio-admin-day').waitFor();
   state.listGate.release.resolve();await page.clock.runFor(100);
   assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE_CUSTOMER'));
   assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ticabebe-session')).session.access_token),'new-token');assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
 // Refresh đến sau đăng xuất không được lưu lại token.
 env=await setup();try{
   const {page,state}=env;await page.goto(base+'/#admin');await page.locator('#studio-admin-day').waitFor();
   state.refreshGate=gate();await page.clock.fastForward(90000);await page.locator('#studio-refresh').click();await state.refreshGate.seen.promise;
   await page.locator('#studio-logout').click();await page.locator('#login').waitFor();state.refreshGate.release.resolve();
   await page.waitForRequest(r=>r.url().includes('/logout')&&r.headers().authorization==='Bearer refreshed-token');
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('ticabebe-session')),null);assert.equal(await page.locator('#studio-admin-day').count(),0);assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
 // Refresh tự động không kéo dài 30 phút idle.
 env=await setup({expired:true,idle:true});try{
   await env.page.goto(base+'/#admin');await env.page.locator('#studio-admin-day').waitFor();await env.page.clock.fastForward(70000);await env.page.locator('#login').waitFor();
   assert.equal(await env.page.evaluate(()=>sessionStorage.getItem('ticabebe-session')),null);assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
 // Rời màn hình đăng nhập khi request đang chờ không được tự đăng nhập sau đó.
 env=await setup({seed:false});try{
   const {page,state}=env;state.loginGate=gate();await page.goto(base+'/#admin');await page.locator('[name=id]').fill('other@example.com');await page.locator('[name=password]').fill('test-only');await page.locator('#login button').click();await state.loginGate.seen.promise;
   await page.getByRole('link',{name:'Đặt lịch',exact:true}).click();await page.locator('#studio-booking').waitFor();state.loginGate.release.resolve();
   await page.waitForRequest(r=>r.url().includes('/logout')&&r.headers().authorization==='Bearer new-token');
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('ticabebe-session')),null);assert.equal(await page.locator('#studio-booking').count(),1);assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
 // Quyền bị thu hồi: không giữ màn hình khách hoặc token trên tab.
 env=await setup();try{
   await env.page.goto(base+'/#admin');await env.page.locator('[data-appointment]').waitFor();env.state.denied=true;await env.page.reload();await env.page.locator('#login').waitFor();
   assert.equal(await env.page.evaluate(()=>sessionStorage.getItem('ticabebe-session')),null);assert.ok(!(await env.page.locator('body').innerText()).includes('PRIVATE_CUSTOMER'));assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
 // Nhúng website vào iframe không được tải API hay hiện dữ liệu khách.
 env=await setup();try{
   await env.page.route(base+'/frame-security',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><iframe src="${base}/#admin"></iframe>`}));
   await env.page.goto(base+'/frame-security');await env.page.frameLocator('iframe').getByText('Vui lòng mở website trực tiếp, không qua khung nhúng.').waitFor();
   assert.equal(env.state.apiCalls,0);assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
 console.log('PASS: delayed responses, account switch, logout/refresh race, idle timeout, abandoned login, revoked staff and iframe block.');
}finally{await browser.close();}
