import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {vnDate,addDays} from '../public/booking.mjs';
let browser;try{browser=await chromium.launch({headless:true});}catch{browser=await chromium.launch({channel:'msedge',headless:true});}
const page=await browser.newPage({viewport:{width:390,height:844},locale:'en-US'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const tomorrow=addDays(vnDate(),1),base=process.env.TEST_URL||'http://127.0.0.1:4173';
let role='admin',rows=[],offerPrice=80000,lastBody,conflict=false;
const settings={studio_version:2,id:1,shop_name:'TiCaBeBe',open_time:'09:00',close_time:'20:00',duration_minutes:45,buffer_minutes:15,booking_days:30,closed_days:[]};
const staff=[{id:1,name:'Chị Quản lý',role:'manager',email:'manager@example.com',active:true,bookable:true},{id:2,name:'Anh Thợ',role:'barber',email:'barber@example.com',active:true,bookable:true}];
const services=[{id:1,name:'Cắt tóc',duration_minutes:45,buffer_minutes:15,active:true},{id:2,name:'Gội đầu',duration_minutes:30,buffer_minutes:15,active:true}];
const offers=()=>services.flatMap(s=>staff.map(t=>({service_id:s.id,service_name:s.name,duration_minutes:s.duration_minutes,buffer_minutes:s.buffer_minutes,staff_id:t.id,staff_name:t.name,price:t.id===1?120000:offerPrice})));
await page.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:`window.APP_CONFIG=${JSON.stringify({supabaseUrl:'https://ulhipapekijwwhylsafq.supabase.co',supabaseKey:'sb_publishable_test',adminId:'admin',adminEmail:'owner@example.com'})}`}));
await page.route('https://ulhipapekijwwhylsafq.supabase.co/**',async route=>{
 const req=route.request(),u=new URL(req.url()),f=u.pathname.split('/').at(-1),d=req.postDataJSON();let body=null,status=200;
 if(f==='settings')body=[settings];
 else if(f==='studio_catalog')body={version:2,enabled:true,offers:offers()};
 else if(f==='studio_profile')body={id:role==='barber'?2:1,name:role==='barber'?'Anh Thợ':'Chủ tiệm',role};
 else if(f==='studio_availability')body=rows.filter(a=>a.staff_id===d.p_staff&&a.id!==d.p_exclude&&a.status==='confirmed'&&vnDate(new Date(a.starts_at))===d.p_day).map(({starts_at,blocked_until})=>({starts_at,blocked_until}));
 else if(f==='studio_book'){
   if(conflict){status=400;body={message:'SLOT_TAKEN'};conflict=false;}
   else{const o=offers().find(o=>o.staff_id===d.p_staff&&o.service_id===d.p_service),start=Date.parse(d.p_start);lastBody=d;
   const a={id:crypto.randomUUID(),customer_name:d.p_name,phone:d.p_phone,starts_at:new Date(start).toISOString(),ends_at:new Date(start+o.duration_minutes*60000).toISOString(),blocked_until:new Date(start+(o.duration_minutes+o.buffer_minutes)*60000).toISOString(),staff_id:d.p_staff,service_id:d.p_service,staff_name:o.staff_name,service_name:o.service_name,price:o.price,status:'confirmed',progress:'scheduled'};rows.push(a);const {id,starts_at,ends_at,price,staff_name,service_name}=a;body={id,starts_at,ends_at,price,staff_name,service_name};}
 }else if(f==='token')body={access_token:'test',refresh_token:'refresh',expires_at:Date.now()/1000+3600};
 else if(f==='studio_appointments')body=rows.filter(a=>(role!=='barber'||a.staff_id===2)&&vnDate(new Date(a.starts_at))>=d.p_from&&vnDate(new Date(a.starts_at))<d.p_to);
 else if(f==='studio_management')body={enabled:true,staff,services,prices:offers().map(o=>({staff_id:o.staff_id,service_id:o.service_id,price:o.price,active:true}))};
 else if(f==='studio_price_save'){offerPrice=d.p_price;lastBody=d;}
 else if(f==='studio_service_save'){lastBody=d;body=3;}
 else if(f==='studio_staff_save'){lastBody=d;body=3;}
 else if(f==='studio_settings'){lastBody=d;}
 else if(f==='studio_edit'){lastBody=d;const a=rows.find(a=>a.id===d.p_id),delta=Date.parse(d.p_start)-Date.parse(a.starts_at);a.ends_at=new Date(Date.parse(a.ends_at)+delta).toISOString();a.blocked_until=new Date(Date.parse(a.blocked_until)+delta).toISOString();a.starts_at=d.p_start;a.customer_name=d.p_name;a.phone=d.p_phone;a.progress=d.p_progress;if(d.p_cancel)a.status='cancelled';}
 else if(f!=='logout')throw new Error('Unexpected API '+f);
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'Access-Control-Allow-Origin':'*'}});
});
async function screenshot(name){await mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/${name}.png`,fullPage:true});}
try{
 await page.goto(base);await page.locator('#studio-booking').waitFor();
 await page.locator('#studio-service').selectOption('2');await page.locator('#studio-person').selectOption('2');await page.locator('#studio-date').fill(tomorrow);
 await page.getByRole('button',{name:'10:00',exact:true}).click();await page.locator('[name=name]').fill('<Khách thử>');await page.locator('[name=phone]').fill('0901234567');
 conflict=true;await page.locator('#studio-submit').click();await page.getByText('Giờ này vừa có khách đặt.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'10:00',exact:true}).click();await screenshot('team-booking-mobile');
 await page.locator('#studio-submit').click();await page.getByText('Đặt lịch thành công',{exact:true}).waitFor();assert.equal(lastBody.p_price,80000);assert.equal(lastBody.p_staff,2);assert.equal(lastBody.p_service,2);assert.ok(await page.getByText('<Khách thử> · 0901234567',{exact:true}).isVisible());
 await page.locator('#studio-again').click();await page.locator('#studio-service').selectOption('2');await page.locator('#studio-person').selectOption('2');await page.locator('#studio-date').fill(tomorrow);await page.getByRole('button',{name:'10:45',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'10:15',exact:true}).count(),0);
 await page.locator('#studio-person').selectOption('1');await page.getByRole('button',{name:'10:00',exact:true}).waitFor();
 await page.getByRole('link',{name:'Quản trị'}).click();await page.locator('[name=id]').fill('admin');await page.locator('[name=password]').fill('test-only');await page.locator('#login button').click();await page.locator('#studio-admin-day').waitFor();
 await page.locator('#studio-admin-day').fill(tomorrow);await page.locator('[data-appointment]').click();await page.locator('#studio-change').click();await page.getByRole('button',{name:'10:45',exact:true}).click();await page.locator('#studio-edit [name=progress]').selectOption('serving');await page.locator('#studio-save').click();await page.locator('#studio-dialog').waitFor({state:'hidden'});assert.ok(lastBody.p_start.includes('10:45'));assert.equal(lastBody.p_progress,'serving');
 await page.locator('#studio-manage').click();await page.locator('[data-tab=prices]').click();await page.locator('#studio-price-form [name=staff]').selectOption('2');await page.locator('#studio-price-form [name=price]').fill('95000');await page.getByRole('button',{name:'Lưu giá',exact:true}).click();await page.getByText('Đã lưu.',{exact:true}).waitFor();assert.equal(lastBody.p_price,95000);
 await page.locator('[data-tab=staff]').click();await page.locator('#studio-staff-form [name=name]').fill('Nhân sự mới');await page.locator('#studio-staff-form [name=email]').fill('new@example.com');await page.locator('#studio-staff-form [name=role]').selectOption('manager');await page.getByRole('button',{name:'Lưu nhân sự'}).click();await page.getByText('Đã lưu.',{exact:true}).waitFor();assert.equal(lastBody.p_role,'manager');
 await page.locator('[data-tab=services]').click();await page.locator('#studio-service-form [name=name]').fill('Uốn tóc');await page.locator('#studio-service-form [name=duration]').fill('90');await page.getByRole('button',{name:'Lưu dịch vụ',exact:true}).click();await page.getByText('Đã lưu.',{exact:true}).waitFor();assert.equal(lastBody.p_duration,90);
 for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow '+width);assert.ok(await page.locator('#studio-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth),'dialog overflow '+width);}
 await screenshot('team-management-mobile');await page.locator('#studio-dialog [data-close]').click();await page.getByRole('button',{name:'Tháng',exact:true}).click();await page.locator('[data-appointment]').waitFor();await screenshot('team-calendar-mobile');
 role='barber';await page.reload();await page.locator('#studio-admin-day').waitFor();assert.equal(await page.locator('#studio-manage').count(),0);await page.locator('#studio-admin-day').fill(tomorrow);await page.locator('[data-appointment]').waitFor();await screenshot('team-barber-mobile');
 role='manager';await page.reload();await page.locator('#studio-manage').click();await page.locator('#studio-dialog').waitFor();assert.equal(await page.locator('[data-tab=staff]').count(),0);await page.locator('[data-tab=hours]').click();await page.locator('#studio-hours-form').waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: mobile services/provider booking, own schedule, editing, team roles, prices, services and hours.');
}catch(e){console.error('UI state:',await page.locator('body').innerText());console.error('Page errors:',errors);throw e;}finally{await browser.close();}
