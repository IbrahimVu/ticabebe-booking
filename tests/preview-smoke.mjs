import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {addDays,vnDate} from '../public/booking.mjs';
let browser;
try{browser=await chromium.launch({headless:true});}catch{browser=await chromium.launch({channel:'msedge',headless:true});}
const context=await browser.newContext({offline:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.url().startsWith('http'))requests.push(r.url());});
const tomorrow=addDays(vnDate(),1);
try {
  await page.goto(new URL('../TiCaBeBe-xem-thu.html',import.meta.url).href);
  await page.locator('#date').waitFor();
  assert.ok((await page.locator('#slots').boundingBox()).y<440,'Khách thấy bộ chọn giờ ngay trên màn hình đầu');
  await page.locator('#date').fill(tomorrow);await page.locator('#date').dispatchEvent('change');
  await page.locator('#slots .slot').first().waitFor();
  assert.equal(await page.getByRole('button',{name:'15:00',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'15:45',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'16:00',exact:true}).count(),1);
  await page.getByRole('button',{name:'12:00',exact:true}).click();
  await page.locator('[name=name]').fill('Khách xem thử');await page.locator('[name=phone]').fill('0901234567');await page.locator('#confirm').click();
  await page.getByText('Đặt lịch thành công!',{exact:true}).waitFor();
  await page.reload();await page.locator('#date').fill(tomorrow);await page.locator('#date').dispatchEvent('change');await page.locator('#slots .slot').first().waitFor();
  assert.equal(await page.getByRole('button',{name:'12:00',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'12:45',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'13:00',exact:true}).count(),1);
  await page.getByRole('link',{name:'Quản trị'}).click();await page.locator('[name=id]').fill('admin');await page.locator('[name=password]').fill('admin123');await page.locator('#login button').click();await page.locator('#admin-date').waitFor();
  await page.locator('#admin-date').fill(tomorrow);await page.locator('#admin-date').dispatchEvent('change');
  assert.ok((await page.locator('#appointments').boundingBox()).y<400,'Danh sách lịch admin không bị các section phụ đẩy xuống');
  const row=()=>page.locator('.appointment').filter({hasText:'Khách xem thử'});
  await row().getByRole('button').click();
  assert.equal(await page.locator('#edit-form input[type=time]').count(),0);
  await page.locator('#change-time').click();await page.locator('[data-edit-slot]').first().waitFor();
  // Lịch đang sửa không được tự chặn chính nó; lịch 15:00 của khách khác vẫn giữ đến 16:00.
  assert.equal(await page.locator('[data-edit-slot="12:00"]').count(),1);
  for(const time of ['14:15','14:30','14:45','15:00','15:15','15:30','15:45'])assert.equal(await page.locator(`[data-edit-slot="${time}"]`).count(),0,time);
  assert.equal(await page.locator('[data-edit-slot="16:00"]').count(),1);
  assert.ok(await page.locator('#save-edit').isDisabled());
  assert.equal(await page.locator('#edit-day').getAttribute('min'),vnDate());
  assert.equal(await page.locator('#edit-day').getAttribute('max'),addDays(vnDate(),30));
  // Ngày khác nằm ngoài danh sách ngày hiện tại cũng phải đọc đủ lịch bận.
  await page.locator('#edit-day').fill(addDays(tomorrow,2));await page.locator('#edit-day').dispatchEvent('change');await page.locator('[data-edit-slot]').first().waitFor();
  assert.equal(await page.locator('[data-edit-slot="15:00"]').count(),0);
  await page.locator('#edit-day').fill(tomorrow);await page.locator('#edit-day').dispatchEvent('change');await page.locator('[data-edit-slot="13:00"]').waitFor();
  await page.locator('[data-edit-slot="13:00"]').click();
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await page.screenshot({path:new URL('../test-results/edit-mobile.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});
  await page.locator('#save-edit').click();await page.getByText('Đã cập nhật lịch hẹn.',{exact:true}).waitFor();assert.ok((await row().textContent()).includes('13:00'));
  // Có lịch mới chen vào sau khi mở bộ chọn: lưu phải từ chối và cập nhật lại giờ trống.
  await row().getByRole('button').click();await page.locator('#change-time').click();await page.locator('[data-edit-slot="12:00"]').click();
  await page.evaluate(date=>{
    const key='ticabebe-preview-data-v1',data=JSON.parse(localStorage.getItem(key));const start=Date.parse(`${date}T12:00:00+07:00`);
    data.appointments.push({id:crypto.randomUUID(),customer_name:'Khách mới đồng thời',phone:'0900000003',starts_at:new Date(start).toISOString(),ends_at:new Date(start+45*60000).toISOString(),blocked_until:new Date(start+60*60000).toISOString(),status:'confirmed'});
    localStorage.setItem(key,JSON.stringify(data));
  },tomorrow);
  await page.locator('#save-edit').click();await page.locator('#edit-error').filter({hasText:'Giờ này vừa có khách đặt'}).waitFor();
  assert.equal(await page.locator('[data-edit-slot="12:00"]').count(),0);assert.ok(await page.locator('#save-edit').isDisabled());
  await page.locator('#close-dialog').click();
  await row().getByRole('button').click();page.once('dialog',d=>d.accept());await page.locator('#cancel').click();await page.getByText('Đã hủy lịch hẹn.',{exact:true}).waitFor();assert.ok((await row().textContent()).includes('Đã hủy'));
  await page.getByRole('button',{name:'Tuần',exact:true}).click();await page.locator('.day-group').nth(6).waitFor();
  await page.getByRole('button',{name:'Tháng',exact:true}).click();await page.locator('.month-grid').waitFor();assert.equal(await page.locator('.calendar-cell').count(),42);
  await page.locator(`[data-calendar-day="${tomorrow}"]`).click();await page.locator('#month-details .appointment').first().waitFor();
  await page.screenshot({path:new URL('../test-results/calendar-mobile.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});
  assert.ok(!await page.locator('#settings-dialog').isVisible());
  await page.locator('#open-settings').click();await page.locator('#settings [name=duration_minutes]').fill('60');await page.getByRole('button',{name:'Lưu cấu hình'}).click();await page.getByText('Đã lưu cấu hình lịch cắt.',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Đặt lịch',exact:true}).click();await page.locator('.badge').waitFor();assert.ok((await page.locator('.badge').textContent()).includes('60 phút'));
  for(const width of [320,360,390,430,768]){
    await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`tràn ngang ở ${width}px`);
    assert.ok(await page.locator('[name=phone]').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
    assert.ok((await page.locator('#slots .slot').first().boundingBox()).height>=44);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:new URL('../test-results/booking-mobile-v2.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'),fullPage:true});
  await page.locator('.preview-banner summary').click();page.once('dialog',d=>d.accept());await page.locator('#reset-preview').click();await page.locator('#booking-form').waitFor();assert.ok((await page.locator('.badge').textContent()).includes('45 phút'));
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log('PASS: HTML mở bằng file:// khi offline; đặt lịch, lưu sau tải lại, giữ giờ 45+15, admin, sửa/hủy, ngày/tuần/tháng, cấu hình, khôi phục và giao diện điện thoại.');
} finally {await browser.close();}
