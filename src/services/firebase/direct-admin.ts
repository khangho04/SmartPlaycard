import { get, ref, runTransaction, update } from 'firebase/database';
import { randomUUID, digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { database } from './firebase-config';
import { auth, findAccount, type AccountRecord } from './rtdb-auth';
import { validateKey } from './record-utils';
import { accountEmail } from '../account-identity';
import { dateKey, emptyMetric, roles, validRange, type Access, type AdminSnapshot, type AdminReport, type LedgerEntry, type Branch, type AdminDevice, type AdminAlert, type Maintenance, type Audit, type Metric } from '../admin/model';
import type { Game, PlatformAdmin, Ticket, Notice } from '../platform';
import type { Card, Transaction } from './firebase-types';

type RawDevice = AdminDevice & { configVersion?: string; price?: number; gameDurationSeconds?: number; firmwareVersion?: string; gameId?: string };
type Receipt = Transaction & { requestId: string; branchId: string; reference: string; actor: string; source: string; status: string; paymentMethod: string; ownerAuthUid: string };
type RawCard = Card & { ownerAuthUid?: string; branchId?: string; _operations?: Record<string, Receipt> };
type Ops = { devices?: Record<string, AdminDevice>; branches?: Record<string, Branch>; alerts?: Record<string, AdminAlert>; maintenance?: Record<string, Maintenance>; audit?: Record<string, Audit & { branchId?: string }>; access?: Record<string, Omit<Access, 'uid'>>; settings?: { offlineSeconds: number } };
type Input = Record<string, unknown>;
const read = async <T>(path: string): Promise<T | null> => (await get(ref(database, path))).val();
const rows = <T>(value: Record<string, T> | null | undefined): (T & { id: string })[] => Object.entries(value || {}).map(([id, v]) => ({ ...v, id }));
const inScope = (access: Access, branchId?: string) => !access.branchId || access.branchId === branchId;
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function user() { const value = auth.currentUser; check(value, 'Hãy đăng nhập lại.'); return value; }
function text(v: Input, key: string, required = false, max = 1000) { const result = v[key]; check(typeof result === 'string' && result.length <= max && (!required || result.trim()), key + ' không hợp lệ.'); return result.trim(); }
function integer(v: unknown, min: number, max: number) { check(Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max, 'Số tiền/thời lượng không hợp lệ.'); return Number(v); }
export async function directAccess(): Promise<Access> {
  const u = user();
  const account = await read<AccountRecord>('accounts/' + u.uid);
  check(account && account.access === 'admin' && !account.disabled && !account.requiresPasswordChange, 'Tài khoản chưa được cấp quyền admin hoặc cần đổi mật khẩu.');
  const legacy = await read<Access>('admin/operations/access/' + u.uid);
  const role = account.isDefaultAdmin ? 'super_admin' : account.adminRole || legacy?.role || 'viewer';
  check(role in roles, 'Vai trò không hợp lệ.');
  return { uid: u.uid, email: accountEmail(account.username), role, branchId: account.isDefaultAdmin ? '' : account.branchId ?? legacy?.branchId ?? '', isDefaultAdmin: account.isDefaultAdmin };
}
function permit(access: Access, allowed: string[], branchId?: string) { check(allowed.includes(access.role) && inScope(access, branchId), 'Không có quyền hoặc ngoài phạm vi chi nhánh.'); }
function audit(access: Access, action: string, target: string, before: unknown, after: unknown, branchId = '') {
  return { actor: access.email, action, target, at: Date.now(), before: before ?? null, after: after ?? null, branchId };
}
export async function directSnapshot(): Promise<AdminSnapshot> {
  const access = await directAccess();
  const [ops, devices, support, accounts] = await Promise.all([
    read<Ops>('admin/operations'), read<Record<string, RawDevice>>('devices'),
    read<Record<string, Ticket>>('support'), access.role === 'super_admin' ? read<Record<string, AccountRecord>>('accounts') : Promise.resolve(null),
  ]);
  const data = ops || {};
  const deviceList = rows(devices).map(d => ({ ...d, ...data.devices?.[d.id], id: d.id, branchId: data.devices?.[d.id]?.branchId ?? d.branchId ?? '', firmware: d.firmwareVersion || d.firmware || '' })).filter(d => inScope(access, d.branchId));
  const ids = new Set(deviceList.map(d => d.id));
  const users = access.role === 'super_admin' ? Object.entries(accounts || {}).filter(([, a]) => a.access === 'admin').map(([uid, a]): Access => ({
    uid, email: accountEmail(a.username), role: a.isDefaultAdmin ? 'super_admin' : a.adminRole || data.access?.[uid]?.role || 'viewer',
    branchId: a.isDefaultAdmin ? '' : a.branchId ?? data.access?.[uid]?.branchId ?? '', isDefaultAdmin: a.isDefaultAdmin,
  })) : [];
  return { access, devices: deviceList, branches: rows(data.branches).filter(b => inScope(access, b.id)),
    alerts: rows(data.alerts).filter(a => ids.has(a.deviceId)).sort((a,b) => b.updatedAt-a.updatedAt),
    maintenance: rows(data.maintenance).filter(m => ids.has(m.deviceId)).sort((a,b) => a.dueDate.localeCompare(b.dueDate)),
    audit: ['super_admin','operations'].includes(access.role) ? rows(data.audit).filter(a => inScope(access, a.branchId)).sort((a,b) => b.at-a.at).slice(0,100) : [],
    users, settings: { offlineSeconds: data.settings?.offlineSeconds || 120 }, updatedAt: Date.now(),
    supportCount: ['super_admin','operations','technician'].includes(access.role) ? rows(support).filter(t => t.status === 'new' && inScope(access,t.branchId)).length : 0 };
}
export async function directMutate(action: string, target: string, value: unknown, revoke = false) {
  const access = await directAccess(); const id = validateKey(target); const v = value as Input;
  check(v && typeof v === 'object', 'Dữ liệu không hợp lệ.');
  const permitted = action === 'device' || action === 'branch' ? ['super_admin','operations'] : action === 'alert' || action === 'maintenance' ? ['super_admin','operations','technician'] : ['super_admin'];
  permit(access, permitted);
  const ops = await read<Ops>('admin/operations') || {};
  const updates: Record<string, unknown> = {};
  let path = '', before: unknown = null, after: unknown = null, branchId = '';
  if (action === 'access') {
    const found = await findAccount(text(v, 'email', true));
    check(found, 'Tài khoản chưa có trong accounts. Hãy tạo tài khoản trước.');
    check(found.uid !== access.uid && !found.account.isDefaultAdmin, 'Không thể sửa quyền của chính mình hoặc admin mặc định.');
    const role = text(v, 'role', true); branchId = text(v, 'branchId');
    check(role in roles && (role !== 'super_admin' || !branchId), 'Vai trò hoặc phạm vi không hợp lệ.');
    check(!branchId || ops.branches?.[branchId], 'Chi nhánh không tồn tại.');
    path = 'admin/operations/access/' + found.uid; before = ops.access?.[found.uid];
    after = revoke ? null : { email: accountEmail(found.account.username), role, branchId };
    updates['accounts/' + found.uid + '/access'] = revoke ? 'user' : 'admin';
    updates['accounts/' + found.uid + '/adminRole'] = revoke ? null : role;
    updates['accounts/' + found.uid + '/branchId'] = revoke ? null : branchId;
  } else if (action === 'settings') {
    path = 'admin/operations/settings'; before = ops.settings; after = { offlineSeconds: integer(v.offlineSeconds,30,3600) };
  } else if (action === 'branch') {
    branchId = id; permit(access, permitted, id); path = 'admin/operations/branches/' + id; before = ops.branches?.[id];
    after = { name: text(v,'name',true), address: text(v,'address'), manager: text(v,'manager') };
  } else if (action === 'device') {
    const device = await read<RawDevice>('devices/' + id); check(device,'Thiết bị không tồn tại.');
    permit(access, permitted, ops.devices?.[id]?.branchId ?? device.branchId ?? '');
    branchId = text(v,'branchId'); permit(access, permitted, branchId); check(!branchId || ops.branches?.[branchId],'Chi nhánh không tồn tại.');
    path = 'admin/operations/devices/' + id; before = ops.devices?.[id];
    after = { name: text(v,'name',true), branchId, note: text(v,'note') };
    updates['devices/' + id + '/branchId'] = branchId;
  } else if (action === 'alert' || action === 'maintenance') {
    const previous = action === 'alert' ? ops.alerts?.[id] : ops.maintenance?.[id];
    const deviceId = action === 'alert' ? (previous as AdminAlert | undefined)?.deviceId : validateKey(text(v,'deviceId',true));
    check(deviceId,'Cảnh báo không tồn tại.');
    const device = await read<RawDevice>('devices/' + deviceId); check(device,'Thiết bị không tồn tại.');
    branchId = ops.devices?.[deviceId]?.branchId ?? device.branchId ?? ''; permit(access,permitted,branchId);
    if (previous?.deviceId && previous.deviceId !== deviceId) {
      const oldDevice = await read<RawDevice>('devices/' + previous.deviceId);
      permit(access, permitted, ops.devices?.[previous.deviceId]?.branchId ?? oldDevice?.branchId ?? '');
    }
    path = 'admin/operations/' + (action === 'alert' ? 'alerts/' : 'maintenance/') + id; before = previous;
    const common = { assignee: text(v,'assignee'), note: text(v,'note'), branchId };
    if (action === 'alert') { const status = text(v,'status',true); check(['new','acknowledged','working','resolved'].includes(status),'Trạng thái không hợp lệ.'); after = { ...previous,...common,status,updatedAt:Date.now() }; }
    else { const dueDate = text(v,'dueDate',true); check(validRange(dueDate,dueDate) && typeof v.completed === 'boolean','Ngày/trạng thái không hợp lệ.'); after = { ...common,deviceId,dueDate,completed:v.completed,cost:integer(v.cost,0,1000000000) }; }
  } else throw new Error('Thao tác không hợp lệ.');
  updates[path] = after;
  updates['admin/operations/audit/' + randomUUID()] = audit(access,action,path,before,after,branchId);
  await update(ref(database),updates); return { ok: true };
}
export async function directPlatformSnapshot(): Promise<PlatformAdmin> {
  const access = await directAccess();
  const [games,devices,cards,tickets,branches] = await Promise.all([read<Record<string,Game>>('catalog/games'),read<Record<string,RawDevice>>('devices'),read<Record<string,RawCard>>('cards'),read<Record<string,Ticket>>('support'),read<Record<string,Branch>>('admin/operations/branches')]);
  return { access, games:rows(games).filter(g => inScope(access,g.branchId)),devices:rows(devices).filter(d => inScope(access,d.branchId)),
    branches:rows(branches).filter(b => inScope(access,b.id)),
    cards:['super_admin','operations','accountant'].includes(access.role) ? rows(cards).filter(c => inScope(access,c.branchId)).map(c => ({ id:c.id,name:c.name,balance:c.balance,active:c.active,branchId:c.branchId||'',ownerAuthUid:c.ownerAuthUid||'' })) : [],
    tickets:['super_admin','operations','technician'].includes(access.role) ? rows(tickets).filter(t => inScope(access,t.branchId)).sort((a,b) => b.updatedAt-a.updatedAt) : [] };
}
async function saveGame(v: Input) {
  const access = await directAccess(); const id = validateKey(text(v,'id',true)); const value = v.value as Input;
  check(value && typeof value === 'object','Dữ liệu game không hợp lệ.');
  const branchId = validateKey(text(value,'branchId',true)), deviceId = validateKey(text(value,'deviceId',true));
  permit(access,['super_admin','operations'],branchId);
  const [device,branch,previous] = await Promise.all([read<RawDevice>('devices/'+deviceId),read<Branch>('admin/operations/branches/'+branchId),read<Game>('catalog/games/'+id)]);
  check(device && branch,'Thiết bị hoặc chi nhánh không tồn tại.'); permit(access,['super_admin','operations'],device.branchId);
  if (previous) permit(access,['super_admin','operations'],previous.branchId);
  check(device.branchId === branchId,'Thiết bị phải thuộc chi nhánh của game.');
  check(typeof value.enabled === 'boolean','Trạng thái game không hợp lệ.');
  const game = { name:text(value,'name',true,100),description:text(value,'description',false,1000),branchId,deviceId,price:integer(value.price,0,5000000),durationSeconds:integer(value.durationSeconds,1,86400),enabled:value.enabled,version:randomUUID(),updatedAt:Date.now() };
  await update(ref(database), { ['catalog/games/'+id]:game,['catalog/deviceConfig/'+deviceId]:{...game,gameId:id},['admin/operations/audit/'+randomUUID()]:audit(access,'game',id,previous,game,branchId) }); return {ok:true};
}
async function assignCard(v: Input) {
  const access = await directAccess(); const cardUid = validateKey(text(v,'cardUid',true)),branchId = validateKey(text(v,'branchId',true));
  permit(access,['super_admin','operations'],branchId);
  const found = await findAccount(text(v,'email',true)); check(found,'Tài khoản chưa có trong accounts.');
  check(await read<Branch>('admin/operations/branches/'+branchId),'Chi nhánh không tồn tại.');
  const oldCard = await read<RawCard>('cards/'+cardUid); check(oldCard,'Thẻ không tồn tại.'); permit(access,['super_admin','operations'],oldCard.branchId);
  // A root transaction keeps old/new account links and live ownership consistent.
  const result = await runTransaction(ref(database), state => {
    if (!state) return {};
    const card = state.cards?.[cardUid] as RawCard | undefined;
    if (!card || !inScope(access,card.branchId) || !state.accounts?.[found.uid]) return;
    if (card.ownerAuthUid && state.accounts[card.ownerAuthUid]?.card && typeof state.accounts[card.ownerAuthUid].card === 'object') delete state.accounts[card.ownerAuthUid].card[cardUid];
    state.accounts[found.uid].card = typeof state.accounts[found.uid].card === 'object' ? state.accounts[found.uid].card : {};
    state.accounts[found.uid].card[cardUid] = true;
    state.cards[cardUid] = {...card,ownerAuthUid:found.uid,branchId};
    return state;
  });
  check(result.committed,'Không liên kết được thẻ.'); return {ok:true};
}
async function cashTopUp(v: Input) {
  const access = await directAccess(), cardUid = validateKey(text(v,'cardUid',true)), branchId = validateKey(text(v,'branchId',true));
  permit(access,['super_admin','accountant'],branchId);
  const amount = integer(v.amount,1,5000000),reference = text(v,'reference',true,120);
  check(await read<Branch>('admin/operations/branches/'+branchId),'Chi nhánh không tồn tại.');
  const id = 'cash-' + await digestStringAsync(CryptoDigestAlgorithm.SHA256,branchId+'\n'+reference);
  const claim = await runTransaction(ref(database,'cashReceipts/'+id), old => old || {cardUid,amount,branchId,reference});
  const claimed = claim.snapshot.val(); check(claimed?.cardUid === cardUid && claimed.amount === amount,'Biên nhận đã dùng cho thẻ hoặc số tiền khác.');
  const now = Math.floor(Date.now()/1000); let rejection = 'Không nạp được tiền vào thẻ.';
  const result = await runTransaction(ref(database,'cards/'+cardUid), (card: RawCard | null) => {
    if (!card) return null;
    if (card.branchId !== branchId) { rejection='Thẻ không thuộc chi nhánh đã chọn.'; return; }
    const existing = card._operations?.[id];
    if (existing) return existing.amount === amount && existing.reference === reference && existing.source === 'ADMIN_CASH' ? card : undefined;
    if (card.active !== true || !Number.isSafeInteger(card.balance) || Number(card.balance) < 0 || Number(card.balance)+amount > 2147483647 || !Number.isSafeInteger(card.topupCount||0) || Number(card.topupCount||0) < 0 || Number(card.topupCount||0) >= 2147483647 || !Number.isSafeInteger(card.totalTopup||0) || Number(card.totalTopup||0) < 0 || Number(card.totalTopup||0)+amount > 2147483647) { rejection='Thẻ bị khóa hoặc số dư/bộ đếm không hợp lệ.'; return; }
    const receipt: Receipt = {requestId:id,uid:cardUid,type:'TOPUP',amount,balanceBefore:card.balance,balanceAfter:Number(card.balance)+amount,timestamp:now,time:new Date(now*1000).toISOString(),source:'ADMIN_CASH',paymentMethod:'cash',status:'COMMITTED',branchId,deviceId:'cashier-'+branchId,reference,actor:access.uid,ownerAuthUid:card.ownerAuthUid||''};
    return {...card,balance:receipt.balanceAfter,topupCount:Number(card.topupCount||0)+1,totalTopup:Number(card.totalTopup||0)+amount,lastTopupAtEpoch:now,lastTopupAt:receipt.time,_operations:{...card._operations,[id]:receipt}};
  });
  const receipt = (result.snapshot.val() as RawCard | null)?._operations?.[id];
  check(result.committed && receipt,rejection);
  await runTransaction(ref(database,'transactions/'+id), old => old || receipt);
  // Reports read /transactions directly; no Function projection or ledger is required.
  return {ok:true,receipt};
}
async function appTopUp(v: Input) {
  const actor = user().uid;
  const cardUid = validateKey(text(v, 'cardUid', true));
  const amount = integer(v.amount, 1, 5000000);
  const id = 'app-' + validateKey(text(v, 'requestId', true, 120));
  const now = Math.floor(Date.now() / 1000);
  let rejection = 'Không tìm thấy thẻ trên Firebase.';
  // The root cache can initially be empty. Keep tentative results away from
  // account listeners so the initial null does not sign the customer out.
  const result = await runTransaction(ref(database), (state) => {
    if (!state) return null;
    const existing = state.transactions?.[id];
    if (existing) {
      rejection = 'Mã giao dịch đã được sử dụng cho thẻ hoặc số tiền khác.';
      return existing.uid === cardUid && existing.amount === amount && existing.actor === actor && existing.source === 'APP_DEMO' ? state : undefined;
    }
    const card = state.cards?.[cardUid];
    if (!card) return;
    if (!Number.isSafeInteger(card.balance) || card.balance < 0 || card.balance + amount > 2147483647 || !Number.isSafeInteger(card.topupCount ?? 0) || (card.topupCount ?? 0) < 0 || (card.topupCount ?? 0) >= 2147483647 || !Number.isSafeInteger(card.totalTopup ?? 0) || (card.totalTopup ?? 0) < 0 || (card.totalTopup ?? 0) + amount > 2147483647) {
      rejection = 'Số dư hoặc bộ đếm của thẻ không hợp lệ.';
      return;
    }
    const receipt = { uid: cardUid, type: 'TOPUP', amount, balanceBefore: card.balance, balanceAfter: card.balance + amount, timestamp: now, time: new Date(now * 1000).toISOString(), branchId: card.branchId || '', deviceId: 'app', source: 'APP_DEMO', paymentMethod: 'demo', status: 'COMMITTED', actor, requestId: id };
    state.cards[cardUid] = { ...card, balance: receipt.balanceAfter, topupCount: (card.topupCount ?? 0) + 1, totalTopup: (card.totalTopup ?? 0) + amount, lastTopupAt: receipt.time, lastTopupAtEpoch: now };
    state.transactions = { ...state.transactions, [id]: receipt };
    return state;
  }, { applyLocally: false });
  const receipt = result.snapshot.val()?.transactions?.[id];
  check(result.committed && receipt, rejection);
  return { ok: true, receipt };
}
async function replySupport(v: Input) {
  const access = await directAccess(),id=validateKey(text(v,'id',true)),requestId=validateKey(text(v,'requestId',true));
  const reply=text(v,'reply',true,2000),status=text(v,'status',true); check(['new','working','resolved'].includes(status),'Trạng thái không hợp lệ.');
  const before=await read<Ticket>('support/'+id); check(before,'Yêu cầu không tồn tại.'); permit(access,['super_admin','operations','technician'],before.branchId);
  const result=await runTransaction(ref(database,'support/'+id),(ticket:Ticket & {replyRequestId?:string}|null)=>{
    if (!ticket) return null;
    if (!inScope(access,ticket.branchId)) return;
    if (ticket.replyRequestId===requestId) return ticket.reply===reply && ticket.status===status ? ticket : undefined;
    return {...ticket,reply,status,repliedBy:access.uid,replyRequestId:requestId,updatedAt:Date.now()};
  });
  check(result.committed,'Không lưu được phản hồi.');
  const ticket=result.snapshot.val() as Ticket;
  await runTransaction(ref(database,'userData/'+ticket.userId+'/notifications/support-'+requestId),old=>old||{title:'Phản hồi hỗ trợ',message:reply,type:'support',ticketId:id,createdAt:Date.now(),read:false}); return {ok:true};
}
type RawTransaction = Transaction & { branchId?:string; paymentMethod?:string; status?:string; durationSeconds?:number };
export async function transactionEntries(): Promise<LedgerEntry[]> {
  const access=await directAccess(); permit(access,['super_admin','accountant','viewer']);
  const [transactions,cards,devices] = await Promise.all([read<Record<string,RawTransaction>>('transactions'),read<Record<string,RawCard>>('cards'),read<Record<string,RawDevice>>('devices')]);
  return rows(transactions).flatMap(t=>{
    const branchId=t.branchId || (t.deviceId ? devices?.[t.deviceId]?.branchId : '') || (t.uid ? cards?.[t.uid]?.branchId : '') || '';
    if (!inScope(access,branchId) || !['TOPUP','PLAY','REFUND'].includes(t.type||'') || !Number.isSafeInteger(t.amount) || !Number.isFinite(t.timestamp)) return [];
    const kind=t.type==='PLAY'?'session':t.type==='REFUND'?'refund':'payment';
    return [{id:t.id,branchId,deviceId:t.deviceId||'unknown',kind,amount:kind==='session'?0:Math.abs(Number(t.amount)),status:t.status==='failed'?'failed':t.status==='pending'?'pending':'success',paymentMethod:t.paymentMethod||'card',occurredAt:Number(t.timestamp)*1000,durationSeconds:t.durationSeconds||0} satisfies LedgerEntry];
  }).sort((a,b)=>b.occurredAt-a.occurredAt || b.id.localeCompare(a.id));
}
function metrics(entries:LedgerEntry[]):Metric {
  const value=emptyMetric();
  for (const e of entries) {
    if (e.kind==='payment') { if(e.status==='success'){value.gross+=e.amount;value.success++;}else value[e.status]++; }
    else if(e.kind==='refund' && e.status==='success')value.refunds+=e.amount;
    else if(e.kind==='session' && e.status==='success'){value.sessions++;value.duration+=e.durationSeconds||0;}
  }
  return value;
}
export async function directReport(start:string,end:string,branchId:string,deviceId:string):Promise<AdminReport> {
  check(validRange(start,end),'Khoảng ngày không hợp lệ; tối đa 366 ngày.');
  const access=await directAccess();check(!branchId||inScope(access,branchId),'Ngoài phạm vi chi nhánh.');
  const entries=(await transactionEntries()).filter(e=>e.occurredAt>0 && (!branchId||e.branchId===branchId) && (!deviceId||e.deviceId===deviceId));
  const window=(a:string,b:string)=>entries.filter(e=>dateKey(e.occurredAt)>=a && dateKey(e.occurredAt)<=b);
  const selected=window(start,end),days=[];
  for(let t=Date.parse(start);t<=Date.parse(end);t+=86400000){const day=new Date(t).toISOString().slice(0,10);days.push({day,...metrics(window(day,day))});}
  const span=Date.parse(end)-Date.parse(start)+86400000,previousStart=new Date(Date.parse(start)-span).toISOString().slice(0,10),previousEnd=new Date(Date.parse(start)-86400000).toISOString().slice(0,10),today=dateKey();
  const rank:Record<string,number>={},methods:Record<string,number>={},hours:Record<string,number>={};
  for(const e of selected){if(e.kind==='payment'&&e.status==='success'){rank[e.deviceId]=(rank[e.deviceId]||0)+e.amount;methods[e.paymentMethod]=(methods[e.paymentMethod]||0)+1;}else if(e.kind==='refund'&&e.status==='success')rank[e.deviceId]=(rank[e.deviceId]||0)-e.amount;else if(e.kind==='session'&&e.status==='success'){const hour=new Date(e.occurredAt+7*3600000).toISOString().slice(11,13);hours[hour]=(hours[hour]||0)+1;}}
  return {days,previous:metrics(window(previousStart,previousEnd)),today:metrics(window(today,today)),month:metrics(window(today.slice(0,7)+'-01',today)),year:metrics(window(today.slice(0,4)+'-01-01',today)),ranking:Object.entries(rank).map(([id,net])=>({id,name:id,net})).sort((a,b)=>b.net-a.net),methods,hours,updatedAt:selected.length?Math.max(...selected.map(e=>e.occurredAt)):null};
}
export async function directLedger(cursor?:string) {
  const entries=await transactionEntries();
  const index=cursor?entries.findIndex(e=>e.id===cursor):-1;
  check(!cursor||index>=0,'Trang giao dịch đã thay đổi. Hãy làm mới.');
  const list=entries.slice(index+1,index+52); return {rows:list.slice(0,50),next:list.length>50?list[49].id:null};
}
export async function directCall<T>(name:string,data:unknown={}):Promise<T> {
  const v=data as Input; let result:unknown;
  if(name==='adminSnapshot')result=await directSnapshot();
  else if(name==='adminMutate')result=await directMutate(String(v.action),String(v.id),v.value,v.revoke===true);
  else if(name==='adminReport')result=await directReport(String(v.start),String(v.end),String(v.branchId||''),String(v.deviceId||''));
  else if(name==='adminLedger')result=await directLedger(v.cursor?String(v.cursor):undefined);
  else if(name==='adminPlatformSnapshot')result=await directPlatformSnapshot();
  else if(name==='adminGameSave')result=await saveGame(v);
  else if(name==='adminCardAssign')result=await assignCard(v);
  else if(name==='adminCashTopUp')result=await cashTopUp(v);
  else if(name==='userTopUp')result=await appTopUp(v);
  else if(name==='adminSupportReply')result=await replySupport(v);
  else if(name==='userProfileSave'){const u=user(),profile={name:text(v,'name',true,100),phone:text(v,'phone',false,20)};check(!profile.phone||/^\+?[0-9]{9,15}$/.test(profile.phone),'Số điện thoại không hợp lệ.');await update(ref(database,'userData/'+u.uid+'/profile'),profile);result={ok:true};}
  else if(name==='userNoticeRead'){const u=user(),id=validateKey(text(v,'id',true));check(await read<Notice>('userData/'+u.uid+'/notifications/'+id),'Thông báo không tồn tại.');await update(ref(database,'userData/'+u.uid+'/notifications/'+id),{read:true});result={ok:true};}
  else if(name==='userSupportCreate'){
    const u=user(),id=validateKey(text(v,'id',true)),cardUid=text(v,'cardUid'),gameId=text(v,'gameId');
    const card=cardUid?await read<RawCard>('cards/'+validateKey(cardUid)):null;
    if(cardUid)check(card,'Không tìm thấy dữ liệu thẻ trên Firebase.');
    const game=gameId?await read<Game>('catalog/games/'+validateKey(gameId)):null,category=text(v,'category',true);check(['card','topup','game','other'].includes(category),'Loại hỗ trợ không hợp lệ.');
    const ticket={id,userId:u.uid,email:u.email,category,title:text(v,'title',true,120),message:text(v,'message',true,2000),cardUid,gameId,deviceId:game?.deviceId||'',branchId:game?.branchId||card?.branchId||'',reply:'',status:'new',createdAt:Date.now(),updatedAt:Date.now()};
    const saved=await runTransaction(ref(database,'support/'+id),old=>{if(!old)return ticket;if(old.userId===u.uid&&old.title===ticket.title&&old.message===ticket.message)return old;return;});check(saved.committed,'Mã yêu cầu đã được sử dụng.');result={id};
  }
  else if(name==='userSnapshot'){const {readUserWallet}=await import('./user-wallet');result=await readUserWallet(user().uid,v.cardUid?String(v.cardUid):null);}
  else throw new Error('Tác vụ RTDB chưa được hỗ trợ: '+name);
  return result as T;
}
