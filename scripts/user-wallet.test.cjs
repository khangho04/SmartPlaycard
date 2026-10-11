const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function fixture() {
  const user = { uid: 'u1', email: 'u1@test' };
  const values = { 'accounts/u1': { username: 'cuong', card: { LINKED: true } }, cards: { OWNED: { ownerAuthUid: 'u1' } } };
  const reads = [];
  const modules = {
    'firebase/database': {
      ref: (_, key) => ({ key }), orderByChild: (field) => ({ field }), equalTo: (equal) => ({ equal }),
      query: (ref, ...filters) => Object.assign(ref, ...filters),
      get: async (ref) => { if (ref.field) throw Error('Index not defined'); reads.push(ref); return { val: () => values[ref.key] || null }; },
    },
    './firebase-config': { database: {} }, './auth': { auth: { currentUser: user } },
    './card-service': { getCard: async (id) => { reads.push({ key: `cards/${id}` }); return id === 'MISSING' ? null : { balance: 0, name: id }; } },
    './transaction-service': { getCardTransactions: async (uid) => [{ id: 't1', uid, type: 'TOPUP', amount: 1000 }] },
    './record-utils': { validateKey: (value) => { if (!value || /[.#$\[\]/]/.test(value)) throw Error('invalid key'); return value.trim(); } },
  };
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/firebase/user-wallet.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => {
    assert.ok(modules[name], `Unexpected dependency: ${name}`); return modules[name];
  }, loaded, loaded.exports);
  return { read: loaded.exports.readUserWallet, values, reads, user };
}
test('direct wallet reads cards without indexes, live zero balance and UID history without Functions', async () => {
  const f = fixture();
  const data = await f.read('u1', 'LINKED');
  assert.equal(data.card.balance, 0);
  assert.equal(data.transactions[0].uid, 'LINKED');
  assert.deepEqual(data.cards.map(card => card.id), ['LINKED']);
  assert.deepEqual(f.reads.filter(ref => ref.key.startsWith('cards')).map(ref => ref.key), ['cards/LINKED']);
});
test('direct wallet accepts unlinked cards and keeps invalid paths and account sessions checked', async () => {
  const f = fixture();
  assert.equal((await f.read('u1', 'OTHER')).card.id, 'OTHER');
  await assert.rejects(f.read('u1', '../cards'), /invalid key/);
  await assert.rejects(f.read('u2'), /đăng nhập/);
});
test('empty card and missing live card do not invent a balance', async () => {
  const f = fixture();
  f.values.cards = null; f.values['accounts/u1'].card = '';
  const data = await f.read('u1');
  assert.equal(data.card, null); assert.deepEqual(data.cards, []);
  assert.equal(f.reads.some(ref => ref.key.startsWith('cards')), false);
  f.values['accounts/u1'].card = { MISSING: true };
  await assert.rejects(f.read('u1', 'MISSING'), /Không tìm thấy/);
});
