import test from 'node:test';
import assert from 'node:assert/strict';
import {secureApiUrl,assertSecurePage,assertTopLevel,minimalSession,PRIVATE_FETCH,SUPABASE_ORIGIN} from '../public/security.mjs';
test('thông tin đăng nhập chỉ được gửi đến đúng Supabase qua HTTPS',()=>{
  const path='/auth/v1/token?grant_type=password';
  assert.equal(secureApiUrl(SUPABASE_ORIGIN,path),SUPABASE_ORIGIN+path);
  for(const base of ['http://ulhipapekijwwhylsafq.supabase.co','https://attacker.example',SUPABASE_ORIGIN+'@attacker.example',SUPABASE_ORIGIN+'?x=1',SUPABASE_ORIGIN+'/other',SUPABASE_ORIGIN+'#x'])assert.throws(()=>secureApiUrl(base,path));
  for(const path of ['https://attacker.example','//attacker.example','/rest/v1/\\attacker','/auth/v1/../../outside','/auth/v1/token\r\nX-Test: 1'])assert.throws(()=>secureApiUrl(SUPABASE_ORIGIN,path));
});
test('trang production không dùng HTTP, localhost được dùng để phát triển',()=>{
  assert.doesNotThrow(()=>assertSecurePage(new URL('https://ibrahimvu.github.io/ticabebe-booking/')));
  assert.doesNotThrow(()=>assertSecurePage(new URL('http://127.0.0.1:4173/')));
  assert.throws(()=>assertSecurePage(new URL('http://ibrahimvu.github.io/ticabebe-booking/')));
});
test('request không cache, không theo chuyển hướng, không gửi cookie/referrer',()=>assert.deepEqual(PRIVATE_FETCH,{cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'}));

test('không cho giao diện nhạy cảm chạy trong iframe',()=>{
 const top={};assert.doesNotThrow(()=>assertTopLevel({top,self:top}));
 assert.throws(()=>assertTopLevel({top,self:{}}),/khung nhúng/);
});
test('phiên chỉ giữ token và hạn dùng, không giữ password hoặc dữ liệu người dùng',()=>{
  const result=minimalSession({access_token:'access',refresh_token:'refresh',expires_in:3600,password:'DO_NOT_STORE',user:{email:'private@example.com'},extra:'DO_NOT_STORE'},100);
  assert.deepEqual(result,{access_token:'access',refresh_token:'refresh',expires_at:3700});
  assert.equal(minimalSession({access_token:'access'}),null);assert.equal(minimalSession(null),null);
});
