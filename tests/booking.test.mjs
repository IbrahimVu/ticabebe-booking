import test from 'node:test';
import assert from 'node:assert/strict';
import {slots,rangeFor,vnDate,addDays,formatDateVN} from '../public/booking.mjs';
const settings={open_time:'09:00:00',close_time:'20:00:00',duration_minutes:45,buffer_minutes:15};
const day='2030-01-07',now=new Date('2030-01-06T00:00:00Z');
test('hiển thị ngày Việt Nam DD/MM/YYYY, giữ nguyên giá trị ISO dùng đặt lịch',()=>{assert.equal(formatDateVN('2026-03-04'),'04/03/2026');assert.equal(formatDateVN('2028-02-29'),'29/02/2028');assert.equal(formatDateVN(''),'');});
const busy=[{starts_at:`${day}T15:00:00+07:00`,blocked_until:`${day}T16:00:00+07:00`}];
test('45 phút cắt + 15 phút nghỉ: 15:00 đã đặt thì 16:00 còn trống',()=>{
  const result=slots(settings,busy,day,now);
  for(const t of ['14:15','14:30','14:45','15:00','15:15','15:30','15:45'])assert.ok(!result.includes(t),t);
  assert.ok(result.includes('14:00'));assert.ok(result.includes('16:00'));
});
test('các giờ cách nhau 15 phút, không vượt giờ đóng cửa',()=>{
  const result=slots(settings,[],day,now);assert.deepEqual(result.slice(0,4),['09:00','09:15','09:30','09:45']);assert.equal(result.at(-1),'19:15');
});
test('có thể tắt nghỉ để bắt đầu lượt sau lúc 15:45',()=>assert.ok(slots({...settings,buffer_minutes:0},[{...busy[0],blocked_until:`${day}T15:45:00+07:00`}],day,now).includes('15:45')));
test('ẩn giờ đã qua theo GMT+7, kể cả đúng thời điểm bắt đầu',()=>{
  const result=slots(settings,[],day,new Date(`${day}T15:00:00+07:00`));assert.equal(result[0],'15:15');assert.ok(!result.includes('15:00'));
});
test('đổi thời lượng áp dụng cho lượt mới, vẫn giữ khoảng chiếm chỗ của lịch cũ',()=>{
  const result=slots({...settings,duration_minutes:30,buffer_minutes:0},busy,day,now);assert.ok(result.includes('14:30'));assert.ok(!result.includes('14:45'));assert.ok(result.includes('16:00'));
});
test('ngày Việt Nam chính xác ở ranh giới UTC',()=>assert.equal(vnDate(new Date('2026-11-13T18:00:00Z')),'2026-11-14'));
test('tuần bắt đầu thứ hai; tháng và năm đổi đúng',()=>{
  assert.deepEqual(rangeFor('2026-11-15','week'),['2026-11-09','2026-11-16']);assert.deepEqual(rangeFor('2026-12-15','month'),['2026-12-01','2027-01-01']);assert.equal(addDays('2028-02-28',1),'2028-02-29');
});
