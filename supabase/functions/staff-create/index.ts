// Single-file Edge Function. No third-party dependencies or embedded secrets.
// Keys are read only from Supabase's server-side environment.
const PROJECT_ORIGIN='https://ulhipapekijwwhylsafq.supabase.co';
const PRODUCTION_ORIGIN='https://ibrahimvu.github.io';
function keyFrom(env,group,legacy){
  try{const keys=JSON.parse(env(group)||'{}');const key=keys.default||Object.values(keys).find(v=>typeof v==='string'&&v);if(typeof key==='string')return key;}catch{}
  return env(legacy)||'';
}
async function readJson(request){
  const reader=request.body?.getReader();if(!reader)throw new Error('INVALID_INPUT');
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw new Error('PAYLOAD_TOO_LARGE');}chunks.push(value);}
  const data=new Uint8Array(size);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(data));}catch{throw new Error('INVALID_INPUT');}
}
export function createStaffHandler({env,fetcher=fetch}){
 return async request=>{
  const origin=request.headers.get('origin');
  const allowedOrigin=!origin||origin===PRODUCTION_ORIGIN||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const cors=origin&&allowedOrigin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
  const headers={...cors,'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
  const reply=(status,code)=>new Response(JSON.stringify({code}),{status,headers});
  if(!allowedOrigin)return reply(403,'ORIGIN_DENIED');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Max-Age':'600'}});
  if(request.method!=='POST')return reply(405,'METHOD_NOT_ALLOWED');
  const authorization=request.headers.get('authorization');
  if(!authorization||!/^Bearer [^\s]+$/.test(authorization))return reply(401,'UNAUTHORIZED');
  const url=env('SUPABASE_URL'),publicKey=keyFrom(env,'SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),secretKey=keyFrom(env,'SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
  if(url?.replace(/\/$/,'')!==PROJECT_ORIGIN||!publicKey||!secretKey)return reply(503,'BACKEND_NOT_CONFIGURED');
  const call=(path,{admin=false,body,method='POST'}={})=>fetcher(PROJECT_ORIGIN+path,{
    method,redirect:'error',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000),
    headers:{apikey:admin?secretKey:publicKey,...(!admin?{Authorization:authorization}:secretKey.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${secretKey}`}),'Content-Type':'application/json'},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
  let input;
  try{
    // Never trust a decoded JWT, an email, a client role or user_metadata.
    const auth=await call('/auth/v1/user',{method:'GET'});
    if(!auth.ok)return reply(auth.status===401||auth.status===403?401:503,'UNAUTHORIZED');
    const user=await auth.json();if(typeof user?.id!=='string')return reply(401,'UNAUTHORIZED');
    const roleResponse=await call('/rest/v1/rpc/studio_profile',{body:{}});
    const profile=await roleResponse.json();if(!roleResponse.ok||profile?.role!=='admin')return reply(403,'FORBIDDEN');
    const ready=await call('/rest/v1/rpc/studio_account_creation_ready',{body:{}});
    if(!ready.ok||(await ready.json())!==true)return reply(503,'BACKEND_NOT_CONFIGURED');
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return reply(415,'INVALID_INPUT');
    input=await readJson(request);
    const name=typeof input?.name==='string'?input.name.trim():'',email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
    if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['name','email','password','role','active','bookable'].includes(k))||name.length<2||name.length>80||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ||!['admin','manager','barber'].includes(input.role)||typeof input.active!=='boolean'||typeof input.bookable!=='boolean'||(input.role==='admin'&&!input.active))return reply(400,'INVALID_INPUT');
    if(typeof input.password!=='string'||input.password.length<12||input.password.length>128)return reply(400,'WEAK_PASSWORD');
    // Trigger provisions staff+membership in the same DB transaction as Auth user.
    // If role was revoked while waiting, the trigger aborts the account creation.
    let created;
    try{
      created=await call('/auth/v1/admin/users',{admin:true,body:{email,password:input.password,email_confirm:true,app_metadata:{ticabebe_staff:{actor_id:user.id,name,role:input.role,active:input.active,bookable:input.bookable}}}});
    }catch{return reply(503,'CREATION_UNCERTAIN');}
    if(!created.ok){
      const error=await created.json().catch(()=>({}));
      if(['email_exists','email_address_exists','user_already_exists'].includes(error.code)||error.msg?.toLowerCase().includes('already been registered'))return reply(409,'EMAIL_EXISTS');
      if(error.code==='weak_password'||error.weak_password)return reply(400,'WEAK_PASSWORD');
      return reply(502,'ACCOUNT_CREATE_FAILED');
    }
    // Do not return Auth response/user metadata, password, JWTs or secret keys.
    return new Response(JSON.stringify({created:true}),{status:201,headers});
  }catch(error){
    if(error?.message==='PAYLOAD_TOO_LARGE')return reply(413,'INVALID_INPUT');
    if(error?.message==='INVALID_INPUT')return reply(400,'INVALID_INPUT');
    return reply(503,'ACCOUNT_CREATE_FAILED');
  }finally{if(input&&typeof input==='object')input.password='';}
 };
}
if(typeof Deno!=='undefined')Deno.serve(createStaffHandler({env:name=>Deno.env.get(name)}));
