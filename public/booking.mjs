export const STEP = 15;
export function minutes(time) { const [h,m] = time.split(':').map(Number); return h * 60 + m; }
export function clock(n) { return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
export function vnDate(date = new Date()) { return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
export function formatDateVN(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(iso)?`${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`:''; }
export function addDays(day, n) { const d=new Date(`${day}T12:00:00+07:00`); d.setUTCDate(d.getUTCDate()+n); return vnDate(d); }
export function overlaps(a,b) { return a.start < b.end && b.start < a.end; }
export function slots({open_time,close_time,duration_minutes,buffer_minutes}, busy=[], date=vnDate(), now=new Date()) {
  const result=[];
  for(let n=minutes(open_time); n+duration_minutes<=minutes(close_time); n+=STEP) {
    const start=new Date(`${date}T${clock(n)}:00+07:00`).getTime();
    const end=start+(duration_minutes+buffer_minutes)*60000;
    if(start>now.getTime() && !busy.some(b=>overlaps({start,end},{start:Date.parse(b.starts_at),end:Date.parse(b.blocked_until)}))) result.push(clock(n));
  }
  return result;
}
export function rangeFor(day, view) {
  if(view==='day') return [day,addDays(day,1)];
  if(view==='week') {const w=new Date(`${day}T12:00:00+07:00`).getUTCDay();const first=addDays(day,-((w+6)%7));return [first,addDays(first,7)];}
  const first=day.slice(0,7)+'-01'; const d=new Date(`${first}T12:00:00+07:00`);d.setUTCMonth(d.getUTCMonth()+1);return [first,vnDate(d)];
}
