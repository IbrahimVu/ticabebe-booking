import {slots,vnDate,addDays,rangeFor,formatDateVN} from './booking.mjs';
import {secureApiUrl,assertSecurePage,assertTopLevel,minimalSession,PRIVATE_FETCH,IDLE_TIMEOUT_MS} from './security.mjs';
import {launchStudio} from './studio.mjs';
const cfg=Object.freeze({...window.APP_CONFIG}), configured=Boolean(cfg.supabaseUrl&&cfg.supabaseKey);
const $=(s)=>document.querySelector(s), esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let settings={shop_name:'TiCaBeBe',open_time:'09:00',close_time:'20:00',duration_minutes:45,buffer_minutes:15,closed_days:[],booking_days:30};
let day=vnDate(), selected='', busy=[], session=null, view='day', adminDay=vnDate(), monthDay=vnDate(), appointments=[], timer, generation=0, bookingPending=false;
let lastActive=Date.now(),lastStored=0,refreshPromise=null,sessionEpoch=0;
try{
  const stored=JSON.parse(sessionStorage.getItem('ticabebe-session')||'null');
  if(stored?.version===1&&Number.isFinite(stored.lastActive)&&Date.now()-stored.lastActive>=0&&Date.now()-stored.lastActive<IDLE_TIMEOUT_MS){session=minimalSession(stored.session);lastActive=stored.lastActive;}
  if(!session)sessionStorage.removeItem('ticabebe-session');
}catch{}
const dateLabel=(d,opts)=>!opts?formatDateVN(d):opts.month&&opts.year&&!opts.day?`${d.slice(5,7)}/${d.slice(0,4)}`:new Intl.DateTimeFormat('vi-VN',{...opts,timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(`${d}T12:00:00+07:00`));
function syncDateDisplays(root=document){
  root.querySelectorAll('input[type="date"]').forEach(input=>{
    let wrapper=input.parentElement;
    if(!wrapper.classList.contains('vn-date-control')){
      wrapper=document.createElement('span');wrapper.className='vn-date-control';
      input.before(wrapper);wrapper.append(input);input.lang='vi-VN';
      const display=document.createElement('span');display.className='vn-date-display';display.setAttribute('aria-hidden','true');wrapper.append(display);
      const icon=document.createElement('span');icon.className='vn-date-icon';icon.setAttribute('aria-hidden','true');icon.textContent='▦';wrapper.append(icon);
      const update=()=>{display.textContent=formatDateVN(input.value)||'DD/MM/YYYY';};
      input.addEventListener('input',update);input.addEventListener('change',update);
      input.addEventListener('click',()=>{try{input.showPicker?.();}catch{}});
    }
    wrapper.querySelector('.vn-date-display').textContent=formatDateVN(input.value)||'DD/MM/YYYY';
  });
}
const timeLabel=(t)=>new Intl.DateTimeFormat('vi-VN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(t));
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',4000);}
function persistSession(){try{if(session)sessionStorage.setItem('ticabebe-session',JSON.stringify({version:1,session,lastActive}));else sessionStorage.removeItem('ticabebe-session');lastStored=Date.now();}catch{}}
function saveSession(value){sessionEpoch++;session=minimalSession(value);lastActive=Date.now();persistSession();}
async function revokeSessionTokens(value){
  if(!value?.access_token||!configured)return;
  try{await fetch(secureApiUrl(cfg.supabaseUrl,'/auth/v1/logout?scope=local'),{...PRIVATE_FETCH,method:'POST',headers:{apikey:cfg.supabaseKey,Authorization:`Bearer ${value.access_token}`},signal:AbortSignal.timeout(10000)});}catch{}
}
function endLocalSession(message){
  const previous=session;saveSession(null);appointments=[];generation++;
  document.dispatchEvent(new Event('ticabebe:route'));clearInterval(timer);
  if(location.hash==='#admin'){login();}
  if(message)toast(message);return previous;
}
function logoutSession(){const previous=endLocalSession('Đã đăng xuất.');void revokeSessionTokens(previous);}
function touchSession(){checkIdleSession();lastActive=Date.now();if(session&&lastActive-lastStored>5000)persistSession();}
document.addEventListener('pointerdown',touchSession,{passive:true});document.addEventListener('keydown',touchSession);
function checkIdleSession(){if(session&&Date.now()-lastActive>=IDLE_TIMEOUT_MS){const previous=endLocalSession('Đã đăng xuất sau 30 phút không hoạt động.');void revokeSessionTokens(previous);}}
setInterval(checkIdleSession,10000);
window.addEventListener('pageshow',checkIdleSession);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkIdleSession();});
async function request(path,{method='GET',body,auth=false}={}) {
  if(!configured)throw new Error('Ứng dụng chưa kết nối Supabase. Xem hướng dẫn cài đặt trong README.');
  assertTopLevel(window);assertSecurePage(location);
  const target=secureApiUrl(cfg.supabaseUrl,path);
  checkIdleSession();
  const epoch=sessionEpoch;
  if(auth&&!session)throw new Error('Vui lòng đăng nhập lại.');
  if(auth&&session?.expires_at<Date.now()/1000+60){
    if(!session.refresh_token){endLocalSession();throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');}
    if(!refreshPromise||refreshPromise.epoch!==epoch){
      const source=session.refresh_token,task={epoch,promise:null};
      task.promise=(async()=>{
        const r=await fetch(secureApiUrl(cfg.supabaseUrl,'/auth/v1/token?grant_type=refresh_token'),{...PRIVATE_FETCH,method:'POST',headers:{apikey:cfg.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:source})});
        const fresh=await r.json().catch(()=>null);
        if(epoch!==sessionEpoch||!session){if(r.ok)void revokeSessionTokens(fresh);throw new Error('Phiên đã kết thúc. Vui lòng đăng nhập lại.');}
        if(!r.ok||!minimalSession(fresh)){endLocalSession();throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');}
        session=minimalSession(fresh);persistSession();
      })().finally(()=>{if(refreshPromise===task)refreshPromise=null;});
      refreshPromise=task;
    }
    await refreshPromise.promise;
    checkIdleSession();
  }
  if(auth&&(epoch!==sessionEpoch||!session))throw new Error('Phiên đã kết thúc. Vui lòng đăng nhập lại.');
  const token=auth?session?.access_token:(cfg.supabaseKey.startsWith('sb_publishable_')?null:cfg.supabaseKey);
  const r=await fetch(target,{...PRIVATE_FETCH,method,headers:{apikey:cfg.supabaseKey,...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const data=await r.json().catch(()=>null);
  checkIdleSession();
  if(auth&&(epoch!==sessionEpoch||!session))throw new Error('Phiên đã kết thúc. Vui lòng đăng nhập lại.');
  if(auth&&(!r.ok&&(r.status===401||data?.message==='NOT_STAFF'||data?.message==='NOT_ADMIN')))endLocalSession(data?.message==='NOT_STAFF'?'Tài khoản chưa được cấp quyền hoặc đã bị khóa.':'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.');
  if(!r.ok){const msg=data?.message||data?.error_description||'';const messages={NOT_STAFF:'Tài khoản chưa được cấp quyền hoặc đã bị khóa.',FORBIDDEN:'Bạn không có quyền thực hiện thao tác này.',PRICE_CHANGED:'Bảng giá đã thay đổi. Vui lòng tải lại và chọn lại dịch vụ.',OFFER_UNAVAILABLE:'Dịch vụ hoặc người thực hiện không còn nhận lịch.',ACCOUNT_NOT_FOUND:'Email chưa có tài khoản Supabase. Hãy tạo tài khoản trong Authentication trước.',ACCOUNT_ALREADY_LINKED:'Email đã được gán cho nhân sự khác.',LAST_ADMIN:'Không thể khóa hoặc hạ quyền admin cuối cùng.',INVALID_ADMIN:'Admin phải có email tài khoản và đang hoạt động.',NO_PRICES:'Cần đặt giá cho ít nhất một dịch vụ và người thực hiện.',UPGRADE_REQUIRED:'Ứng dụng đã nâng cấp. Vui lòng tải lại trang.',APPOINTMENT_COMPLETED:'Lịch đã hoàn thành không thể dời giờ.',APPOINTMENT_CANCELLED:'Lịch đã hủy không thể chỉnh sửa.'};if(messages[msg])throw new Error(messages[msg]);if(msg.includes('SLOT_TAKEN')||data?.code==='23P01')throw new Error('Giờ này vừa có khách đặt. Vui lòng chọn khung giờ khác.');if(msg.includes('INVALID_CUSTOMER'))throw new Error('Vui lòng kiểm tra tên và số điện thoại.');if(msg.includes('INVALID_SLOT'))throw new Error('Giờ đã chọn không còn hợp lệ. Vui lòng chọn lại.');if(msg.includes('NOT_ADMIN'))throw new Error('Tài khoản này không có quyền quản trị.');if(msg.includes('Invalid login'))throw new Error('ID hoặc mật khẩu chưa đúng.');throw new Error(msg||'Không thể kết nối. Vui lòng thử lại.');}
  return data;
}
const rpc=(name,body={},auth=false)=>request(`/rest/v1/rpc/${name}`,{method:'POST',body,auth});
async function loadSettings(){if(configured){const rows=await request('/rest/v1/settings?id=eq.1&select=*');if(!rows?.length)throw new Error('Chưa khởi tạo cơ sở dữ liệu. Hãy chạy schema.sql.');settings=rows[0];}}
function maxDay(){return addDays(vnDate(),settings.booking_days);}
function closed(date){return settings.closed_days.includes(new Date(`${date}T12:00:00+07:00`).getUTCDay());}
function slotMarkup(){const available=closed(day)?[]:slots(settings,busy,day);if(!available.includes(selected))selected='';return available.length?available.map(t=>`<button class="slot ${selected===t?'active':''}" type="button" data-slot="${t}" aria-pressed="${selected===t}">${t}</button>`).join(''):`<p class="empty">${closed(day)?'Tiệm nghỉ ngày này. Hẹn bạn vào ngày khác nhé.':'Hôm nay đã hết giờ trống. Bạn hãy chọn ngày khác nhé.'}</p>`;}
function updateSlots(){if(!$('#slots'))return;$('#slots').innerHTML=slotMarkup();$('#chosen').textContent=selected?`Đã chọn ${selected}`:'Chỉ hiển thị các giờ còn trống';$('#confirm').disabled=!configured||!selected||bookingPending;}
async function refreshAvailability(){const date=day,gen=generation;if(!configured){updateSlots();return;}try{const result=await rpc('availability',{p_day:date});if(date!==day||gen!==generation)return;busy=result;updateSlots();$('#slot-error').textContent='';}catch(e){if(gen!==generation||!$('#slot-error'))return;$('#slot-error').textContent=e.message;$('#slots').innerHTML='';$('#confirm').disabled=true;}}
function drawDates(){const today=vnDate();const start=day>addDays(today,6)?day:today;$('#date-strip').innerHTML=Array.from({length:7},(_,i)=>addDays(start,i)).filter(d=>d<=maxDay()).map(d=>`<button type="button" class="date-option ${day===d?'active':''}" data-day="${d}" aria-label="${dateLabel(d)}" aria-pressed="${day===d}">${d===today?'Hôm nay':dateLabel(d,{weekday:'short'})}<b>${Number(d.slice(8))}</b></button>`).join('');const monthLabel=$('#booking-form .date-tools > span:first-child');if(monthLabel)monthLabel.textContent=dateLabel(day,{month:'2-digit',year:'numeric'});syncDateDisplays();}
async function booking(){await loadSettings();if(day<vnDate()||day>maxDay())day=vnDate();$('#app').innerHTML=`${!configured?'<div class="notice"><b>Chưa kết nối dữ liệu.</b> Giao diện đã sẵn sàng. Để nhận lịch thật, hãy làm theo README và điền Supabase URL + publishable key trong public/config.js.</div>':''}<div class="hero"><section class="card"><div class="card-heading"><h2>Đặt lịch cắt tóc</h2><span class="badge">✦ Cắt tóc · ${settings.duration_minutes} phút</span></div><form id="booking-form"><span class="step-label">Chọn ngày</span><div class="date-tools"><span>${dateLabel(day,{month:'long',year:'numeric'})}</span><input id="date" aria-label="Chọn ngày cắt tóc" type="date" min="${vnDate()}" max="${maxDay()}" value="${day}" required></div><div class="date-strip" id="date-strip"></div><span class="step-label">Chọn giờ trống</span><div class="slots" id="slots" aria-live="polite"><p class="empty">Đang tải giờ trống…</p></div><p id="slot-error" class="error" role="alert"></p><div class="availability"><span class="dot"></span><span id="chosen">Chỉ hiển thị các giờ còn trống</span></div><span class="step-label">Thông tin của bạn</span><div class="fields"><label class="field">Tên của bạn<input name="name" autocomplete="name" placeholder="Nguyễn Minh Anh" minlength="2" maxlength="80" required></label><label class="field">Số điện thoại<input name="phone" type="tel" autocomplete="tel" placeholder="09xx xxx xxx" pattern="[+0-9 ().-]{9,20}" maxlength="20" required></label></div><p class="error" id="booking-error" role="alert"></p><button class="primary full" id="confirm" disabled><span>Xác nhận đặt lịch</span><span aria-hidden="true">↗</span></button><p class="fineprint">Thông tin của bạn chỉ được dùng để quản lý cuộc hẹn.</p></form></section></div>`;drawDates();await refreshAvailability();
  $('#date').onchange=async e=>{if(!e.target.value||e.target.value<vnDate()||e.target.value>maxDay())return;day=e.target.value;selected='';drawDates();await refreshAvailability();};
  $('#date-strip').onclick=async e=>{const b=e.target.closest('[data-day]');if(!b)return;day=b.dataset.day;selected='';$('#date').value=day;drawDates();await refreshAvailability();};
  $('#slots').onclick=e=>{const b=e.target.closest('[data-slot]');if(b){selected=b.dataset.slot;$('#booking-error').textContent='';updateSlots();}};
  $('#booking-form').onsubmit=async e=>{e.preventDefault();if(!selected||bookingPending)return;bookingPending=true;const submit=$('#confirm');submit.disabled=true;const f=new FormData(e.target);try{const result=await rpc('book_appointment',{p_name:f.get('name').trim(),p_phone:f.get('phone').trim(),p_start:`${day}T${selected}:00+07:00`});const receipt={id:result.id,starts_at:result.starts_at,ends_at:result.ends_at,customer_name:f.get('name').trim(),phone:f.get('phone').trim()};clearInterval(timer);generation++;$('#app').innerHTML=`<section class="card success"><div class="check">✓</div><div class="eyebrow" style="justify-content:center">Hẹn gặp bạn tại tiệm</div><h1 style="font-size:38px">Đặt lịch thành công!</h1><p class="muted">${esc(receipt.customer_name)}, giờ hẹn của bạn đã được giữ.<br>Bạn có thể chụp màn hình để lưu thông tin.</p><div class="receipt"><div><span>Mã lịch hẹn</span><b>${esc(receipt.id.slice(0,8).toUpperCase())}</b></div><div><span>Ngày hẹn</span><b>${dateLabel(vnDate(new Date(receipt.starts_at)))}</b></div><div><span>Giờ cắt</span><b>${timeLabel(receipt.starts_at)} – ${timeLabel(receipt.ends_at)}</b></div><div><span>Số điện thoại</span><b>${esc(receipt.phone)}</b></div></div><button class="primary" id="again">Đặt lịch hẹn khác</button></section>`;$('#again').onclick=()=>{selected='';route();};}catch(err){$('#booking-error').textContent=err.message;await refreshAvailability();}finally{bookingPending=false;if(document.querySelector("#slots"))updateSlots();}};
  timer=setInterval(async()=>{try{await loadSettings();await refreshAvailability();}catch(e){if($('#slot-error'))$('#slot-error').textContent=e.message;}},15000);
}
function login(){
  $('#app').innerHTML=`<section class="card login"><div class="eyebrow">TiCaBeBe / Quản trị</div><h2 style="margin-top:20px">Chào mừng trở lại.</h2><p class="muted">Đăng nhập để quản lý lịch hẹn của tiệm.</p>${!configured?'<div class="notice">Cần kết nối Supabase trước khi đăng nhập.</div>':''}<form id="login" method="post" autocomplete="on"><label class="field">ID / email nhân viên<input name="id" autocomplete="username" placeholder="admin hoặc email" required></label><label class="field">Mật khẩu<input name="password" type="password" autocomplete="current-password" required></label><p class="error" id="login-error" role="alert"></p><button class="primary full" ${!configured?'disabled':''}>Đăng nhập <span>↗</span></button></form><a class="link-button" style="display:block;text-align:center" href="#booking">Quay lại đặt lịch</a></section>`;
  $('#login').onsubmit=async e=>{
    e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;
    const form=e.target,loginEpoch=sessionEpoch,loginGeneration=generation;
    const f=new FormData(form),id=f.get('id').trim(),passwordInput=form.elements.password;
    const credentials={email:id===cfg.adminId?cfg.adminEmail:id,password:f.get('password')};
    f.delete('password');
    try{
      const pending=request('/auth/v1/token?grant_type=password',{method:'POST',body:credentials});
      passwordInput.value='';
      const result=await pending;credentials.password='';
      if(loginEpoch!==sessionEpoch||loginGeneration!==generation||!form.isConnected){void revokeSessionTokens(result);return;}
      saveSession(result);await admin();
    }catch(err){
      if(loginGeneration!==generation||!form.isConnected)return;
      saveSession(null);
      if(!$('#login-error'))login();
      $('#login-error').textContent=err.message;
    }finally{credentials.password='';passwordInput.value='';b.disabled=false;}
  };
}
async function loadAppointments(){const [from,to]=rangeFor(adminDay,view);const result=[];let offset=0;for(;;){const rows=await rpc('admin_appointments',{p_from:from,p_to:to,p_offset:offset,p_limit:500},true);result.push(...rows);if(rows.length<500)break;offset+=500;}appointments=result;}

function row(a){return `<div class="appointment"><time><b>${timeLabel(a.starts_at)}</b><span>${timeLabel(a.ends_at)}</span></time><div><b>${esc(a.customer_name)}</b><small>${a.status==='cancelled'?'Đã hủy':'Đã xác nhận'}</small></div><a class="phone" href="tel:${esc(a.phone.replace(/[^+\d]/g,''))}">${esc(a.phone)}</a><button class="secondary" data-edit="${a.id}">Chi tiết ↗</button></div>`;}
function drawAppointments(){const active=appointments.filter(a=>a.status==='confirmed');$('#stats').innerHTML=`<div class="stat">Lịch hẹn<strong>${active.length}</strong></div><div class="stat">Thời gian<strong>${active.reduce((s,a)=>s+(Date.parse(a.ends_at)-Date.parse(a.starts_at))/60000,0)} <small>phút</small></strong></div><div class="stat">Đã hủy<strong>${appointments.length-active.length}</strong></div>`;
  syncDateDisplays();
  if(view==='month'){
    if(monthDay.slice(0,7)!==adminDay.slice(0,7))monthDay=adminDay;
    const first=adminDay.slice(0,7)+'-01',offset=(new Date(`${first}T12:00:00+07:00`).getUTCDay()+6)%7,start=addDays(first,-offset);
    $('#appointments').innerHTML=`<p class="calendar-hint">Chạm vào ngày để xem và chỉnh sửa lịch hẹn.</p><div class="month-grid">${['T2','T3','T4','T5','T6','T7','CN'].map(x=>`<div class="calendar-head">${x}</div>`).join('')}${Array.from({length:42},(_,i)=>{
      const d=addDays(start,i),off=d.slice(0,7)!==adminDay.slice(0,7),count=appointments.filter(a=>vnDate(new Date(a.starts_at))===d&&a.status==='confirmed').length;
      return `<div class="calendar-cell ${off?'off':''}"><button type="button" class="calendar-day ${d===monthDay?'active':''}" data-calendar-day="${d}" aria-pressed="${d===monthDay}" aria-label="${dateLabel(d)}: ${count} lịch hẹn" ${off?'disabled':''}><b>${Number(d.slice(8))}</b><small>${count?`${count} lịch`:'·'}</small></button></div>`;
    }).join('')}</div><div id="month-details"></div>`;
    drawMonthDetails();return;
  }
  const [from,to]=rangeFor(adminDay,view);let html='';for(let d=from;d<to;d=addDays(d,1)){const items=appointments.filter(a=>vnDate(new Date(a.starts_at))===d);html+=`<section class="day-group"><h3>${dateLabel(d)}</h3>${items.length?items.map(row).join(''):'<div class="empty">Chưa có lịch hẹn.</div>'}</section>`;}$('#appointments').innerHTML=html;
}
function drawMonthDetails(){
  const items=appointments.filter(a=>vnDate(new Date(a.starts_at))===monthDay);
  $('#month-details').innerHTML=`<section class="day-group"><h3>${dateLabel(monthDay)}</h3>${items.length?items.map(row).join(''):'<div class="empty">Chưa có lịch hẹn.</div>'}</section>`;
  document.querySelectorAll('[data-calendar-day]').forEach(b=>{const active=b.dataset.calendarDay===monthDay;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
}
async function admin(){if(!session){login();return;}await loadSettings();if(settings.studio_version===2)return openStudio();await rpc('require_admin',{},true);await loadSettings();await loadAppointments();$('#app').innerHTML=`<div class="admin-top"><h1>Lịch hẹn</h1><div class="admin-actions"><button type="button" class="secondary" id="open-settings">Cấu hình</button><details class="admin-menu"><summary aria-label="Tùy chọn tài khoản">⋯</summary><div><button id="logout" class="secondary">Đăng xuất</button></div></details></div></div><div id="stats" class="stat-row"></div><div class="toolbar"><div class="segments">${[['day','Ngày'],['week','Tuần'],['month','Tháng']].map(([k,v])=>`<button class="${view===k?'active':''}" data-view="${k}">${v}</button>`).join('')}</div><button class="secondary" id="today">Hôm nay</button><button class="secondary" id="reload" aria-label="Làm mới lịch">↻</button><div class="period-nav"><button class="secondary" id="prev" aria-label="Kỳ trước">←</button><input id="admin-date" aria-label="Ngày xem lịch" type="date" value="${adminDay}"><button class="secondary" id="next" aria-label="Kỳ sau">→</button></div></div><p id="admin-error" class="error" role="alert"></p><div id="appointments"></div><dialog id="settings-dialog" class="settings" aria-labelledby="settings-title"><div class="edit-heading"><h2 id="settings-title">Cấu hình lịch cắt</h2><button type="button" id="close-settings" class="secondary icon-button" aria-label="Đóng cấu hình">✕</button></div><p class="muted settings-note">Giờ bắt đầu cách nhau 15 phút. Lịch đã đặt giữ nguyên thời lượng.</p><form id="settings"><div class="fields"><label class="field">Tên tiệm<input name="shop_name" value="${esc(settings.shop_name)}" required maxlength="80"></label><label class="field">Giờ mở cửa<input name="open_time" type="time" step="900" value="${settings.open_time.slice(0,5)}" required></label><label class="field">Giờ đóng cửa<input name="close_time" type="time" step="900" value="${settings.close_time.slice(0,5)}" required></label><label class="field">Thời gian cắt (phút)<input name="duration_minutes" type="number" min="15" max="240" step="15" value="${settings.duration_minutes}" required></label><label class="field">Nghỉ sau mỗi lượt (phút)<input name="buffer_minutes" type="number" min="0" max="120" step="15" value="${settings.buffer_minutes}" required></label><label class="field">Cho đặt trước tối đa (ngày)<input name="booking_days" type="number" min="1" max="180" value="${settings.booking_days}" required></label></div><div style="margin-top:20px;font-size:12px">Ngày nghỉ hàng tuần <div style="display:flex;gap:15px;flex-wrap:wrap;margin-top:12px">${['CN','T2','T3','T4','T5','T6','T7'].map((d,i)=>`<label><input style="width:auto;min-height:0" name="closed_days" type="checkbox" value="${i}" ${settings.closed_days.includes(i)?'checked':''}> ${d}</label>`).join('')}</div></div><p id="settings-error" class="error" role="alert"></p><button class="primary" style="margin-top:20px">Lưu cấu hình</button></form></dialog><dialog id="edit-dialog"></dialog>`;drawAppointments();
  $('#open-settings').onclick=()=>{$('#settings-dialog').showModal();$('#close-settings').focus({preventScroll:true});};
  $('#close-settings').onclick=()=>$('#settings-dialog').close();
  $('#logout').onclick=logoutSession;
  $('.segments').onclick=async e=>{const b=e.target.closest('[data-view]');if(b){view=b.dataset.view;await refreshAdmin();}};
  $('#admin-date').onchange=async e=>{if(e.target.value){adminDay=e.target.value;await refreshAdmin();}};
  $('#prev').onclick=()=>move(-1);$('#next').onclick=()=>move(1);$('#today').onclick=()=>{adminDay=vnDate();refreshAdmin();};$('#reload').onclick=()=>refreshAdmin();
  $('#appointments').onclick=e=>{const date=e.target.closest('[data-calendar-day]');if(date&&!date.disabled){monthDay=date.dataset.calendarDay;drawMonthDetails();return;}const b=e.target.closest('[data-edit]');if(b)edit(appointments.find(a=>a.id===b.dataset.edit));};
  $('#settings').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;const f=new FormData(e.target);try{await rpc('update_settings',{p_shop_name:f.get('shop_name').trim(),p_open:f.get('open_time'),p_close:f.get('close_time'),p_duration:Number(f.get('duration_minutes')),p_buffer:Number(f.get('buffer_minutes')),p_days:Number(f.get('booking_days')),p_closed:f.getAll('closed_days').map(Number)},true);await loadSettings();$('#settings-error').textContent='';$('#settings-dialog').close();toast('Đã lưu cấu hình lịch cắt.');}catch(err){if($('#settings-error'))$('#settings-error').textContent=err.message;}finally{b.disabled=false;}};
}
async function refreshAdmin(){try{await admin();}catch(e){if($('#admin-error'))$('#admin-error').textContent=e.message;else toast(e.message);}}
function move(n){if(view==='month'){const d=new Date(`${adminDay.slice(0,7)}-01T12:00:00+07:00`);d.setUTCMonth(d.getUTCMonth()+n);adminDay=vnDate(d);}else adminDay=addDays(adminDay,n*(view==='week'?7:1));refreshAdmin();}
function edit(a){
  const dialog=$('#edit-dialog'),originalDay=vnDate(new Date(a.starts_at));
  let changing=false,picked='',available=[],loading=false,saving=false,version=0;
  const initialDay=originalDay>=vnDate()&&originalDay<=maxDay()?originalDay:vnDate();
  dialog.innerHTML=`<div class="edit-heading"><div><h2 id="edit-title">Chỉnh sửa lịch hẹn</h2><p class="muted">#${esc(a.id.slice(0,8).toUpperCase())} · ${a.status==='cancelled'?'Đã hủy':'Đã xác nhận'}</p></div><button type="button" class="secondary icon-button" id="close-dialog" aria-label="Đóng chỉnh sửa">✕</button></div><form id="edit-form"><div class="fields"><label class="field">Tên khách<input name="name" autocomplete="name" value="${esc(a.customer_name)}" minlength="2" maxlength="80" required></label><label class="field">Số điện thoại<input name="phone" value="${esc(a.phone)}" type="tel" autocomplete="tel" pattern="[+0-9 ().-]{9,20}" required></label></div><div class="current-appointment"><span>Lịch hẹn hiện tại</span><strong>${dateLabel(originalDay)}</strong><b>${timeLabel(a.starts_at)} – ${timeLabel(a.ends_at)}</b></div>${a.status==='confirmed'?`<button type="button" class="secondary change-time" id="change-time" aria-expanded="false" aria-controls="reschedule">Đổi ngày / giờ hẹn</button><section id="reschedule" hidden><label class="field">Chọn ngày mới<input id="edit-day" name="day" type="date" min="${vnDate()}" max="${maxDay()}" value="${initialDay}" disabled></label><span class="step-label">Chọn giờ còn trống</span><p class="muted edit-hint">${settings.duration_minutes} phút cắt + ${settings.buffer_minutes} phút nghỉ. Chọn một giờ còn trống.</p><div id="edit-slots" class="slots" aria-label="Giờ trống để dời lịch" aria-live="polite"></div><p id="edit-chosen" class="availability" role="status">Chưa chọn giờ mới</p></section>`:''}<p class="error" id="edit-error" role="alert"></p><div class="dialog-actions">${a.status==='confirmed'?'<button type="button" class="secondary danger" id="cancel">Hủy lịch</button><button class="primary" id="save-edit">Lưu thay đổi</button>':'<span class="muted">Lịch đã hủy. Khách có thể đặt lịch mới.</span>'}</div></form>`;
  syncDateDisplays(dialog);dialog.setAttribute('aria-labelledby','edit-title');dialog.showModal();
  // Tránh tự bật bàn phím khi mở bảng sửa trên điện thoại.
  $('#close-dialog').focus({preventScroll:true});
  $('#close-dialog').onclick=()=>dialog.close();
  const form=$('#edit-form');
  function controls(){
    if(!$('#save-edit'))return;
    $('#save-edit').disabled=saving||(changing&&(loading||!available.includes(picked)));
    $('#cancel').disabled=saving;$('#change-time').disabled=saving;
    $('#edit-day').disabled=!changing||saving;
    dialog.querySelectorAll('[data-edit-slot]').forEach(b=>b.disabled=saving);
  }
  function drawEditSlots(){
    if(!available.includes(picked))picked='';
    $('#edit-slots').innerHTML=available.length?available.map(t=>`<button type="button" class="slot ${picked===t?'active':''}" data-edit-slot="${t}" aria-pressed="${picked===t}">${t}</button>`).join(''):'<p class="empty">Ngày này không còn giờ phù hợp. Hãy chọn ngày khác.</p>';
    $('#edit-chosen').textContent=picked?`Giờ mới: ${picked} · ${dateLabel($('#edit-day').value)}`:'Chưa chọn giờ mới';
    controls();
  }
  async function loadEditSlots(){
    const current=++version,date=$('#edit-day').value;
    picked='';available=[];loading=true;$('#edit-slots').innerHTML='<p class="empty">Đang tìm giờ trống…</p>';$('#edit-chosen').textContent='Chưa chọn giờ mới';controls();
    try{
      if(!date||date<vnDate()||date>maxDay())throw new Error('Vui lòng chọn ngày trong khoảng được phép đặt lịch.');
      await loadSettings();
      // Đọc mọi lịch khác trong ngày, kể cả ngoài kỳ ngày/tuần/tháng đang xem.
      const other=await rpc('admin_availability',{p_day:date,p_exclude:a.id},true);
      if(current!==version||!dialog.open||!changing)return;
      available=closed(date)?[]:slots(settings,other,date);
      $('#edit-error').textContent='';loading=false;drawEditSlots();
    }catch(e){
      if(current!==version||!dialog.open||!changing)return;
      loading=false;$('#edit-slots').innerHTML='';$('#edit-error').textContent=e.message;controls();
    }
  }
  if($('#change-time')){
    $('#change-time').onclick=()=>{
      changing=!changing;version++;$('#reschedule').hidden=!changing;$('#change-time').setAttribute('aria-expanded',String(changing));
      $('#change-time').textContent=changing?'Giữ lịch hiện tại':'Đổi ngày / giờ hẹn';$('#edit-error').textContent='';
      if(changing)loadEditSlots();else{picked='';loading=false;controls();}
    };
    $('#edit-day').onchange=loadEditSlots;
    $('#edit-slots').onclick=e=>{const b=e.target.closest('[data-edit-slot]');if(b&&!saving){picked=b.dataset.editSlot;$('#edit-error').textContent='';drawEditSlots();}};
    $('#cancel').onclick=()=>{if(confirm(`Hủy lịch của ${a.customer_name} lúc ${timeLabel(a.starts_at)}?`))mutate({p_id:a.id,p_name:a.customer_name,p_phone:a.phone,p_start:a.starts_at,p_cancel:true});};
  }
  form.onsubmit=async e=>{
    e.preventDefault();if(saving||a.status!=='confirmed')return;
    if(changing&&(loading||!available.includes(picked)))return;
    const f=new FormData(form);
    await mutate({p_id:a.id,p_name:f.get('name').trim(),p_phone:f.get('phone').trim(),p_start:changing?`${f.get('day')}T${picked}:00+07:00`:a.starts_at,p_cancel:false});
  };
  async function mutate(body){
    saving=true;controls();
    try{
      await rpc('edit_appointment',body,true);dialog.close();await refreshAdmin();toast(body.p_cancel?'Đã hủy lịch hẹn.':'Đã cập nhật lịch hẹn.');
    }catch(err){
      if(!dialog.isConnected)return;
      // Lịch khác có thể vừa được đặt sau lúc mở bộ chọn giờ.
      if(changing&&!body.p_cancel)await loadEditSlots();
      $('#edit-error').textContent=err.message;
    }finally{saving=false;controls();}
  }
}
async function openStudio(){const studioGeneration=generation,catalog=await rpc('studio_catalog');if(studioGeneration!==generation)return;return launchStudio({rpc,settings,catalog,esc,toast,dateLabel,timeLabel,syncDateDisplays,slots,vnDate,addDays,rangeFor,generation,currentGeneration:()=>generation,route,logout:logoutSession});}
async function route(){document.dispatchEvent(new Event('ticabebe:route'));clearInterval(timer);generation++;const routeGeneration=generation;$('#app').innerHTML='<p class="empty">Đang chuẩn bị không gian của bạn…</p>';try{assertTopLevel(window);await loadSettings();if(routeGeneration!==generation)return;if(settings.studio_version===2&&(location.hash!=='#admin'||session)){const catalog=await rpc('studio_catalog');if(routeGeneration!==generation)return;if(location.hash==='#admin'||catalog.enabled){await openStudio();return;}}if(location.hash==='#admin'){if(session)await admin();else login();}else await booking();}catch(e){if(routeGeneration!==generation)return;$('#app').innerHTML=`<section class="card login"><h2>Chưa thể tải ứng dụng</h2><p class="error">${esc(e.message)}</p><button class="primary" id="retry">Thử lại</button><a class="link-button" href="#booking">Trang đặt lịch</a></section>`;$('#retry').onclick=()=>{if(location.hash==='#admin')saveSession(null);route();};}}
window.addEventListener('hashchange',route);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('#slots'))refreshAvailability();});route();
