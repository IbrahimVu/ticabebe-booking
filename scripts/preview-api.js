// Bộ dữ liệu cục bộ chỉ dành cho file xem thử; không được xuất bản vào public/.
const PREVIEW_KEY = 'ticabebe-preview-data-v1';
let previewMemory;
function freshPreviewData() {
  const s = {id:1,shop_name:'TiCaBeBe',open_time:'09:00',close_time:'20:00',duration_minutes:45,buffer_minutes:15,closed_days:[],booking_days:30};
  const rows = [];
  for (const offset of [0,1,3,7]) {
    const date = addDays(vnDate(),offset);
    for (const [time,name,phone] of [['10:00','Khách mẫu Minh','0900000001'],['15:00','Khách mẫu An','0900000002']]) {
      const start = Date.parse(`${date}T${time}:00+07:00`);
      rows.push({id:crypto.randomUUID(),customer_name:name,phone,starts_at:new Date(start).toISOString(),ends_at:new Date(start+45*60000).toISOString(),blocked_until:new Date(start+60*60000).toISOString(),status:'confirmed'});
    }
  }
  return {settings:s,appointments:rows};
}
function readPreview() {
  try {
    const stored = localStorage.getItem(PREVIEW_KEY);
    if(stored) return JSON.parse(stored);
  } catch {}
  if(!previewMemory) writePreview(freshPreviewData());
  return structuredClone(previewMemory);
}
function writePreview(data) {
  previewMemory=structuredClone(data);
  try { localStorage.setItem(PREVIEW_KEY,JSON.stringify(data)); } catch {}
}
function previewAdmin() {
  if(!session || session.access_token!=='preview-admin') throw new Error('Vui lòng đăng nhập tài khoản xem thử.');
}
function validatePreviewPerson(name,phone) {
  if(!name || name.trim().length<2 || name.trim().length>80) throw new Error('Tên khách cần từ 2 đến 80 ký tự.');
  if(!/^[+0-9 ().-]{9,20}$/.test(phone) || phone.replace(/\D/g,'').length<9 || phone.replace(/\D/g,'').length>15) throw new Error('Vui lòng nhập số điện thoại hợp lệ.');
}
function validatePreviewSlot(start,s,rows,exclude) {
  const d = new Date(start), date = vnDate(d);
  const time = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  const weekday = new Date(`${date}T12:00:00+07:00`).getUTCDay();
  if(!Number.isFinite(start) || start<=Date.now() || date>addDays(vnDate(),s.booking_days) || date<vnDate() || s.closed_days.includes(weekday) || minutes(time)<minutes(s.open_time) || minutes(time)+s.duration_minutes>minutes(s.close_time) || minutes(time)%15 || d.getUTCSeconds() || d.getUTCMilliseconds()) throw new Error('Giờ đã chọn không hợp lệ. Vui lòng kiểm tra giờ làm và ngày nghỉ.');
  const end=start+(s.duration_minutes+s.buffer_minutes)*60000;
  if(rows.some(a=>a.id!==exclude && a.status==='confirmed' && overlaps({start,end},{start:Date.parse(a.starts_at),end:Date.parse(a.blocked_until)}))) throw new Error('Giờ này vừa có khách đặt. Vui lòng chọn khung giờ khác.');
}
async function previewRequest(path,{body,auth=false}={}) {
  const data=readPreview(), s=data.settings;
  if(auth) previewAdmin();
  if(path.startsWith('/auth/v1/token')) {
    if(body.email!=='demo@ticabebe.local' || body.password!=='admin123') throw new Error('ID hoặc mật khẩu chưa đúng. Dùng admin / admin123 cho bản xem thử.');
    return {access_token:'preview-admin',expires_at:Math.floor(Date.now()/1000)+86400};
  }
  if(path==='/auth/v1/logout') return null;
  if(path.startsWith('/rest/v1/settings?')) return [s];
  if(path.endsWith('/require_admin')) {previewAdmin();return true;}
  if(path.endsWith('/availability')) return data.appointments.filter(a=>a.status==='confirmed' && Date.parse(a.starts_at)<Date.parse(`${addDays(body.p_day,1)}T00:00:00+07:00`) && Date.parse(a.blocked_until)>Date.parse(`${body.p_day}T00:00:00+07:00`)).map(({starts_at,blocked_until})=>({starts_at,blocked_until}));
  if(path.endsWith('/admin_availability')) {
    previewAdmin();return data.appointments.filter(a=>a.id!==body.p_exclude&&a.status==='confirmed'&&Date.parse(a.starts_at)<Date.parse(`${addDays(body.p_day,1)}T00:00:00+07:00`)&&Date.parse(a.blocked_until)>Date.parse(`${body.p_day}T00:00:00+07:00`)).map(({starts_at,blocked_until})=>({starts_at,blocked_until}));
  }
  if(path.endsWith('/admin_appointments')) {
    previewAdmin();
    const from=Date.parse(`${body.p_from}T00:00:00+07:00`),to=Date.parse(`${body.p_to}T00:00:00+07:00`);
    return data.appointments.filter(a=>Date.parse(a.starts_at)>=from&&Date.parse(a.starts_at)<to).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).slice(body.p_offset,body.p_offset+body.p_limit);
  }
  if(path.endsWith('/book_appointment')) {
    validatePreviewPerson(body.p_name,body.p_phone);
    const start=Date.parse(body.p_start);
    validatePreviewSlot(start,s,data.appointments);
    const a={id:crypto.randomUUID(),customer_name:body.p_name,phone:body.p_phone,starts_at:new Date(start).toISOString(),ends_at:new Date(start+s.duration_minutes*60000).toISOString(),blocked_until:new Date(start+(s.duration_minutes+s.buffer_minutes)*60000).toISOString(),status:'confirmed'};
    data.appointments.push(a);writePreview(data);return {id:a.id,starts_at:a.starts_at,ends_at:a.ends_at};
  }
  if(path.endsWith('/edit_appointment')) {
    previewAdmin();const a=data.appointments.find(a=>a.id===body.p_id);
    if(!a) throw new Error('Không tìm thấy lịch hẹn.');
    if(body.p_cancel) a.status='cancelled';
    else {
      validatePreviewPerson(body.p_name,body.p_phone);
      const start=Date.parse(body.p_start);
      if(start!==Date.parse(a.starts_at)) {
        validatePreviewSlot(start,s,data.appointments,a.id);
        a.starts_at=new Date(start).toISOString();a.ends_at=new Date(start+s.duration_minutes*60000).toISOString();a.blocked_until=new Date(start+(s.duration_minutes+s.buffer_minutes)*60000).toISOString();
      }
      a.customer_name=body.p_name;a.phone=body.p_phone;
    }
    writePreview(data);return null;
  }
  if(path.endsWith('/update_settings')) {
    previewAdmin();
    if(!body.p_shop_name || minutes(body.p_open)>=minutes(body.p_close) || body.p_duration<15 || body.p_duration>240 || body.p_duration%15 || body.p_buffer<0 || body.p_buffer>120 || body.p_buffer%15 || body.p_days<1 || body.p_days>180) throw new Error('Cấu hình chưa hợp lệ. Giờ đóng cửa phải sau giờ mở cửa.');
    data.settings={...s,shop_name:body.p_shop_name,open_time:body.p_open,close_time:body.p_close,duration_minutes:body.p_duration,buffer_minutes:body.p_buffer,closed_days:body.p_closed,booking_days:body.p_days};writePreview(data);return null;
  }
  throw new Error('Thao tác chưa hỗ trợ trong bản xem thử.');
}
document.getElementById('reset-preview').onclick=()=>{
  if(confirm('Xóa các thay đổi và khôi phục lịch hẹn mẫu?')) {
    writePreview(freshPreviewData());
    try { sessionStorage.removeItem('ticabebe-preview-session'); } catch {}
    location.reload();
  }
};
