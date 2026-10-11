/* global __dirname */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const crypto=require('node:crypto');
function fixture(initial={}) {
  let state=structuredClone(initial);
  const storage=new Map(),watchers=new Set();
  const valueAt=p=>p.split('/').filter(Boolean).reduce((v,k)=>v?.[k],state)??null;
  const snapshot=value=>({val:()=>structuredClone(value),exists:()=>value!=null});
  function put(p,v) {if(!p){state=structuredClone(v);return;}const keys=p.split('/'),leaf=keys.pop();let parent=state;for(const k of keys)parent=parent[k]??={};if(v===null)delete parent[leaf];else parent[leaf]=structuredClone(v);}
  function notify(){for(const w of [...watchers])w.fn(snapshot(valueAt(w.path)));}
  let failPath='';
  let queryError=null;
  const reads=[];
  const database={
    ref:(_,key='')=>({key}),orderByChild:field=>({field}),equalTo:equal=>({equal}),query:(r,...parts)=>Object.assign(r,...parts),
    get:async r=>{reads.push({...r});if(r.field&&queryError)throw queryError;let value=valueAt(r.key);if(r.field)value=Object.fromEntries(Object.entries(value||{}).filter(([,v])=>v[r.field]===r.equal));return snapshot(value);},
    onValue:(r,fn)=>{const w={path:r.key,fn};watchers.add(w);fn(snapshot(valueAt(r.key)));return()=>watchers.delete(w);},
    runTransaction:async(r,fn,options)=>{if(r.key===failPath && failPath)throw Error('network');const first=fn(null);if(first===undefined)return{committed:false,snapshot:snapshot(valueAt(r.key))};if(!r.key&&first===null&&options?.applyLocally!==false){for(const w of [...watchers])w.fn(snapshot(null));}const result=fn(structuredClone(valueAt(r.key)));if(result===undefined)return{committed:false,snapshot:snapshot(valueAt(r.key))};put(r.key,result);notify();return{committed:true,snapshot:snapshot(result)};},
    update:async(r,values)=>{for(const[k,v]of Object.entries(values))put((r.key?r.key+'/':'')+k,v);notify();},
  };
  const modules=new Map();
  const mocks={
    'firebase/database':database,
    'expo-crypto':{randomUUID:crypto.randomUUID,getRandomBytesAsync:async n=>new Uint8Array(crypto.randomBytes(n)),CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(alg,s)=>crypto.createHash(alg).update(s).digest('hex')},
    '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async k=>storage.get(k)||null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)}},
  };
  function load(file) {
    const absolute=path.resolve(__dirname,'../',file);
    if(modules.has(absolute))return modules.get(absolute).exports;
    const module={exports:{}};modules.set(absolute,module);
    const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    new Function('require','module','exports',code)(name=>{
      if(mocks[name])return mocks[name];
      if(name==='./firebase-config')return{database:{}};
      if(name.startsWith('.'))return load(path.relative(path.resolve(__dirname,'..'),path.resolve(path.dirname(absolute),name))+'.ts');
      return require(name);
    },module,module.exports);
    return module.exports;
  }
  const auth=load('src/services/firebase/rtdb-auth.ts');
  const admin=load('src/services/firebase/direct-admin.ts');
  return {get state(){return state;},storage,auth,admin,notify,reads,queryError:e=>{queryError=e;},fail:p=>{failPath=p;}};
}
test('missing username index falls back to direct accounts read and admin still logs in',async()=>{
  const f=fixture({accounts:{legacy:{username:'someone',access:'user'}}});
  f.queryError(Error('Index not defined, add ".indexOn": "username", for path "/accounts", to the rules'));
  await f.auth.loginDatabase('admin','123456');
  assert.equal(f.auth.auth.currentUser.username,'admin');
  assert.equal(f.auth.auth.currentUser.requiresPasswordChange,true);
  assert.ok(f.reads.some(r=>r.key==='accounts'&&!r.field));
  assert.equal((await f.auth.findAccount('someone')).uid,'legacy');
  assert.equal(await f.auth.findAccount('unknown'),null);
  f.state.accounts.duplicate={username:'someone',access:'user'};
  await assert.rejects(f.auth.findAccount('someone'),/bị trùng/);
  await f.auth.logoutDatabase();
});
test('account lookup keeps permission and network failures instead of silently falling back',async()=>{
  const f=fixture();
  for(const message of ['Permission denied','Network unavailable']){
    const error=Error(message);f.queryError(error);
    await assert.rejects(f.auth.findAccount('admin'),e=>e===error);
  }
  assert.equal(f.reads.filter(r=>!r.field).length,0);
});
test('RTDB default admin initializes once, verifies password and forces first change without Firebase Auth',async()=>{
  const f=fixture();
  await assert.rejects(f.auth.loginDatabase('admin','wrong'),/mật khẩu không đúng/);
  assert.equal(f.state.accounts.admin.access,'admin');
  assert.equal(f.state.accounts.admin.adminRole,'super_admin');
  assert.equal(f.state.accounts.admin.requiresPasswordChange,true);
  assert.equal(JSON.stringify(f.state).includes('123456'),false);
  const first=f.state.accounts.admin.credential;
  await f.auth.loginDatabase('ADMIN','123456');
  await assert.rejects(f.admin.directSnapshot(),/cần đổi mật khẩu/);
  assert.equal(f.auth.auth.currentUser.isDefaultAdmin,true);
  await f.auth.changeDatabasePassword(null,'new-password-123');
  assert.equal(f.auth.auth.currentUser,null);
  assert.equal(f.state.accounts.admin.requiresPasswordChange,false);
  assert.notEqual(f.state.accounts.admin.credential.version,first.version);
  await assert.rejects(f.auth.loginDatabase('admin','123456'),/mật khẩu không đúng/);
  await f.auth.loginDatabase('admin','new-password-123');
  assert.equal((await f.admin.directSnapshot()).access.role,'super_admin');
  await f.auth.logoutDatabase();
});
test('RTDB registration preserves account identity, rejects duplicates and verifies current password',async()=>{
  const f=fixture();
  await f.auth.registerDatabase(' Alice ','password-123');
  assert.equal(f.state.accounts.alice.access,'user');
  assert.equal(f.auth.auth.currentUser,null);
  await assert.rejects(f.auth.registerDatabase('ALICE','password-456'),/đã được sử dụng/);
  await assert.rejects(f.auth.registerDatabase('admin','password-123'),/dành cho/);
  await f.auth.loginDatabase('alice','password-123');
  await assert.rejects(f.auth.changeDatabasePassword('wrong','password-456'),/không đúng/);
  await f.auth.changeDatabasePassword('password-123','password-456');
  await assert.rejects(f.auth.loginDatabase('alice','password-123'),/không đúng/);
  await f.auth.loginDatabase('alice','password-456');
  await assert.rejects(f.admin.directSnapshot(),/chưa được cấp quyền/);
  await f.auth.logoutDatabase();
});
test('RTDB accepts arbitrary six-character passwords for registration and password changes',async()=>{
  const f=fixture();
  await assert.rejects(f.auth.registerDatabase('short','12345'),/ít nhất 6/);
  for(const [name,password] of [['digits','123456'],['letters','abcdef'],['symbols','!@#$%^'],['spaces',' a! 9?']]){
    await f.auth.registerDatabase(name,password);
    await f.auth.loginDatabase(name,password);
    await assert.rejects(f.auth.changeDatabasePassword(password,'12345'),/ít nhất 6/);
    await f.auth.changeDatabasePassword(password,'654321');
    await f.auth.loginDatabase(name,'654321');
    await f.auth.changeDatabasePassword('654321','123456');
    await f.auth.loginDatabase(name,'123456');
    await f.auth.logoutDatabase();
  }
  await f.auth.loginDatabase('admin','123456');
  await f.auth.changeDatabasePassword(null,'abcdef');
  await f.auth.loginDatabase('admin','abcdef');
  assert.equal(f.auth.auth.currentUser.requiresPasswordChange,false);
  await f.auth.logoutDatabase();
});

test('RTDB initialization keeps legacy UID and card links; changed credentials invalidate persisted sessions',async()=>{
  const f=fixture({accounts:{oldUid:{username:'admin',createdAt:'2020',access:'admin',card:{AABB:true}}}});
  await f.auth.loginDatabase('admin','123456');
  assert.equal(f.auth.auth.currentUser.uid,'oldUid');
  assert.deepEqual(f.state.accounts.oldUid.card,{AABB:true});
  assert.equal(f.state.accounts.admin,undefined);
  const stored=[...f.storage.values()][0];
  await f.auth.logoutDatabase();
  f.storage.set('smartplaycard.rtdb.session.v1',stored);
  await f.auth.restoreDatabaseSession();
  assert.equal(f.auth.auth.currentUser.uid,'oldUid');
  f.state.accounts.oldUid.credential.version='changed';
  f.notify();
  assert.equal(f.auth.auth.currentUser,null);
  await f.auth.logoutDatabase();
});
test('RTDB admin grants and revokes roles atomically, protects default admin and keeps cards',async()=>{
  const f=fixture();
  await f.auth.loginDatabase('admin','123456');await f.auth.changeDatabasePassword(null,'new-password-123');
  await f.auth.registerDatabase('staff','staff-password');
  f.state.accounts.staff.card={AABB:true};
  f.state.admin={operations:{branches:{B1:{name:'One'},B2:{name:'Two'}}}};
  await f.auth.loginDatabase('admin','new-password-123');
  const value={email:'staff',role:'viewer',branchId:'B1'};
  await f.admin.directMutate('access','new',value);
  assert.equal(f.state.accounts.staff.access,'admin');assert.equal(f.state.accounts.staff.adminRole,'viewer');
  assert.equal(f.state.admin.operations.access.staff.role,'viewer');
  await assert.rejects(f.admin.directMutate('access','admin',{email:'admin',role:'viewer',branchId:''}),/Không thể/);
  await f.admin.directMutate('access','staff',value,true);
  assert.equal(f.state.accounts.staff.access,'user');assert.deepEqual(f.state.accounts.staff.card,{AABB:true});
  assert.equal(f.state.admin.operations.access.staff,undefined);
  assert.equal(Object.keys(f.state.admin.operations.audit).length,2);
  await f.auth.logoutDatabase();
});
test('RTDB cash retries after history failure credit once and report the live transaction',async()=>{
  const f=fixture({cards:{AABBCCDD:{active:true,balance:0,branchId:'B1'}},admin:{operations:{branches:{B1:{name:'One'}}}}});
  await f.auth.loginDatabase('admin','123456');await f.auth.changeDatabasePassword(null,'new-password-123');await f.auth.loginDatabase('admin','new-password-123');
  const data={id:'intent',cardUid:'AABBCCDD',branchId:'B1',amount:5000,reference:'receipt-001'};
  const receiptId='cash-'+crypto.createHash('sha256').update('B1\nreceipt-001').digest('hex');
  f.fail('transactions/'+receiptId);
  await assert.rejects(f.admin.directCall('adminCashTopUp',data),/network/);
  assert.equal(f.state.cards.AABBCCDD.balance,5000);
  f.fail('');
  await f.admin.directCall('adminCashTopUp',{...data,id:'another-intent'});
  await f.admin.directCall('adminCashTopUp',data);
  assert.equal(f.state.cards.AABBCCDD.balance,5000);assert.equal(f.state.cards.AABBCCDD.topupCount,1);
  assert.equal(Object.keys(f.state.transactions).length,1);
  assert.equal((await f.admin.directLedger()).rows[0].amount,5000);
  const day=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  assert.equal((await f.admin.directReport(day,day,'B1','')).today.gross,5000);
  await f.auth.logoutDatabase();
});
test('RTDB app topup credits an entered UID and commits history once across retries',async()=>{
  const f=fixture({cards:{RFID:{balance:1000,name:'Live card',playCount:7}}});
  await f.auth.registerDatabase('customer','123456');
  await f.auth.loginDatabase('customer','123456');
  const request={cardUid:'RFID',amount:50000,requestId:'same-request'};
  await f.admin.directCall('userTopUp',request);
  assert.equal(f.auth.auth.currentUser?.uid,'customer','topup must keep the logged-in session during root transaction initialization');
  assert.ok(f.storage.has('smartplaycard.rtdb.session.v1'));
  await f.admin.directCall('userTopUp',request);
  assert.equal(f.state.cards.RFID.balance,51000);
  assert.equal(f.state.cards.RFID.topupCount,1);
  assert.equal(f.state.cards.RFID.totalTopup,50000);
  assert.equal(f.state.cards.RFID.playCount,7);
  assert.equal(f.state.cards.RFID.name,'Live card');
  assert.equal(Object.keys(f.state.transactions).length,1);
  assert.equal(f.state.transactions['app-same-request'].balanceBefore,1000);
  assert.equal(f.state.transactions['app-same-request'].balanceAfter,51000);
  assert.equal(f.state.transactions['app-same-request'].source,'APP_DEMO');
  await assert.rejects(f.admin.directCall('userTopUp',{...request,amount:10000}),/đã được sử dụng/);
  for(const amount of [0,-1,1.5,5000001]) await assert.rejects(f.admin.directCall('userTopUp',{...request,amount,requestId:'invalid'}),/không hợp lệ/);
  await assert.rejects(f.admin.directCall('userTopUp',{...request,cardUid:'MISSING',requestId:'missing'}),/Không tìm thấy/);
  assert.equal(f.state.cards.RFID.balance,51000);
  assert.equal(Object.keys(f.state.transactions).length,1);
  await f.auth.logoutDatabase();
});

test('RTDB card assignment updates both account links and preserves balance',async()=>{
  const f=fixture({accounts:{old:{username:'old',card:{AABBCCDD:true},access:'user'}},cards:{AABBCCDD:{balance:12000,ownerAuthUid:'old',branchId:'B1'}},admin:{operations:{branches:{B1:{name:'One'}}}}});
  await f.auth.loginDatabase('admin','123456');await f.auth.changeDatabasePassword(null,'new-password-123');await f.auth.registerDatabase('alice','password-123');await f.auth.loginDatabase('admin','new-password-123');
  await f.admin.directCall('adminCardAssign',{cardUid:'AABBCCDD',email:'alice',branchId:'B1'});
  assert.equal(f.state.cards.AABBCCDD.balance,12000);assert.equal(f.state.cards.AABBCCDD.ownerAuthUid,'alice');
  assert.equal(f.state.accounts.old.card.AABBCCDD,undefined);assert.equal(f.state.accounts.alice.card.AABBCCDD,true);
  assert.equal(f.state.accounts.alice.access,'user');
  await f.auth.logoutDatabase();
});
test('RTDB games enforce app branch scope and synchronize device configuration without Functions',async()=>{
  const f=fixture({devices:{D1:{branchId:'B1'},D2:{branchId:'B2'}},admin:{operations:{branches:{B1:{name:'One'},B2:{name:'Two'}}}}});
  await f.auth.loginDatabase('admin','123456');await f.auth.changeDatabasePassword(null,'new-password-123');await f.auth.registerDatabase('operator','operator-password');await f.auth.loginDatabase('admin','new-password-123');
  await f.admin.directMutate('access','new',{email:'operator',role:'operations',branchId:'B1'});
  await f.auth.logoutDatabase();await f.auth.loginDatabase('operator','operator-password');
  assert.deepEqual((await f.admin.directSnapshot()).branches.map(b=>b.id),['B1']);
  const game={name:'Game',description:'',deviceId:'D1',branchId:'B1',price:1000,durationSeconds:60,enabled:true};
  await f.admin.directCall('adminGameSave',{id:'game1',value:game});
  assert.equal(f.state.catalog.deviceConfig.D1.version,f.state.catalog.games.game1.version);
  await assert.rejects(f.admin.directCall('adminGameSave',{id:'game2',value:{...game,deviceId:'D2',branchId:'B2'}}),/ngoài phạm vi/);
  assert.equal(f.state.catalog.games.game2,undefined);
  await f.auth.logoutDatabase();
});
test('RTDB support replies reach the customer notification and profile writes preserve account roles',async()=>{
  const f=fixture({cards:{AABBCCDD:{ownerAuthUid:'customer',branchId:'B1',balance:0}},admin:{operations:{branches:{B1:{name:'One'}}}}});
  await f.auth.registerDatabase('customer','customer-password');await f.auth.loginDatabase('customer','customer-password');
  await f.admin.directCall('userProfileSave',{name:'Customer',phone:'',access:'admin'});
  assert.equal(f.state.accounts.customer.access,'user');assert.equal(f.state.userData.customer.profile.access,undefined);
  const ticket={id:'ticket1',title:'Help',message:'Card issue',category:'card',cardUid:'AABBCCDD',gameId:''};
  await f.admin.directCall('userSupportCreate',ticket);await f.admin.directCall('userSupportCreate',ticket);
  assert.equal(Object.keys(f.state.support).length,1);
  await f.auth.logoutDatabase();await f.auth.loginDatabase('admin','123456');await f.auth.changeDatabasePassword(null,'new-password-123');await f.auth.loginDatabase('admin','new-password-123');
  await f.admin.directCall('adminSupportReply',{id:'ticket1',requestId:'reply1',reply:'Fixed',status:'resolved'});
  assert.equal(f.state.support.ticket1.status,'resolved');assert.equal(f.state.userData.customer.notifications['support-reply1'].message,'Fixed');
  await f.auth.logoutDatabase();await f.auth.loginDatabase('customer','customer-password');
  await f.admin.directCall('userNoticeRead',{id:'support-reply1'});
  assert.equal(f.state.userData.customer.notifications['support-reply1'].read,true);
  await f.auth.logoutDatabase();
});
