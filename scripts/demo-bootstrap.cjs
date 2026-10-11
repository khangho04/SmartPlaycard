// RTDB demo only. No Firebase Auth, Admin SDK or service credentials.
const { pbkdf2Sync, randomBytes, randomUUID } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
function credential() {
  const salt = randomBytes(16).toString('hex');
  return { algorithm: 'pbkdf2-sha256', salt, hash: pbkdf2Sync('123456', Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex'), iterations: 100000, version: randomUUID() };
}
function account(existing = {}) { return { username:'admin',createdAt:new Date().toISOString(),card:'',...existing,access:'admin',adminRole:'super_admin',branchId:'',isDefaultAdmin:true,requiresPasswordChange:true,credential:credential() }; }
async function main() {
  const seedPath = resolve(__dirname,'../docs/admin-account.json');
  if (process.argv.includes('--seed-only')) { writeFileSync(seedPath,JSON.stringify(account(),null,2)+'\n'); console.log('Đã tạo docs/admin-account.json. Import vào /accounts/admin, không import vào gốc database.'); return; }
  const base = 'https://rfid-001-270d9-default-rtdb.asia-southeast1.firebasedatabase.app';
  const filter = new URLSearchParams({orderBy:JSON.stringify('username'),equalTo:JSON.stringify('admin')});
  let lookup = await fetch(base+'/accounts.json?'+filter,{signal:AbortSignal.timeout(15000)});
  const unindexed = lookup.status === 400;
  if (unindexed) lookup = await fetch(base+'/accounts.json',{signal:AbortSignal.timeout(15000)});
  if (!lookup.ok) throw new Error('Realtime Database chặn đọc/ghi hoặc chưa có index username (HTTP '+lookup.status+'). Publish admin-backend/database.rules.json trong Firebase Console trước.');
  const entries = Object.entries(await lookup.json() || {}).filter(([, value]) => !unindexed || value?.username === 'admin');
  if(entries.length>1)throw new Error('Tên admin bị trùng trong accounts.');
  const uid=entries[0]?.[0]||'admin';
  const url=base+'/accounts/'+encodeURIComponent(uid)+'.json';
  const response=await fetch(url,{headers:{'X-Firebase-ETag':'true'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Không đọc được tài khoản admin (HTTP '+response.status+').');
  const existing=await response.json();
  if(existing?.credential){console.log('Tài khoản admin RTDB đã tồn tại. Giữ nguyên mật khẩu và dữ liệu.');return;}
  const created=account(existing||{});
  const result=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','if-match':response.headers.get('etag')},body:JSON.stringify(created),signal:AbortSignal.timeout(15000)});
  if(result.status===412)throw new Error('Dữ liệu đã thay đổi; chạy lại để kiểm tra, không ghi đè.');
  if(!result.ok)throw new Error('Không tạo được admin (HTTP '+result.status+'). Kiểm tra Rules RTDB.');
  console.log('Đã tạo admin / 123456 tại accounts/'+uid+'. Bắt buộc đổi mật khẩu lần đầu.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
