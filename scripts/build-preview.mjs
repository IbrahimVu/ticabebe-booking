import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const [html,css,mobileCss,compactCss,helpers,security,app,api]=await Promise.all(['public/index.html','public/style.css','public/mobile.css','public/compact.css','public/booking.mjs','public/security.mjs','public/app.mjs','scripts/preview-api.js'].map(read));
const start=app.indexOf('async function request('),end=app.indexOf('const rpc=');
if(start<0 || end<start) throw new Error('Không tìm thấy đoạn kết nối để dựng bản xem thử.');
const localApp=(app.slice(0,start)+`async function request(path,options={}) { return previewRequest(path,options); }\n`+app.slice(end))
  .replace(/^import[^\n]+\n/gm,'').replaceAll('ticabebe-session','ticabebe-preview-session');
const config=`window.APP_CONFIG={supabaseUrl:'preview',supabaseKey:'preview',adminId:'admin',adminEmail:'demo@ticabebe.local'};`;
const js=[helpers.replace(/^export /gm,''),security.replace(/^export /gm,''),api,config,localApp].join('\n').replace(/<\/script/gi,'<\\/script');
const scriptHash=createHash('sha256').update('\n'+js+'\n').digest('base64');
const banner=`<details class="preview-banner"><summary>Bản thử · Admin: <b>admin / admin123</b></summary><div><p>Dữ liệu chỉ lưu trên trình duyệt này. Có lịch mẫu hôm nay và ngày mai; chưa nhận lịch thật.</p><button type="button" class="secondary" id="reset-preview">Khôi phục dữ liệu mẫu</button></div></details>`;
const extra=`.preview-banner{max-width:1160px;margin:0 auto;padding:0 16px;background:#fcf6e9;border-bottom:1px solid #e2ceaa;font-size:11px;color:#735925}.preview-banner summary{min-height:36px;display:flex;align-items:center;gap:5px;cursor:pointer}.preview-banner summary:after{content:'⌄';margin-left:auto}.preview-banner[open] summary:after{content:'⌃'}.preview-banner>div{padding:4px 0 12px}.preview-banner p{font-size:12px;margin-bottom:8px}`;
const output=html.replace('<title>TiCaBeBe · Đặt lịch cắt tóc</title>','<title>TiCaBeBe · Bản xem thử</title>')
  .replace("script-src 'self'",`script-src 'sha256-${scriptHash}'`)
  .replace('<link rel="stylesheet" href="./style.css"><link rel="stylesheet" href="./mobile.css">',`<style>${css.replace(/^@import[^\n]+\n/,'')}\n${mobileCss}\n${extra}</style>`)
  .replace('<link rel="stylesheet" href="./compact.css">',()=>`<style>${compactCss}</style>`)
  .replace('<main id="app"></main>',banner+'<main id="app"></main>')
  .replace('<script src="./config.js"></script><script type="module" src="./app.mjs"></script>',()=>`<script>\n${js}\n</script>`);
await writeFile(new URL('TiCaBeBe-xem-thu.html',root),output);
console.log('Đã tạo TiCaBeBe-xem-thu.html — mở trực tiếp, không cần máy chủ hay Supabase.');
