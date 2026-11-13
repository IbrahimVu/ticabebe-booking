import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const files=['app.mjs','booking.mjs','compact.css','config.js','index.html','mobile.css','style.css'].map(name=>[new URL(`public/${name}`,root),new URL(name,root)]);
files.push([new URL('supabase/schema.sql',root),new URL('schema.sql',root)]);
const check=process.argv.includes('--check');
for(const [source,destination] of files){
  const content=await readFile(source);
  if(check){
    const actual=await readFile(destination);
    if(!content.equals(actual))throw new Error(`File xuất bản chưa đồng bộ: ${destination.pathname}. Chạy node scripts/sync-pages.mjs.`);
  }else await writeFile(destination,content);
}
console.log(check?'PASS: file Pages khớp mã nguồn.':`Đã đồng bộ ${files.length} file cho GitHub Pages.`);
