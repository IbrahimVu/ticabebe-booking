export const SUPABASE_ORIGIN='https://ulhipapekijwwhylsafq.supabase.co';
export const IDLE_TIMEOUT_MS=30*60*1000;
export const PRIVATE_FETCH=Object.freeze({cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});

export function secureApiUrl(base,path){
  const url=new URL(base);
  if(url.origin!==SUPABASE_ORIGIN||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Địa chỉ máy chủ không hợp lệ. Không gửi thông tin đăng nhập.');
  if(typeof path!=='string'||!/^\/(auth|rest)\/v1\//.test(path)||/[\r\n\\]/.test(path))throw new Error('Đường dẫn API không hợp lệ.');
  const target=new URL(path,SUPABASE_ORIGIN);
  if(target.origin!==SUPABASE_ORIGIN||!/^\/(auth|rest)\/v1\//.test(target.pathname))throw new Error('Không được gửi dữ liệu sang máy chủ khác hoặc đường dẫn không hợp lệ.');
  return target.href;
}

export function assertSecurePage(page){
  const local=['localhost','127.0.0.1','[::1]'].includes(page.hostname);
  if(page.protocol!=='https:'&&!(page.protocol==='http:'&&local))throw new Error('Vui lòng mở website bằng HTTPS để bảo vệ thông tin đăng nhập.');
}

export function assertTopLevel(win){
  if(win.top!==win.self)throw new Error('Vui lòng mở website trực tiếp, không qua khung nhúng.');
}

export function minimalSession(value,now=Math.floor(Date.now()/1000)){
  if(!value||typeof value.access_token!=='string'||!value.access_token)return null;
  const expires=Number.isFinite(value.expires_at)?value.expires_at:(Number.isFinite(value.expires_in)?now+value.expires_in:NaN);
  if(!Number.isFinite(expires))return null;
  return {access_token:value.access_token,...(typeof value.refresh_token==='string'&&value.refresh_token?{refresh_token:value.refresh_token}:{}),expires_at:expires};
}
