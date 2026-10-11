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

test('direct transaction read filters UID locally without an index, keeps push IDs and timestamp order', async () => {
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
  assert.equal([...f.listeners][0].reference.constraints, undefined);
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
