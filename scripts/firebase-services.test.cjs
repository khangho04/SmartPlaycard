/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

// Exercise the real service/parser/mapping code with an in-memory Firebase SDK.
// No network access and no production database writes.
function fixture() {
  const values = new Map();
  const listeners = new Set();
  const cache = new Map();
  const storage = new Map();
  const behavior = { beforeCommit: null, failHistory: false, permissionDenied: false };
  let sequence = 0;
  const snapshot = (value, key = null) => ({
    key,
    val: () => value,
    exists: () => value !== null && value !== undefined,
    forEach(callback) {
      for (const [id, item] of Object.entries(value ?? {})) callback(snapshot(item, id));
    },
  });
  const sdk = {
    ref: (_db, name) => ({ path: name }),
    query: (reference, ...constraints) => ({ ...reference, constraints }),
    orderByChild: (field) => ({ orderByChild: field }),
    equalTo: (value) => ({ equalTo: value }),
    get: async (reference) => {
      if (reference.path.startsWith('.info/')) throw new Error('Invalid token in path');
      return snapshot(values.get(reference.path) ?? null);
    },
    push: () => ({ key: `request-${++sequence}` }),
    async runTransaction(reference, updater, options) {
      assert.equal(options.applyLocally, false);
      if (behavior.permissionDenied) throw new Error('PERMISSION_DENIED');
      updater(null); // Empty local cache must not create a card.
      let next = updater(structuredClone(values.get(reference.path) ?? null));
      if (behavior.beforeCommit) {
        behavior.beforeCommit();
        behavior.beforeCommit = null;
        next = updater(structuredClone(values.get(reference.path) ?? null));
      }
      if (next === undefined) return { committed: false, snapshot: snapshot(values.get(reference.path)) };
      values.set(reference.path, next);
      return { committed: true, snapshot: snapshot(next) };
    },
    async set(reference, value) {
      if (behavior.failHistory) throw new Error('history write failed');
      values.set(reference.path, structuredClone(value));
    },
    onValue(reference, callback, error, options) {
      const entry = { reference, callback, error };
      listeners.add(entry);
      if (reference.path.startsWith('.info/')) {
        if (options?.onlyOnce) listeners.delete(entry);
        callback(snapshot(values.get(reference.path) ?? null));
      }
      return () => listeners.delete(entry);
    },
  };
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = (id) => {
      if (id === 'firebase/database') return sdk;
      if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: {
        getItem: async (key) => storage.get(key) ?? null,
        setItem: async (key, value) => { storage.set(key, value); },
        removeItem: async (key) => { storage.delete(key); },
      } };
      if (id === './firebase-config') return { database: {} };
      if (id.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${id}.ts`)));
      return require(id);
    };
    new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
    return module.exports;
  }
  function emit(name, value) {
    for (const listener of listeners) {
      if (listener.reference.path === name) listener.callback(snapshot(value));
    }
  }
  return { load, values, listeners, emit, storage, behavior };
}

test('card read preserves zero balance, missing fields and absent records', async () => {
  const f = fixture();
  const service = f.load('src/services/firebase/card-service.ts');
  assert.equal(await service.getCard('ABC'), null);
  f.values.set('cards/ABC', { balance: 0, active: false, extraFirmwareField: 'ignored' });
  assert.deepEqual(await service.getCard(' ABC '), { balance: 0, active: false });
});

test('invalid UID cannot select an ancestor or another database branch', () => {
  const f = fixture();
  const { getCard } = f.load('src/services/firebase/card-service.ts');
  for (const value of ['', ' ', 'A/B', 'A.B', 'A#B', 'A$B', 'A[B]', 'A\nB']) {
    assert.throws(() => getCard(value));
  }
});

test('realtime balance follows ESP32 snapshots and cleanup detaches listener', () => {
  const f = fixture();
  const { subscribeCard } = f.load('src/services/firebase/card-service.ts');
  const seen = [];
  const stop = subscribeCard('ABC', (card) => seen.push(card?.balance ?? null));
  f.emit('cards/ABC', { balance: 70000 });
  f.emit('cards/ABC', { balance: 50000 });
  f.emit('cards/ABC', null);
  stop();
  f.emit('cards/ABC', { balance: 90000 });
  assert.deepEqual(seen, [70000, 50000, null]);
  assert.equal(f.listeners.size, 0);
});

test('malformed balances and permission errors reach error handler, not UI data', () => {
  const f = fixture();
  const { subscribeCard } = f.load('src/services/firebase/card-service.ts');
  const errors = [];
  let updates = 0;
  subscribeCard('ABC', () => updates++, (error) => errors.push(error.message));
  f.emit('cards/ABC', { balance: '70000' });
  f.emit('cards/ABC', { balance: Infinity });
  f.emit('cards/ABC', []);
  [...f.listeners][0].error(new Error('PERMISSION_DENIED'));
  assert.equal(updates, 0);
  assert.equal(errors.length, 4);
  assert.match(errors[3], /PERMISSION_DENIED/);
});

test('transaction query filters UID, keeps push IDs, and orders valid epoch seconds first', async () => {
  const f = fixture();
  const service = f.load('src/services/firebase/transaction-service.ts');
  f.values.set('transactions', {
    a: { uid: 'ABC', timestamp: 100, type: 'PLAY' },
    b: { uid: 'OTHER', timestamp: 300, type: 'TOPUP' },
    c: { uid: 'ABC', timestamp: 200, type: 'TOPUP' },
    d: { uid: 'ABC', timestamp: 0 },
  });
  assert.deepEqual((await service.getCardTransactions('ABC')).map((item) => item.id), ['c', 'a', 'd']);
  const stop = service.subscribeCardTransactions('ABC', () => {});
  assert.deepEqual([...f.listeners][0].reference.constraints, [{ orderByChild: 'uid' }, { equalTo: 'ABC' }]);
  stop();
  assert.equal(f.listeners.size, 0);
});

test('device retains actual GAME001 fields without inventing heartbeat or defaults', async () => {
  const f = fixture();
  const service = f.load('src/services/firebase/device-service.ts');
  const device = { name: 'Racing Game', price: 20000, lastSeen: 'TIME_NOT_SYNCED', lastSeenEpoch: 0, wifiRSSI: -54 };
  f.values.set('devices/GAME001', device);
  assert.deepEqual(await service.getDevice(), device);
  const stop = service.subscribeDevice('GAME001', () => {});
  stop();
  assert.equal(f.listeners.size, 0);
});

test('history uses balance delta and handles missing or unfamiliar transactions', () => {
  const { mapTransaction, formatBalance } = fixture().load('src/services/wallet-mapping.ts');
  assert.equal(mapTransaction({ id: '1', type: 'PLAY', amount: 20000, balanceBefore: 70000, balanceAfter: 50000 }).amount, -20000);
  assert.equal(mapTransaction({ id: '2', type: 'TOPUP', amount: 50000 }).amount, 50000);
  assert.equal(mapTransaction({ id: '3', type: 'PLAY' }).amount, null);
  assert.equal(mapTransaction({ id: '4', type: 'SOMETHING_NEW' }).type, 'unknown');
  assert.equal(formatBalance(null), '—');
  assert.notEqual(formatBalance(0), '—');
});

test('time formatting handles epoch seconds and unsynced firmware times', () => {
  const { formatFirebaseTime } = fixture().load('src/services/wallet-mapping.ts');
  assert.equal(formatFirebaseTime('TIME_NOT_SYNCED', 0), 'Chưa có thời gian hợp lệ');
  assert.equal(formatFirebaseTime('2026-09-14 13:41:37'), '2026-09-14 13:41:37');
  const expected = new Date(1789368097000).toLocaleString('vi-VN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  assert.equal(formatFirebaseTime(1789368097), expected);
  assert.equal(formatFirebaseTime(1789368097000), expected);
  assert.equal(formatFirebaseTime(new Date(1789368097000).toISOString()), expected);
});

test('topup reads connection metadata locally, credits balance, and detaches its listener', async () => {
  const f = topUpFixture();
  const receipt = await f.service.topUpCard('ABC', 50000);
  assert.equal(receipt.balanceAfter, 120000);
  assert.equal(f.listeners.size, 0);
});

test('each new deposit records its own time; retry preserves the original time', async () => {
  const f = topUpFixture();
  const originalNow = Date.now;
  try {
    Date.now = () => 1789368097000;
    const first = await f.service.topUpCard('ABC', 50000);
    Date.now = () => 1789368197000;
    const second = await f.service.topUpCard('ABC', 50000);
    assert.equal(first.timestamp, 1789368097);
    assert.equal(second.timestamp, 1789368197);
    assert.equal(second.time, new Date(1789368197000).toISOString());
    assert.equal(f.values.get('cards/ABC').lastTopupAtEpoch, second.timestamp);
    assert.equal(f.values.get(`transactions/${second.requestId}`).timestamp, second.timestamp);
    const retry = await f.service.topUpCard('ABC', 50000, first.requestId);
    assert.equal(retry.timestamp, first.timestamp);
    assert.equal(f.values.get('cards/ABC').balance, 170000);
    assert.equal(f.values.get('cards/ABC').lastTopupAtEpoch, second.timestamp);
  } finally {
    Date.now = originalNow;
  }
});

function topUpFixture() {
  const f = fixture();
  f.values.set('devices/GAME001', { balanceProtocolVersion: 2 });
  f.values.set('.info/connected', true);
  f.values.set('cards/ABC', { active: true, balance: 70000, topupCount: 0, totalTopup: 0, customField: 'preserve' });
  f.service = f.load('src/services/firebase/topup-service.ts');
  return f;
}

test('app topup racing with ESP32 topup produces 130000, preserving other fields', async () => {
  const f = topUpFixture();
  const deviceReceipt = {
    requestId: 'GAME001-independent', uid: 'ABC', type: 'TOPUP', amount: 10000,
    balanceBefore: 70000, balanceAfter: 80000, source: 'ESP32',
  };
  f.behavior.beforeCommit = () => {
    const card = f.values.get('cards/ABC');
    f.values.set('cards/ABC', { ...card, balance: 80000, topupCount: 1, totalTopup: 10000,
      _operations: { [deviceReceipt.requestId]: deviceReceipt } });
    f.values.set(`transactions/${deviceReceipt.requestId}`, deviceReceipt);
  };
  const receipt = await f.service.topUpCard('ABC', 50000);
  assert.equal(receipt.balanceBefore, 80000);
  assert.equal(receipt.balanceAfter, 130000);
  assert.equal(f.values.get('cards/ABC').balance, 130000);
  assert.equal(f.values.get('cards/ABC').topupCount, 2);
  assert.equal(f.values.get('cards/ABC').totalTopup, 60000);
  assert.deepEqual(f.values.get('cards/ABC')._operations[deviceReceipt.requestId], deviceReceipt);
  assert.equal(Object.keys(f.values.get('cards/ABC')._operations).length, 2);
  assert.deepEqual(f.values.get(`transactions/${deviceReceipt.requestId}`), deviceReceipt);
  assert.equal(f.values.get('cards/ABC').customField, 'preserve');
  assert.equal(f.values.get(`transactions/${receipt.requestId}`).paymentMethod, 'simulation');
  assert.equal(await f.service.getPendingTopUp(), null);
  await f.service.topUpCard('ABC', 50000, receipt.requestId);
  assert.equal(f.values.get('cards/ABC').balance, 130000);
  assert.equal(f.values.get('cards/ABC').topupCount, 2);
});

test('app topup racing with PLAY preserves the deduction', async () => {
  const f = topUpFixture();
  f.behavior.beforeCommit = () => {
    const card = f.values.get('cards/ABC');
    f.values.set('cards/ABC', { ...card, balance: 50000, playCount: 1, totalSpent: 20000 });
  };
  await f.service.topUpCard('ABC', 50000);
  assert.equal(f.values.get('cards/ABC').balance, 100000);
  assert.equal(f.values.get('cards/ABC').playCount, 1);
});

test('retry after history failure credits once and uses the same transaction ID', async () => {
  const f = topUpFixture();
  f.behavior.failHistory = true;
  await assert.rejects(f.service.topUpCard('ABC', 50000), /history write failed/);
  assert.equal(f.values.get('cards/ABC').balance, 120000);
  const pending = await f.service.getPendingTopUp();
  await assert.rejects(f.service.topUpCard('ABC', 100000), /đang chờ/);
  f.behavior.failHistory = false;
  const receipt = await f.service.topUpCard('ABC', 50000);
  assert.equal(receipt.requestId, pending.id);
  assert.equal(f.values.get('cards/ABC').balance, 120000);
  assert.equal(f.values.get('cards/ABC').topupCount, 1);
  assert.equal([...f.values.keys()].filter((key) => key.startsWith('transactions/')).length, 1);
});

test('permission denial leaves durable intent and does not report success', async () => {
  const f = topUpFixture();
  f.behavior.permissionDenied = true;
  await assert.rejects(f.service.topUpCard('ABC', 50000), /PERMISSION_DENIED/);
  assert.equal(f.values.get('cards/ABC').balance, 70000);
  assert.ok(await f.service.getPendingTopUp());
});

test('blocked cards, invalid amounts and overflow cannot be credited', async () => {
  const f = topUpFixture();
  for (const value of [-1, -10000, 5000001, 10000.5, NaN, Infinity]) {
    await assert.rejects(f.service.topUpCard('ABC', value));
  }
  f.values.set('cards/ABC', { active: false, balance: 70000 });
  await assert.rejects(f.service.topUpCard('ABC', 50000), /khóa/);
  f.values.set('cards/ABC', { active: true, balance: 2147483647 });
  await assert.rejects(f.service.topUpCard('ABC', 50000), /balance/);
  assert.equal(await f.service.getPendingTopUp(), null);
});

test('OK credits any whole amount from zero through five million to the selected UID', async () => {
  for (const amount of [0, 1, 9999, 123456, 500001, 4999999, 5000000]) {
    const f = topUpFixture();
    f.values.set('cards/OTHER', { balance: 30000, active: true });
    const receipt = await f.service.topUpCard('ABC', amount);
    assert.equal(f.values.get('cards/ABC').balance, 70000 + amount);
    assert.equal(f.values.get('cards/OTHER').balance, 30000);
    assert.equal(receipt.amount, amount);
    assert.equal(f.values.get(`transactions/${receipt.requestId}`).amount, amount);
    assert.equal(await f.service.getPendingTopUp(), null);
    await f.service.topUpCard('ABC', amount, receipt.requestId);
    assert.equal(f.values.get('cards/ABC').balance, 70000 + amount);
    assert.equal(f.values.get('cards/ABC').topupCount, 1);
  }
});

test('double taps are blocked while one submission is running', async () => {
  const f = topUpFixture();
  const first = f.service.topUpCard('ABC', 50000);
  await assert.rejects(f.service.topUpCard('ABC', 50000), /Đang xử lý/);
  await first;
  assert.equal(f.values.get('cards/ABC').balance, 120000);
});

test('stale pending screen reconciles a completed ID instead of creating another topup', async () => {
  const f = topUpFixture();
  const first = await f.service.topUpCard('ABC', 50000);
  assert.equal(await f.service.getPendingTopUp(), null);
  const retry = await f.service.topUpCard('ABC', 50000, first.requestId);
  assert.equal(retry.requestId, first.requestId);
  assert.equal(f.values.get('cards/ABC').balance, 120000);
  await assert.rejects(f.service.topUpCard('ABC', 50000, 'missing-request'), /Không tìm thấy biên nhận/);
});

test('committed topup reconciles history even when device disappears and card is locked', async () => {
  const f = topUpFixture();
  f.behavior.failHistory = true;
  await assert.rejects(f.service.topUpCard('ABC', 50000), /history write failed/);
  const pending = await f.service.getPendingTopUp();
  f.values.delete('devices/GAME001');
  f.values.get('cards/ABC').active = false;
  f.behavior.failHistory = false;
  const receipt = await f.service.topUpCard('ABC', 50000, pending.id);
  assert.equal(receipt.requestId, pending.id);
  assert.equal(f.values.get('cards/ABC').balance, 120000);
  assert.equal(f.values.get('cards/ABC').topupCount, 1);
  assert.equal(await f.service.getPendingTopUp(), null);
});

test('offline and missing cards do not create pending deposits', async () => {
  const f = topUpFixture();
  f.values.set('.info/connected', false);
  await assert.rejects(f.service.topUpCard('ABC', 50000), /Chưa kết nối/);
  assert.equal(await f.service.getPendingTopUp(), null);
  f.values.set('.info/connected', true);
  await assert.rejects(f.service.topUpCard('MISSING', 50000), /Không tìm thấy thẻ/);
  assert.equal(await f.service.getPendingTopUp(), null);
  assert.equal(f.values.get('cards/ABC').balance, 70000);
});

test('uncommitted simulation deposit can retry without a device', async () => {
  const f = topUpFixture();
  f.behavior.permissionDenied = true;
  await assert.rejects(f.service.topUpCard('ABC', 50000), /PERMISSION_DENIED/);
  const pending = await f.service.getPendingTopUp();
  f.behavior.permissionDenied = false;
  f.values.delete('devices/GAME001');
  const receipt = await f.service.topUpCard('ABC', 50000, pending.id);
  assert.equal(receipt.requestId, pending.id);
  assert.equal(f.values.get('cards/ABC').balance, 120000);
  assert.equal(await f.service.getPendingTopUp(), null);
});

test('simulation credits selected card without GAME001 or protocol metadata', async () => {
  for (const device of [null, {}, { balanceProtocolVersion: 1 }]) {
    const f = topUpFixture();
    f.values.set('devices/GAME001', device);
    const receipt = await f.service.topUpCard('ABC', 50000);
    assert.equal(f.values.get('cards/ABC').balance, 120000);
    assert.equal(f.values.get(`transactions/${receipt.requestId}`).amount, 50000);
    assert.equal(receipt.paymentMethod, 'simulation');
    assert.equal(await f.service.getPendingTopUp(), null);
  }
});
