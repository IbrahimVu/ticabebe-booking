// Kiểm tra giao diện với API giả; DB được kiểm tra riêng trong database.test.mjs.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {vnDate,addDays} from '../public/booking.mjs';
const base=process.env.TEST_URL||'http://127.0.0.1:4173';
let browser;
try{browser=await chromium.launch({headless:true});}catch{browser=await chromium.launch({channel:'msedge',headless:true});}
const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const tomorrow=addDays(vnDate(),1);
let bookings=[],rejectNext=false;
let settings={id:1,shop_name:'TiCaBeBe',open_time:'09:00:00',close_time:'20:00:00',duration_minutes:45,buffer_minutes:15,booking_days:30,closed_days:[]};
await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
try{
  await page.goto(base);await page.locator('#booking-form').waitFor();
  assert.ok(await page.locator('#confirm').isDisabled());
  await page.screenshot({path:new URL('../test-results/unconfigured.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});
  await page.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:`window.APP_CONFIG=${JSON.stringify({supabaseUrl:'https://ulhipapekijwwhylsafq.supabase.co',supabaseKey:'sb_publishable_test',adminId:'admin',adminEmail:'owner@example.com'})}`}));
  await page.route('https://ulhipapekijwwhylsafq.supabase.co/**',async r=>{
    const req=r.request(),u=new URL(req.url()),data=req.postDataJSON();
    let body=null,status=200;
    if(u.pathname.endsWith('/settings'))body=[settings];
    else if(u.pathname.endsWith('/availability'))body=bookings.filter(a=>a.status==='confirmed').map(({starts_at,blocked_until})=>({starts_at,blocked_until}));
    else if(u.pathname.endsWith('/book_appointment')){
      if(rejectNext){rejectNext=false;status=400;body={message:'SLOT_TAKEN'};}
      else{const start=Date.parse(data.p_start);const a={id:'11111111-1111-1111-1111-111111111111',customer_name:data.p_name,phone:data.p_phone,starts_at:new Date(start).toISOString(),ends_at:new Date(start+45*60000).toISOString(),blocked_until:new Date(start+60*60000).toISOString(),status:'confirmed'};bookings.push(a);body={id:a.id,starts_at:a.starts_at,ends_at:a.ends_at};}
    }else if(u.pathname.endsWith('/token'))body={access_token:'test-token',refresh_token:'refresh',expires_at:Math.floor(Date.now()/1000)+3600};
    else if(u.pathname.endsWith('/require_admin'))body=true;
    else if(u.pathname.endsWith('/admin_appointments'))body=bookings;
    else if(u.pathname.endsWith('/admin_availability'))body=bookings.filter(a=>a.id!==data.p_exclude&&a.status==='confirmed').map(({starts_at,blocked_until})=>({starts_at,blocked_until}));
    else if(u.pathname.endsWith('/edit_appointment')){const a=bookings.find(a=>a.id===data.p_id);a.customer_name=data.p_name;a.phone=data.p_phone;if(data.p_cancel)a.status='cancelled';else{a.starts_at=data.p_start;a.ends_at=new Date(Date.parse(data.p_start)+45*60000).toISOString();a.blocked_until=new Date(Date.parse(data.p_start)+60*60000).toISOString();}}
    else if(u.pathname.endsWith('/update_settings'))settings={...settings,duration_minutes:data.p_duration,buffer_minutes:data.p_buffer};
    else if(u.pathname.endsWith('/logout'))body=null;
    else throw new Error('Unexpected URL '+u);
    await r.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await page.reload();await page.locator('#date').fill(tomorrow);await page.locator('#date').dispatchEvent('change');await page.getByRole('button',{name:'15:00',exact:true}).click();
  await page.locator('[name=name]').fill('Nguyễn Minh Anh');await page.locator('[name=phone]').fill('0901234567');
  rejectNext=true;await page.locator('#confirm').click();await page.getByText('Giờ này vừa có khách đặt.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'15:00',exact:true}).click();
  await page.screenshot({path:new URL('../test-results/booking-desktop.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});
  await page.locator('#confirm').click();await page.getByText('Đặt lịch thành công!',{exact:true}).waitFor();assert.equal(bookings.length,1);
  await page.locator('#again').click();await page.locator('#slots .slot').first().waitFor();assert.equal(await page.getByRole('button',{name:'15:00',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'15:45',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'16:00',exact:true}).count(),1);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('../test-results/booking-mobile.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('link',{name:'Quản trị'}).click();await page.locator('[name=id]').fill('admin');await page.locator('[name=password]').fill('test-password');await page.locator('#login button').click();await page.locator('#admin-date').waitFor();
  await page.locator('#admin-date').fill(tomorrow);await page.locator('#admin-date').dispatchEvent('change');await page.getByRole('button',{name:'Chi tiết ↗'}).waitFor();
  await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:new URL('../test-results/admin-desktop.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});
  await page.getByRole('button',{name:'Tuần',exact:true}).click();await page.locator('.day-group').nth(6).waitFor();
  await page.getByRole('button',{name:'Tháng',exact:true}).click();await page.locator('.month-grid').waitFor();assert.equal(await page.locator('.calendar-cell').count(),42);
  await page.locator(`[data-calendar-day="${tomorrow}"]`).click();await page.locator('#month-details [data-edit]').click();await page.locator('#edit-form [name=name]').fill('Khách đã sửa');await page.getByRole('button',{name:'Lưu thay đổi'}).click();await page.getByText('Đã cập nhật lịch hẹn.',{exact:true}).waitFor();assert.equal(bookings[0].customer_name,'Khách đã sửa');
  await page.locator('#open-settings').click();await page.locator('#settings [name=duration_minutes]').fill('60');await page.getByRole('button',{name:'Lưu cấu hình'}).click();await page.getByText('Đã lưu cấu hình lịch cắt.',{exact:true}).waitFor();assert.equal(settings.duration_minutes,60);
  await page.locator('#month-details [data-edit]').click();page.once('dialog',d=>d.accept());await page.locator('#cancel').click();await page.getByText('Đã hủy lịch hẹn.',{exact:true}).waitFor();assert.equal(bookings[0].status,'cancelled');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:new URL('../test-results/admin-mobile.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});
  assert.equal(await page.evaluate(()=>{window.__inlineSecurityTest=false;const script=document.createElement('script');script.textContent='window.__inlineSecurityTest=true';document.head.append(script);return window.__inlineSecurityTest;}),false,'CSP phải chặn script inline');
  let unexpectedConnection=false;
  await page.route('https://blocked.example/**',r=>{unexpectedConnection=true;return r.fulfill({status:200,body:'unexpected'});});
  assert.equal(await page.evaluate(()=>fetch('https://blocked.example/collect',{method:'POST',body:'test-only'}).then(()=>true).catch(()=>false)),false);
  assert.equal(unexpectedConnection,false,'CSP phải chặn request trước khi ra mạng');
  const storedSession=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ticabebe-session')));assert.equal(storedSession.version,1);assert.deepEqual(Object.keys(storedSession.session).sort(),['access_token','expires_at','refresh_token']);await page.evaluate(()=>{const key='ticabebe-session',r=JSON.parse(sessionStorage.getItem(key));r.lastActive=Date.now()-31*60*1000;sessionStorage.setItem(key,JSON.stringify(r));});await page.reload();await page.locator('#login').waitFor();assert.equal(await page.evaluate(()=>sessionStorage.getItem('ticabebe-session')),null);
  assert.deepEqual(errors,[]);console.log('PASS: giao diện máy tính/điện thoại, báo trùng giờ, xác nhận, giờ trống, đăng nhập admin, ngày/tuần/tháng, sửa/hủy và cấu hình.');
}finally{await browser.close();}
