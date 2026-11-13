import {spawnSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const message=process.argv.slice(2).join(' ').trim();
if(!message)throw new Error('Cần mô tả thay đổi: node scripts/deploy.mjs "Mô tả thay đổi"');
function run(command,args,{capture=false,allowed=[0]}={}){
  const result=spawnSync(command,args,{cwd,encoding:'utf8',stdio:capture?'pipe':'inherit',shell:false,windowsHide:true});
  if(result.error)throw result.error;
  if(!allowed.includes(result.status))throw new Error(`Lệnh ${command} thất bại (mã ${result.status}). Dừng triển khai.`);
  return capture?result.stdout.trim():result.status;
}
if(run('git',['branch','--show-current'],{capture:true})!=='main')throw new Error('Chỉ triển khai từ nhánh main.');
const remote=run('git',['remote','get-url','origin'],{capture:true});
if(!['https://github.com/IbrahimVu/ticabebe-booking.git','https://github.com/IbrahimVu/ticabebe-booking'].includes(remote))throw new Error('Remote origin không phải repository TiCaBeBe đã cấu hình.');
run('git',['fetch','origin','main']);
run('git',['merge-base','--is-ancestor','origin/main','HEAD']);
const tests=(await readdir(new URL('../tests/',import.meta.url))).filter(name=>name.endsWith('.test.mjs')).map(name=>`tests/${name}`);
run(process.execPath,['--test',...tests]);
run(process.execPath,['scripts/sync-pages.mjs']);
run('git',['diff','--check']);
run('git',['add','--','.gitignore','AGENTS.md','README.md','docs','package.json','pnpm-lock.yaml','public','scripts','supabase','tests','.github','app.mjs','booking.mjs','compact.css','config.js','index.html','mobile.css','style.css','schema.sql']);
const changed=run('git',['diff','--cached','--quiet'],{allowed:[0,1]});
if(changed===1)run('git',['commit','-m',message]);
run('git',['push','origin','main']);
console.log('Đã push lên GitHub. Theo dõi Pages build and deployment cho commit vừa gửi.');
console.log('Website: https://ibrahimvu.github.io/ticabebe-booking/');
