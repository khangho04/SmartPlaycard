const { test } = require('node:test');
const assert = require('node:assert/strict');
const p = require('../admin-backend/platform-core.cjs');
const { applyRequest } = require('../admin-backend/device-money.cjs');
const platform = require('../admin-backend/platform.cjs');
function fixture() {
  const state = {
    admin: { operations: { access: { admin: { role: 'super_admin', branchId: '' }, ops: { role: 'operations', branchId: 'B1' }, viewer: { role: 'viewer', branchId: 'B1' } }, branches: { B1: { name: 'Branch 1' }, B2: { name: 'Branch 2' } }, devices: { D1: { branchId: 'B1' }, D2: { branchId: 'B2' } } } },
    cards: { AABBCCDD: { active: true, name: 'Card', balance: 100000, ownerAuthUid: 'u1', branchId: 'B1' }, '11223344': { active: true, balance: 0, ownerAuthUid: 'u2', branchId: 'B2' } },
    devices: { D1: { name: 'Machine', branchId: 'B1' }, D2: { branchId: 'B2' } },
    catalog: { games: {}, deviceConfig: {} },
    deviceAccess: { hardware: { enabled: true, deviceId: 'D1', branchId: 'B1', canTopUp: true } },
    deviceProvision: { D1: { enabled: true, authUid: 'hardware', branchId: 'B1', canTopUp: true }, D2: { enabled: true, authUid: 'hardware2', branchId: 'B2' } },
  };
  let failPath = '';
  const at = (path) => path.split('/').filter(Boolean).reduce((v, key) => v?.[key], state) ?? null;
  const put = (path, value) => { const keys = path.split('/').filter(Boolean), leaf = keys.pop(); let parent = state; for (const key of keys) parent = parent[key] ??= {}; parent[leaf] = structuredClone(value); };
  const snap = (v) => ({ val: () => structuredClone(v), exists: () => v != null });
  function ref(path) {
    let order = '', equal, limit = Infinity, last = false;
    const r = {
      orderByKey: () => r,
      orderByChild: (field) => { order = field; return r; },
      equalTo: (v) => { equal = v; return r; },
      limitToFirst: (v) => { limit = v; return r; },
      limitToLast: (v) => { limit = v; last = true; return r; },
      get: async () => {
        let value = at(path);
        if (value && typeof value === 'object' && (order || limit !== Infinity)) {
          let entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
          if (order) entries = entries.filter(([, v]) => v[order] === equal);
          value = Object.fromEntries(last ? entries.slice(-limit) : entries.slice(0, limit));
        }
        return snap(value);
      },
      set: async (v) => { if (path === failPath) throw Error('network'); put(path, v); },
      transaction: async (callback) => {
        if (path === failPath) throw Error('network');
        // Exercise initial empty SDK cache; aborting it would lose existing server state.
        const initial = callback(null);
        if (initial === undefined) return { committed: false, snapshot: snap(at(path)) };
        const value = callback(structuredClone(at(path)));
        if (value === undefined) return { committed: false, snapshot: snap(at(path)) };
        put(path, value); return { committed: true, snapshot: snap(value) };
      },
    }; return r;
  }
  const accountLookups = [];
  const passwordUpdates = [];
  const revoked = [];
  const auth = { getUser: async (uid) => ({ uid, email: `${uid}@test`, metadata: { creationTime: '2026-01-01' } }), getUserByEmail: async (email) => { accountLookups.push(email); return { uid: email === 'u2@test' ? 'u2' : 'u1' }; } };
  auth.updateUser = async (uid, value) => { passwordUpdates.push({ uid, ...value }); };
  auth.revokeRefreshTokens = async uid => { revoked.push(uid); };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const handlers = platform({ db: { ref }, auth, onCall: (_, fn) => fn, onValueCreated: (_, fn) => fn, onValueWritten: (_, fn) => fn, HttpsError, options: { region: 'asia-southeast1' } });
  return { state, handlers, accountLookups, passwordUpdates, revoked, fail: (path) => { failPath = path; }, event: (deviceId, id, value) => ({ params: { deviceId, id }, data: snap(value) }) };
}
const r = (uid, data = {}) => ({ auth: { uid, token: { email: `${uid}@test` } }, data });
const game = { name: 'Racing', description: 'Game', deviceId: 'D1', branchId: 'B1', price: 20000, durationSeconds: 180, enabled: true };

test('default admin must change password; validates recent login, revokes sessions and never stores password', async () => {
  const { handlers, state, passwordUpdates, revoked } = fixture();
  state.accounts = { admin: { access: 'admin', isDefaultAdmin: true, requiresPasswordChange: true, card: '' } };
  const request = { ...r('admin', { password: 'new-password-123' }), auth: { uid: 'admin', token: { auth_time: Math.floor(Date.now() / 1000) } } };
  await assert.rejects(handlers.adminPlatformSnapshot(r('admin')), { code: 'permission-denied' });
  await assert.rejects(handlers.adminFirstPasswordChange({ data: request.data }), { code: 'unauthenticated' });
  await assert.rejects(handlers.adminFirstPasswordChange(r('u1', request.data)), { code: 'failed-precondition' });
  await assert.rejects(handlers.adminFirstPasswordChange(r('admin', request.data)), { code: 'unauthenticated' });
  await assert.rejects(handlers.adminFirstPasswordChange({ ...request, data: { password: '123456' } }), { code: 'invalid-argument' });
  assert.equal(passwordUpdates.length, 0);
  await handlers.adminFirstPasswordChange(request);
  assert.deepEqual(passwordUpdates, [{ uid: 'admin', password: 'new-password-123' }]);
  assert.deepEqual(revoked, ['admin']);
  assert.equal(state.accounts.admin.requiresPasswordChange, false);
  assert.equal(JSON.stringify(state).includes('new-password-123'), false);
  await assert.rejects(handlers.adminPlatformSnapshot(r('admin')), { code: 'permission-denied' });
  const newLogin = { auth: { uid: 'admin', token: { auth_time: Math.ceil(state.accounts.admin.passwordChangedAt / 1000) } } };
  assert.equal((await handlers.adminPlatformSnapshot(newLogin)).access.role, 'super_admin');
  await assert.rejects(handlers.adminFirstPasswordChange(request), { code: 'failed-precondition' });
});

test('database failure after password update keeps first-login gate closed for retry', async () => {
  const { handlers, state, fail } = fixture();
  state.accounts = { admin: { access: 'admin', isDefaultAdmin: true, requiresPasswordChange: true } };
  const request = { auth: { uid: 'admin', token: { auth_time: Math.floor(Date.now() / 1000) } }, data: { password: 'new-password-123' } };
  fail('accounts/admin');
  await assert.rejects(handlers.adminFirstPasswordChange(request), /network/);
  assert.equal(state.accounts.admin.requiresPasswordChange, true);
  await assert.rejects(handlers.adminPlatformSnapshot(r('admin')), { code: 'permission-denied' });
  fail('');
  await handlers.adminFirstPasswordChange(request);
  assert.equal(state.accounts.admin.requiresPasswordChange, false);
});

test('card assignment resolves username on the server without changing money or granting admin', async () => {
  const { handlers, state, accountLookups } = fixture();
  await handlers.adminCardAssign(r('admin', { cardUid: 'AABBCCDD', branchId: 'B1', email: ' CUSTOMER_01 ' }));
  assert.deepEqual(accountLookups, ['customer_01@accounts.smartplaycard.invalid']);
  assert.equal(state.cards.AABBCCDD.ownerAuthUid, 'u1');
  assert.equal(state.cards.AABBCCDD.balance, 100000);
  assert.equal((await handlers.platformSession(r('u1'))).role, 'user');
  await assert.rejects(handlers.adminCardAssign(r('admin', { cardUid: 'AABBCCDD', branchId: 'B1', email: 'bad/name' })), { code: 'invalid-argument' });
  assert.equal(accountLookups.length, 1);
});

test('real session refuses unauthenticated and device login; never grants demo role', async () => {
  const { handlers } = fixture();
  await assert.rejects(handlers.platformSession({}), { code: 'unauthenticated' });
  await assert.rejects(handlers.platformSession(r('hardware')), { code: 'permission-denied' });
  assert.equal((await handlers.platformSession(r('admin'))).role, 'admin');
  assert.equal((await handlers.platformSession(r('u1'))).role, 'user');
});
test('users see only owned cards/history and cannot claim another card', async () => {
  const { handlers } = fixture();
  const snapshot = await handlers.userSnapshot(r('u1', { cardUid: 'AABBCCDD' }));
  assert.deepEqual(snapshot.cards.map((c) => c.id), ['AABBCCDD']);
  assert.equal(snapshot.card.balance, 100000);
  assert.equal('_operations' in snapshot.card, false);
  await assert.rejects(handlers.userSnapshot(r('u1', { cardUid: '11223344' })), { code: 'permission-denied' });
});
test('admin game creation updates same catalog config; another branch/viewer cannot mutate', async () => {
  const { handlers, state } = fixture();
  await handlers.adminGameSave(r('ops', { id: 'G1', value: game }));
  assert.equal(state.catalog.games.G1.version, state.catalog.deviceConfig.D1.version);
  assert.equal(state.catalog.deviceConfig.D1.gameId, 'G1');
  await assert.rejects(handlers.adminGameSave(r('viewer', { id: 'G1', value: game })), { code: 'permission-denied' });
  await assert.rejects(handlers.adminGameSave(r('ops', { id: 'G2', value: { ...game, deviceId: 'D2', branchId: 'B2' } })), { code: 'permission-denied' });
  await assert.rejects(handlers.adminGameSave(r('admin', { id: 'G2', value: game })), { code: 'failed-precondition' });
});
test('game readiness needs config acknowledgement, price, duration and a fresh heartbeat', () => {
  const g = { ...game, id: 'G1', version: 'v1' }, now = 1800000000000;
  const d = { configVersion: 'v1', gameId: 'G1', price: 20000, gameDurationSeconds: 180, lastSeenEpoch: now / 1000, status: 'online' };
  assert.equal(p.publishable(g, d, now), true);
  for (const changed of [{ configVersion: 'old' }, { price: 1 }, { lastSeenEpoch: 0 }, { lastSeenEpoch: now / 1000 - 121 }, { status: 'awaiting_confirmation' }]) assert.equal(p.publishable(g, { ...d, ...changed }, now), false);
});
test('profiles strip injected balance/role and validate contact information', async () => {
  const { handlers, state } = fixture();
  await handlers.userProfileSave(r('u1', { name: 'Name', phone: '0794088678', role: 'admin', balance: 999 }));
  assert.deepEqual(state.userData.u1.profile, { name: 'Name', phone: '0794088678' });
  await assert.rejects(handlers.userProfileSave(r('u1', { name: '', phone: 'bad' })), { code: 'invalid-argument' });
});
test('support is durable, deduped and scoped; admin reply reaches only its sender', async () => {
  const { handlers, state } = fixture();
  const data = { id: 'ticket1', category: 'card', title: 'Help', message: 'Card failed', cardUid: 'AABBCCDD', gameId: '' };
  await handlers.userSupportCreate(r('u1', data)); await handlers.userSupportCreate(r('u1', data));
  assert.equal(Object.keys(state.support).length, 1);
  await assert.rejects(handlers.userSupportCreate(r('u2', data)), { code: 'permission-denied' });
  await assert.rejects(handlers.adminSupportReply(r('viewer', { id: 'ticket1', requestId: 'reply1', reply: 'Fixed', status: 'resolved' })), { code: 'permission-denied' });
  await handlers.adminSupportReply(r('ops', { id: 'ticket1', requestId: 'reply1', reply: 'Fixed', status: 'resolved' }));
  await handlers.adminSupportReply(r('ops', { id: 'ticket1', requestId: 'reply1', reply: 'Fixed', status: 'resolved' }));
  assert.equal(Object.keys(state.userData.u1.notifications).length, 1);
  assert.equal((await handlers.userSnapshot(r('u2'))).tickets.length, 0);
});
test('cash receipt retries, including app restart with a new client ID, credit exactly once', async () => {
  const { handlers, state } = fixture();
  const request = { id: 'client1', cardUid: 'AABBCCDD', branchId: 'B1', amount: 50000, reference: 'R001' };
  await handlers.adminCashTopUp(r('admin', request)); await handlers.adminCashTopUp(r('admin', { ...request, id: 'client2' }));
  assert.equal(state.cards.AABBCCDD.balance, 150000);
  assert.equal(Object.keys(state.admin.ledger).length, 1);
  await assert.rejects(handlers.adminCashTopUp(r('u1', request)), { code: 'permission-denied' });
  await assert.rejects(handlers.adminCashTopUp(r('admin', { ...request, amount: 60000 })), { code: 'already-exists' });
});
test('cash history failure retry retains original receipt/time without a second credit', async () => {
  const { handlers, state, fail } = fixture();
  const { createHash } = require('node:crypto'); const id = `cash-${createHash('sha256').update('B1\nR001').digest('hex')}`;
  const request = { cardUid: 'AABBCCDD', branchId: 'B1', amount: 50000, reference: 'R001' };
  fail(`transactions/${id}`); await assert.rejects(handlers.adminCashTopUp(r('admin', request)));
  assert.equal(state.cards.AABBCCDD.balance, 150000);
  const timestamp = state.cards.AABBCCDD._operations[id].timestamp;
  fail(''); await handlers.adminCashTopUp(r('admin', request));
  assert.equal(state.cards.AABBCCDD.balance, 150000); assert.equal(state.transactions[id].timestamp, timestamp);
});
test('hardware money preserves concurrent operations and rejects stale config/branch/unpaid topup', () => {
  const provision = { branchId: 'B1', canTopUp: false }, config = { ...game, version: 'v1', gameId: 'G1' };
  const request = { id: 'p1', uid: 'AABBCCDD', type: 'PLAY', amount: 20000, configVersion: 'v1', timestamp: Math.floor(Date.now() / 1000) };
  const before = { balance: 100000, active: true, branchId: 'B1', ownerAuthUid: 'u1' };
  const after = applyRequest(before, request, 'D1', provision, config, Date.now());
  assert.equal(after.balance, 80000); assert.equal(after.ownerAuthUid, 'u1');
  assert.deepEqual(applyRequest(after, request, 'D1', provision, config, Date.now()), after);
  assert.throws(() => applyRequest(before, { ...request, configVersion: 'old' }, 'D1', provision, config, Date.now()));
  assert.throws(() => applyRequest(before, { ...request, type: 'TOPUP' }, 'D1', provision, config, Date.now()));
  assert.throws(() => applyRequest({ ...before, branchId: 'B2' }, request, 'D1', provision, config, Date.now()));
  assert.equal(applyRequest({ ...before, active: false }, request, 'D1', provision, config, Date.now()).balance, 100000);
});
test('hardware trigger confirms server money once, even on event redelivery', async () => {
  const { handlers, state, event } = fixture();
  const request = { id: 't1', uid: 'AABBCCDD', type: 'TOPUP', amount: 50000, timestamp: Math.floor(Date.now() / 1000) };
  await handlers.processDeviceRequest(event('D1', 't1', request)); await handlers.processDeviceRequest(event('D1', 't1', request));
  assert.equal(state.cards.AABBCCDD.balance, 150000); assert.equal(state.deviceResults.D1.t1.status, 'COMMITTED');
  assert.equal(Object.keys(state.admin.ledger).length, 1);
});
test('revoked device cannot credit; rejected play produces no financial history', async () => {
  const { handlers, state, event } = fixture();
  state.deviceAccess.hardware.enabled = false;
  await handlers.processDeviceRequest(event('D1', 't1', { id: 't1', uid: 'AABBCCDD', type: 'TOPUP', amount: 10000 }));
  assert.equal(state.cards.AABBCCDD.balance, 100000); assert.equal(state.deviceResults.D1.t1.status, 'REJECTED');
  assert.equal(state.transactions, undefined);
});
test('device pulse notice does not claim game started; event dedupe needs a committed play receipt', async () => {
  const { handlers, state, event } = fixture();
  const e = { id: 'e1', uid: 'AABBCCDD', type: 'SESSION_PULSE_SENT', operationId: 'p1' };
  await handlers.projectDeviceEvent(event('D1', 'e1', e)); assert.equal(state.userData, undefined);
  state.cards.AABBCCDD._operations = { p1: { type: 'PLAY', status: 'COMMITTED', deviceId: 'D1', ownerAuthUid: 'u1' } };
  await handlers.projectDeviceEvent(event('D1', 'e1', e)); await handlers.projectDeviceEvent(event('D1', 'e1', e));
  assert.equal(Object.keys(state.userData.u1.notifications).length, 1);
  assert.equal(Object.values(state.userData.u1.notifications)[0].title, 'Đã gửi xung kích hoạt');
});
