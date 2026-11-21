// Giao diện nhiều nhân sự. Mọi kiểm tra quyền/giá/trùng lịch vẫn thực hiện tại DB.
export async function launchStudio(ctx){
 const {rpc,createStaff,settings,catalog,esc,toast,dateLabel,timeLabel,syncDateDisplays,slots,vnDate,addDays,rangeFor,logout}=ctx;
 const $=s=>document.querySelector(s),money=n=>n==null?'Chưa đặt giá':new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(n);
 const roles={admin:'Admin',manager:'Quản lý',barber:'Thợ cắt tóc'},progress={scheduled:'Đã xác nhận',serving:'Đang phục vụ',completed:'Hoàn thành'};
 let day=vnDate(),view='day',selected='',busy=[],offer=null,appointments=[],me=null,filter='',revision=0,pending=false,disposed=false,poll;
 const max=()=>addDays(vnDate(),settings.booking_days);
 const dead=()=>disposed||ctx.generation!==ctx.currentGeneration();
 function stop(){disposed=true;appointments=[];me=null;clearInterval(poll);window.removeEventListener('hashchange',stop);document.removeEventListener('ticabebe:route',stop);}
 window.addEventListener('hashchange',stop,{once:true});
 document.addEventListener('ticabebe:route',stop,{once:true});
 const rpcError=e=>{if(!dead())toast(e.message);};
 const selectOptions=(rows,key,label,value)=>rows.map(r=>`<option value="${esc(r[key])}" ${String(r[key])===String(value)?'selected':''}>${esc(label(r))}</option>`).join('');
 function closeButton(title){return `<div class="edit-heading"><h2>${title}</h2><button type="button" class="secondary" data-close>Đóng</button></div>`;}
 function showDialog(html){const d=$('#studio-dialog');d.classList.remove('studio-management');d.innerHTML=html;syncDateDisplays(d);d.showModal();const clearPasswords=()=>d.querySelectorAll('input[type=password]').forEach(input=>input.value='');d.onclose=clearPasswords;d.oncancel=clearPasswords;d.querySelector('[data-close]').onclick=()=>{clearPasswords();d.close();};d.querySelector('[data-close]').focus({preventScroll:true});return d;}
 function customerSlots(){
   if(!$('#studio-slots'))return;
   const available=offer&&!settings.closed_days.includes(new Date(`${day}T12:00:00+07:00`).getUTCDay())?slots({...settings,...offer},busy,day):[];
   if(!available.includes(selected))selected='';
   $('#studio-slots').innerHTML=available.length?available.map(t=>`<button type="button" class="slot ${t===selected?'active':''}" data-time="${t}" aria-pressed="${t===selected}">${t}</button>`).join(''):'<p class="empty">Không còn giờ phù hợp. Bạn hãy chọn ngày hoặc người thực hiện khác.</p>';
   $('#studio-submit').disabled=pending||!selected;
 }
 async function availability(){
   if(dead()||!$('#studio-submit'))return;
   const n=++revision;selected='';$('#studio-submit').disabled=true;
   $('#studio-slots').innerHTML='<p class="empty">Đang tải giờ trống…</p>';
   try{busy=offer?await rpc('studio_availability',{p_day:day,p_staff:offer.staff_id}):[];if(n!==revision||dead())return;$('#studio-error').textContent='';customerSlots();}
   catch(e){if(n===revision&&!dead()){$('#studio-slots').innerHTML='';$('#studio-error').textContent=e.message;}}
 }
 function updateOffer(){
   offer=catalog.offers.find(o=>String(o.service_id)===$('#studio-service').value&&String(o.staff_id)===$('#studio-person').value);
   $('#studio-summary').textContent=offer?`${money(offer.price)} · ${offer.duration_minutes} phút · nghỉ ${offer.buffer_minutes} phút`:'';
 }
 function providers(){const choices=catalog.offers.filter(o=>String(o.service_id)===$('#studio-service').value);$('#studio-person').innerHTML=selectOptions(choices,'staff_id',o=>`${o.staff_name} · ${money(o.price)}`,offer?.staff_id);updateOffer();}
 async function customer(){
   const services=[...new Map(catalog.offers.map(o=>[o.service_id,o])).values()];
   $('#app').innerHTML=`<section class="card"><div class="card-heading"><h2>Đặt lịch dịch vụ</h2></div>${services.length?`<form id="studio-booking"><div class="fields"><label class="field">Dịch vụ<select id="studio-service">${selectOptions(services,'service_id',o=>o.service_name)}</select></label><label class="field">Người thực hiện<select id="studio-person"></select></label></div><p class="studio-summary" id="studio-summary"></p><label class="field">Ngày hẹn<input type="date" id="studio-date" value="${day}" min="${vnDate()}" max="${max()}" required></label><span class="step-label">Chọn giờ trống</span><div id="studio-slots" class="slots" aria-live="polite"></div><div class="fields"><label class="field">Tên của bạn<input name="name" minlength="2" maxlength="80" autocomplete="name" required></label><label class="field">Số điện thoại<input name="phone" type="tel" maxlength="20" pattern="[+0-9 ().-]{9,20}" autocomplete="tel" required></label></div><p id="studio-error" class="error" role="alert"></p><button class="primary full" id="studio-submit" disabled>Xác nhận đặt lịch</button><p class="fineprint">Thông tin của bạn chỉ dùng để quản lý cuộc hẹn.</p></form>`:'<p class="empty">Tiệm đang cập nhật dịch vụ và bảng giá. Vui lòng quay lại sau.</p>'}</section>`;
   if(!services.length)return;
   providers();syncDateDisplays();
   $('#studio-service').onchange=()=>{providers();availability();};
   $('#studio-person').onchange=()=>{updateOffer();availability();};
   $('#studio-date').onchange=e=>{if(e.target.validity.valid){day=e.target.value;availability();}};
   $('#studio-slots').onclick=e=>{const b=e.target.closest('[data-time]');if(b&&!pending){selected=b.dataset.time;customerSlots();}};
   $('#studio-booking').onsubmit=async e=>{
     e.preventDefault();if(!offer||!selected||pending)return;pending=true;customerSlots();
     const f=new FormData(e.target),chosen={...offer};
     try{
       const r=await rpc('studio_book',{p_name:f.get('name').trim(),p_phone:f.get('phone').trim(),p_start:`${day}T${selected}:00+07:00`,p_staff:chosen.staff_id,p_service:chosen.service_id,p_price:chosen.price});
       if(dead())return;clearInterval(poll);
       $('#app').innerHTML=`<section class="card confirmation"><h2>Đặt lịch thành công</h2><p>${esc(f.get('name').trim())} · ${esc(f.get('phone').trim())}</p><p><strong>${esc(r.service_name)} · ${esc(r.staff_name)}</strong></p><p>${dateLabel(vnDate(new Date(r.starts_at)))} · ${timeLabel(r.starts_at)} – ${timeLabel(r.ends_at)}</p><p class="studio-summary">${money(r.price)}</p><p>Mã lịch: <strong>${esc(r.id.slice(0,8).toUpperCase())}</strong></p><button id="studio-again" class="primary">Đặt lịch khác</button></section>`;
       $('#studio-again').onclick=()=>ctx.route();
     }catch(err){if(dead())return;await availability();if(err.message.includes('giá')||err.message.includes('dịch vụ')){$('#studio-error').innerHTML=`${esc(err.message)} <button type="button" class="secondary" id="studio-reload">Tải lại bảng giá</button>`;$('#studio-reload').onclick=()=>ctx.route();}else $('#studio-error').textContent=err.message;}
     finally{pending=false;if(!dead())customerSlots();}
   };
   await availability();poll=setInterval(()=>{if(!document.hidden&&!pending&&!dead())refreshQuiet();},15000);
 }
 async function refreshQuiet(){
   if(!offer||!$('#studio-slots'))return;const chosen={...offer},date=day,n=revision;
   try{const result=await rpc('studio_availability',{p_day:date,p_staff:chosen.staff_id});if(!dead()&&n===revision&&date===day&&!pending){busy=result;customerSlots();}}catch{}
 }
 async function load(){
   const [from,to]=rangeFor(day,view);let result=[];
   for(let offset=0;;offset+=500){const rows=await rpc('studio_appointments',{p_from:from,p_to:to,p_offset:offset},true);if(dead())return;result.push(...rows);if(rows.length<500)break;}
   appointments=result;
 }
 function draw(){
   const people=[...new Map(appointments.map(a=>[a.staff_id,{id:a.staff_id,name:a.staff_name||'TiCaBeBe'}])).values()];
   $('#studio-filter').innerHTML='<option value="">Tất cả nhân sự</option>'+selectOptions(people,'id',p=>p.name,filter);
   const rows=appointments.filter(a=>!filter||String(a.staff_id)===filter),active=rows.filter(a=>a.status==='confirmed');
   $('#studio-stats').textContent=`${active.length} lịch · ${money(active.filter(a=>a.progress==='completed').reduce((sum,a)=>sum+(a.price||0),0))} đã hoàn thành`;
   const [from,to]=rangeFor(day,view);let html='';
   for(let d=from;d<to;d=addDays(d,1)){
     const entries=rows.filter(a=>vnDate(new Date(a.starts_at))===d);
     if(view==='month'&&!entries.length)continue;
     html+=`<section class="day-group"><h3>${dateLabel(d)}</h3>${entries.length?entries.map(a=>`<button type="button" class="studio-appointment" data-appointment="${a.id}"><span><strong>${timeLabel(a.starts_at)}</strong><small>${timeLabel(a.ends_at)}</small></span><span><strong>${esc(a.customer_name)}</strong><small>${esc(a.service_name||'Cắt tóc')} · ${esc(a.staff_name||'TiCaBeBe')}</small><small>${a.status==='cancelled'?'Đã hủy':progress[a.progress]} · ${money(a.price)}</small></span><span>Chi tiết</span></button>`).join(''):'<p class="empty">Chưa có lịch hẹn.</p>'}</section>`;
   }
   $('#studio-appointments').innerHTML=html||'<p class="empty">Chưa có lịch hẹn trong kỳ này.</p>';
 }
 async function reload(){try{await load();if(!dead())draw();}catch(e){if(!dead())$('#studio-admin-error').textContent=e.message;}}
 async function dashboard(){
   me=await rpc('studio_profile',{},true);await load();if(dead())return;
   $('#app').innerHTML=`<div class="admin-top"><div><h1>Lịch hẹn</h1><small>${esc(me.name)} · ${roles[me.role]}</small></div><div class="admin-actions">${me.role!=='barber'?'<button class="secondary" id="studio-manage">Quản lý</button>':''}<button class="secondary" id="studio-logout">Đăng xuất</button></div></div><p id="studio-stats" class="studio-summary"></p><div class="toolbar"><div class="segments">${[['day','Ngày'],['week','Tuần'],['month','Tháng']].map(([k,v])=>`<button data-period="${k}" class="${view===k?'active':''}">${v}</button>`).join('')}</div><div class="period-nav"><button class="secondary" id="studio-prev" aria-label="Kỳ trước">‹</button><input type="date" id="studio-admin-day" aria-label="Ngày xem lịch" value="${day}"><button class="secondary" id="studio-next" aria-label="Kỳ sau">›</button></div></div><label class="field" ${me.role==='barber'?'hidden':''}>Lọc nhân sự<select id="studio-filter"></select></label><button class="secondary" id="studio-refresh">Làm mới</button><p id="studio-admin-error" class="error" role="alert"></p><div id="studio-appointments"></div><dialog id="studio-dialog" class="settings"></dialog>`;
   syncDateDisplays();draw();
   $('#studio-logout').onclick=logout;
   $('#studio-refresh').onclick=reload;
   if($('#studio-manage'))$('#studio-manage').onclick=()=>management().catch(rpcError);
   $('#studio-filter').onchange=e=>{filter=e.target.value;draw();};
   $('#studio-admin-day').onchange=e=>{if(e.target.value){day=e.target.value;reload();}};
   $('.segments').onclick=e=>{const b=e.target.closest('[data-period]');if(b){view=b.dataset.period;$('.segments').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));reload();}};
   const move=n=>{if(view==='month'){const d=new Date(`${day.slice(0,7)}-01T12:00:00+07:00`);d.setUTCMonth(d.getUTCMonth()+n);day=vnDate(d);}else day=addDays(day,n*(view==='week'?7:1));$('#studio-admin-day').value=day;syncDateDisplays();reload();};
   $('#studio-prev').onclick=()=>move(-1);$('#studio-next').onclick=()=>move(1);
   $('#studio-appointments').onclick=e=>{const b=e.target.closest('[data-appointment]');if(b)edit(appointments.find(a=>a.id===b.dataset.appointment));};
 }
 function edit(a){
   let changing=false,picked='',valid=[],n=0,saving=false;
   const duration=(Date.parse(a.ends_at)-Date.parse(a.starts_at))/60000,buffer=(Date.parse(a.blocked_until)-Date.parse(a.ends_at))/60000;
   const d=showDialog(`${closeButton('Chi tiết lịch hẹn')}<p>${esc(a.service_name||'Cắt tóc')} · ${esc(a.staff_name||'TiCaBeBe')} · ${money(a.price)}</p><p>${dateLabel(vnDate(new Date(a.starts_at)))} · ${timeLabel(a.starts_at)} – ${timeLabel(a.ends_at)}</p><form id="studio-edit"><div class="fields"><label class="field">Tên khách<input name="name" value="${esc(a.customer_name)}" minlength="2" maxlength="80" required></label><label class="field">Số điện thoại<input name="phone" type="tel" value="${esc(a.phone)}" pattern="[+0-9 ().-]{9,20}" maxlength="20" required></label><label class="field">Trạng thái<select name="progress">${Object.entries(progress).map(([k,v])=>`<option value="${k}" ${a.progress===k?'selected':''}>${v}</option>`).join('')}</select></label></div>${a.status==='confirmed'?`<button class="secondary" type="button" id="studio-change">Đổi ngày / giờ hẹn</button><section id="studio-reschedule" hidden><label class="field">Ngày mới<input type="date" id="studio-edit-day" value="${day<vnDate()?vnDate():day>max()?max():day}" min="${vnDate()}" max="${max()}"></label><p>${duration} phút dịch vụ + ${buffer} phút nghỉ</p><div class="slots" id="studio-edit-slots"></div></section><p class="error" id="studio-edit-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary danger" id="studio-cancel">Hủy lịch</button><button class="primary" id="studio-save">Lưu thay đổi</button></div>`:'<p>Lịch đã hủy; không thể chỉnh sửa.</p>'}</form>`);
   if(a.status!=='confirmed'){d.querySelectorAll('input,select').forEach(x=>x.disabled=true);return;}
   function controls(){ $('#studio-save').disabled=saving||(changing&&!valid.includes(picked));$('#studio-cancel').disabled=saving;$('#studio-change').disabled=saving;$('#studio-edit-day').disabled=saving;d.querySelectorAll('[data-pick]').forEach(b=>b.disabled=saving); }
   async function free(){const v=++n;picked='';valid=[];controls();$('#studio-edit-slots').innerHTML='<p>Đang tải…</p>';try{
     const date=$('#studio-edit-day').value;const rows=await rpc('studio_availability',{p_day:date,p_staff:a.staff_id,p_exclude:a.id},true);
     if(v!==n||!d.open||!changing)return;
     valid=settings.closed_days.includes(new Date(`${date}T12:00:00+07:00`).getUTCDay())?[]:slots({...settings,duration_minutes:duration,buffer_minutes:buffer},rows,date);
     $('#studio-edit-slots').innerHTML=valid.length?valid.map(t=>`<button type="button" class="slot" data-pick="${t}">${t}</button>`).join(''):'<p class="empty">Không còn giờ phù hợp.</p>';controls();
   }catch(e){if(v===n&&d.open){$('#studio-edit-error').textContent=e.message;$('#studio-edit-slots').innerHTML='';}}}
   $('#studio-change').onclick=()=>{changing=!changing;n++;$('#studio-reschedule').hidden=!changing;$('#studio-change').textContent=changing?'Giữ lịch hiện tại':'Đổi ngày / giờ hẹn';controls();if(changing)free();};
   $('#studio-edit-day').onchange=free;
   $('#studio-edit-slots').onclick=e=>{const b=e.target.closest('[data-pick]');if(b&&!saving){picked=b.dataset.pick;d.querySelectorAll('[data-pick]').forEach(x=>x.classList.toggle('active',x===b));controls();}};
   async function save(cancel){if(saving||(!cancel&&changing&&!valid.includes(picked)))return;saving=true;controls();const f=new FormData($('#studio-edit'));try{
     await rpc('studio_edit',{p_id:a.id,p_name:f.get('name').trim(),p_phone:f.get('phone').trim(),p_start:changing&&!cancel?`${$('#studio-edit-day').value}T${picked}:00+07:00`:a.starts_at,p_cancel:cancel,p_progress:f.get('progress')},true);if(dead())return;d.close();await reload();if(dead())return;toast('Đã cập nhật lịch hẹn.');
   }catch(e){if(dead())return;if(changing&&!cancel)await free();if(!dead()&&$('#studio-edit-error'))$('#studio-edit-error').textContent=e.message;}finally{saving=false;if(!dead()&&d.open)controls();}}
   $('#studio-edit').onsubmit=e=>{e.preventDefault();save(false);};$('#studio-cancel').onclick=()=>{if(confirm('Hủy lịch hẹn này?'))save(true);};
 }
 async function management(tab='services'){
   let data=await rpc('studio_management',{},true),selectedStaffId='';if(dead())return;
   const d=showDialog(`${closeButton('Quản lý tiệm')}<div class="segments studio-tabs"><button data-tab="services" class="${tab==='services'?'active':''}">Dịch vụ</button><button data-tab="prices" class="${tab==='prices'?'active':''}">Giá theo người</button><button data-tab="hours" class="${tab==='hours'?'active':''}">Giờ mở cửa</button>${me.role==='admin'?`<button data-tab="staff" class="${tab==='staff'?'active':''}">Nhân sự</button>`:''}</div><div class="studio-manage-body"><div id="studio-manage-content"></div><p id="studio-manage-error" class="error" role="alert"></p>${me.role==='admin'&&!data.enabled?'<div class="notice"><p>Cấu hình giá cho ít nhất một người trước khi kích hoạt. Lịch cũ vẫn giữ nguyên.</p><button class="primary" id="studio-activate">Kích hoạt đặt lịch mới</button></div>':''}</div>`);
   d.classList.add('studio-management');
   const tabs=[...d.querySelectorAll('[data-tab]')];
   d.querySelector('.studio-tabs').setAttribute('aria-label','Mục quản lý');
   d.querySelector('.studio-tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b&&!b.disabled&&b.dataset.tab!==tab)renderTab(b.dataset.tab);};
   const content=$('#studio-manage-content');
   const managementOpen=()=>!dead()&&d.open&&content.isConnected;
   async function submit(form,fn,args){const b=form.querySelector('button[type="submit"]');b.disabled=true;tabs.forEach(t=>t.disabled=true);let saved=false;try{const pending=fn==='staff-create'?createStaff(args):rpc(fn,args,true);if(fn==='staff-create')args.password='';const result=await pending;if(fn==='staff-create'&&result?.created!==true)throw new Error('Máy chủ chưa xác nhận tạo tài khoản. Vui lòng kiểm tra backend.');saved=true;if(!managementOpen())return;if(fn==='studio_settings'){settings.shop_name=args.p_shop_name;settings.open_time=args.p_open;settings.close_time=args.p_close;settings.booking_days=args.p_days;settings.closed_days=args.p_closed;}const fresh=await rpc('studio_management',{},true);if(!managementOpen())return;data=fresh;if(fn==='staff-create')selectedStaffId=String(data.staff.find(t=>t.email?.toLowerCase()===args.email.toLowerCase())?.id||'');else if(fn==='studio_staff_save')selectedStaffId=String(result||args.p_id||'');renderTab(tab);if(fn==='staff-create'&&!selectedStaffId)$('#studio-manage-error').textContent='Tài khoản đã tạo nhưng chưa thấy hồ sơ trong danh sách. Bấm Làm mới để kiểm tra, không tạo lại tài khoản.';toast(fn==='staff-create'?'Đã tạo tài khoản.':'Đã lưu.');}catch(e){if(managementOpen())$('#studio-manage-error').textContent=saved?'Đã lưu, nhưng chưa tải lại được danh sách. Bấm Làm mới để kiểm tra.':e.message;}finally{b.disabled=false;tabs.forEach(t=>t.disabled=false);}}
   function renderTab(nextTab){
     tab=nextTab;tabs.forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
     $('#studio-manage-error').textContent='';
     d.querySelector('.studio-manage-body').scrollTop=0;
   if(tab==='hours'){
     content.innerHTML=`<form id="studio-hours-form"><label class="field">Tên tiệm<input name="name" value="${esc(settings.shop_name)}" maxlength="80" required></label><div class="fields"><label class="field">Giờ mở cửa<input name="open" type="time" step="900" value="${settings.open_time.slice(0,5)}" required></label><label class="field">Giờ đóng cửa<input name="close" type="time" step="900" value="${settings.close_time.slice(0,5)}" required></label></div><label class="field">Cho đặt trước tối đa (ngày)<input name="days" type="number" min="1" max="180" value="${settings.booking_days}" required></label><p>Ngày nghỉ hàng tuần</p>${['CN','T2','T3','T4','T5','T6','T7'].map((label,i)=>`<label class="studio-check"><input name="closed" type="checkbox" value="${i}" ${settings.closed_days.includes(i)?'checked':''}>${label}</label>`).join('')}<button type="submit" class="primary">Lưu giờ mở cửa</button></form>`;
     $('#studio-hours-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);submit(e.target,'studio_settings',{p_shop_name:f.get('name').trim(),p_open:f.get('open'),p_close:f.get('close'),p_days:Number(f.get('days')),p_closed:f.getAll('closed').map(Number)});};
   }else if(tab==='services'){
     content.innerHTML=`<label class="field">Chọn dịch vụ<select id="studio-service-edit"><option value="">Thêm dịch vụ mới</option>${selectOptions(data.services,'id',s=>`${s.name}${s.active?'':' (đang ẩn)'}`)}</select></label><form id="studio-service-form"><label class="field">Tên dịch vụ<input name="name" minlength="2" maxlength="80" required></label><div class="fields"><label class="field">Thời lượng chung (phút)<input name="duration" type="number" min="15" max="240" step="15" value="45" required></label><label class="field">Nghỉ sau lượt (phút)<input name="buffer" type="number" min="0" max="120" step="15" value="15" required></label></div><label class="studio-check"><input name="active" type="checkbox" checked> Cho phép đặt dịch vụ</label><button type="submit" class="primary">Lưu dịch vụ</button></form>`;
     $('#studio-service-edit').onchange=e=>{const s=data.services.find(s=>String(s.id)===e.target.value),f=$('#studio-service-form');f.elements.name.value=s?.name||'';f.elements.duration.value=s?.duration_minutes||45;f.elements.buffer.value=s?.buffer_minutes??15;f.elements.active.checked=s?.active??true;};
     $('#studio-service-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);submit(e.target,'studio_service_save',{p_id:Number($('#studio-service-edit').value)||null,p_name:f.get('name').trim(),p_duration:Number(f.get('duration')),p_buffer:Number(f.get('buffer')),p_active:f.has('active')});};
   }else if(tab==='prices'){
     content.innerHTML=`<form id="studio-price-form"><label class="field">Người thực hiện<select name="staff">${selectOptions(data.staff,'id',t=>`${t.name}${t.active?'':' (đã khóa)'}`)}</select></label><label class="field">Dịch vụ<select name="service">${selectOptions(data.services,'id',s=>s.name)}</select></label><label class="field">Giá riêng (VNĐ)<input name="price" type="number" min="0" max="100000000" step="1000" required></label><label class="studio-check"><input name="active" type="checkbox" checked> Người này nhận dịch vụ này</label><p class="muted">Thời lượng dùng chung theo dịch vụ. Giá mới chỉ áp dụng cho lịch đặt sau khi lưu.</p><button type="submit" class="primary">Lưu giá</button></form>`;
     const form=$('#studio-price-form');const update=()=>{const p=data.prices.find(p=>String(p.staff_id)===form.elements.staff.value&&String(p.service_id)===form.elements.service.value);form.elements.price.value=p?.price??'';form.elements.active.checked=p?.active??true;};form.elements.staff.onchange=update;form.elements.service.onchange=update;update();
     form.onsubmit=e=>{e.preventDefault();const f=new FormData(form);submit(form,'studio_price_save',{p_staff:Number(f.get('staff')),p_service:Number(f.get('service')),p_price:Number(f.get('price')),p_active:f.has('active')});};
   }else if(tab==='staff'&&me.role==='admin'){
     content.innerHTML=`<div class="staff-list-heading"><h3>Danh sách nhân sự / tài khoản <span>(${data.staff.length})</span></h3><div><button type="button" class="secondary" id="studio-staff-reload">Làm mới</button><button type="button" class="primary" id="studio-staff-new">Thêm mới</button></div></div><div id="studio-staff-list" class="staff-list" aria-label="Danh sách nhân sự và tài khoản">${data.staff.length?data.staff.map(t=>`<button type="button" class="staff-list-item ${String(t.id)===selectedStaffId?'active':''}" data-staff-id="${t.id}" aria-pressed="${String(t.id)===selectedStaffId}"><span><strong>${esc(t.name)}</strong><small>${t.email?esc(t.email):'Chưa liên kết tài khoản'}</small><small>${roles[t.role]} · ${t.active?'Đang hoạt động':'Đã khóa'}</small></span><span>Chỉnh sửa</span></button>`).join(''):'<p class="empty">Chưa có nhân sự. Bấm Thêm mới để tạo tài khoản.</p>'}</div><h3 class="staff-form-heading" id="studio-staff-heading">Thêm nhân sự / tài khoản</h3><input id="studio-staff-edit" type="hidden" value="${esc(selectedStaffId)}"><form id="studio-staff-form"><label class="field">Tên hiển thị<input name="name" minlength="2" maxlength="80" required></label><label class="field">Tài khoản đăng nhập<select name="account_mode"><option value="create">Tạo tài khoản mới</option><option value="link">Liên kết tài khoản đã có</option><option value="none">Chưa cấp tài khoản</option></select></label><label class="field" id="studio-email-field">Email đăng nhập<input name="email" type="email" autocomplete="off" maxlength="254" required></label><label class="field" id="studio-password-field">Mật khẩu tài khoản mới<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><p class="muted" id="studio-account-hint">Tạo tài khoản Supabase và cấp vai trò khi lưu. Mật khẩu từ 8 ký tự; chỉ gửi qua HTTPS, không lưu trên website.</p><label class="field">Vai trò<select name="role"><option value="barber">Thợ cắt tóc</option><option value="manager">Quản lý</option><option value="admin">Admin</option></select></label><label class="studio-check"><input name="active" type="checkbox" checked> Tài khoản/nhân sự đang hoạt động</label><label class="studio-check"><input name="bookable" type="checkbox" checked> Hiện cho khách chọn đặt lịch</label><button type="submit" class="primary">Lưu nhân sự</button></form>`;
     const staffForm=$('#studio-staff-form');
     function accountFields(){
       const mode=staffForm.elements.account_mode.value,creating=mode==='create';
       $('#studio-email-field').hidden=mode==='none';staffForm.elements.email.required=mode!=='none';
       $('#studio-password-field').hidden=!creating;staffForm.elements.password.required=creating;staffForm.elements.password.disabled=!creating;staffForm.elements.password.value='';
       $('#studio-account-hint').textContent=creating?'Tạo tài khoản Supabase và cấp vai trò khi lưu. Mật khẩu từ 8 ký tự; chỉ gửi qua HTTPS, không lưu trên website.':mode==='link'?'Liên kết email đã có trên Supabase; giữ nguyên mật khẩu hiện tại.':'Nhân sự chỉ nhận lịch, chưa có quyền đăng nhập.';
     }
     staffForm.elements.account_mode.onchange=accountFields;
     $('#studio-staff-edit').onchange=e=>{selectedStaffId=e.target.value;const t=data.staff.find(t=>String(t.id)===e.target.value),f=staffForm;f.elements.name.value=t?.name||'';f.elements.email.value=t?.email||'';f.elements.role.value=t?.role||'barber';f.elements.active.checked=t?.active??true;f.elements.bookable.checked=t?.bookable??true;f.elements.account_mode.querySelector('[value=create]').disabled=Boolean(t);f.elements.account_mode.value=t?(t.email?'link':'none'):'create';$('#studio-staff-heading').textContent=t?'Chỉnh sửa nhân sự / tài khoản':'Thêm nhân sự / tài khoản';d.querySelectorAll('[data-staff-id]').forEach(b=>{const active=b.dataset.staffId===selectedStaffId;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});accountFields();};
     staffForm.onsubmit=e=>{
       e.preventDefault();const f=new FormData(staffForm),mode=f.get('account_mode'),id=Number($('#studio-staff-edit').value)||null;
       const common={name:f.get('name').trim(),email:mode==='none'?'':f.get('email').trim(),role:f.get('role'),active:f.has('active'),bookable:f.has('bookable')};
       if(mode==='create'){
         if(id){$('#studio-manage-error').textContent='Chỉ tạo tài khoản khi thêm nhân sự mới.';return;}
         const password=f.get('password');f.delete('password');staffForm.elements.password.value='';submit(staffForm,'staff-create',{...common,password});
       }else submit(staffForm,'studio_staff_save',{p_id:id,p_name:common.name,p_email:common.email,p_role:common.role,p_active:common.active,p_bookable:common.bookable});
     };
     const chooseStaff=id=>{const input=$('#studio-staff-edit');input.value=id;input.dispatchEvent(new Event('change'));};
     $('#studio-staff-list').onclick=e=>{const button=e.target.closest('[data-staff-id]');if(button){chooseStaff(button.dataset.staffId);$('#studio-staff-heading').scrollIntoView({block:'nearest'});}};
     $('#studio-staff-new').onclick=()=>{chooseStaff('');$('#studio-staff-heading').scrollIntoView({block:'nearest'});};
     $('#studio-staff-reload').onclick=async e=>{const button=e.currentTarget;button.disabled=true;try{const fresh=await rpc('studio_management',{},true);if(!managementOpen())return;data=fresh;renderTab('staff');}catch(error){if(managementOpen())$('#studio-manage-error').textContent=error.message;}finally{button.disabled=false;}};
     chooseStaff(data.staff.some(t=>String(t.id)===selectedStaffId)?selectedStaffId:'');
     const chosen=d.querySelector('[data-staff-id="'+selectedStaffId+'"]'),list=$('#studio-staff-list');if(chosen)list.scrollTop+=chosen.getBoundingClientRect().top-list.getBoundingClientRect().top;
   }
   }
   renderTab(tab);
   if($('#studio-activate'))$('#studio-activate').onclick=async e=>{e.target.disabled=true;try{await rpc('studio_activate',{},true);if(!managementOpen())return;e.target.closest('.notice').remove();data.enabled=true;toast('Đã kích hoạt đặt dịch vụ theo nhân sự.');}catch(err){if(!managementOpen())return;$('#studio-manage-error').textContent=err.message;e.target.disabled=false;}};
 }
 try{if(location.hash==='#admin')await dashboard();else await customer();}catch(e){stop();throw e;}
}
