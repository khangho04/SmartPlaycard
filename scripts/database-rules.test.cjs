/* global __dirname */
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds } = require(path.resolve('.expo/validation-tools/node_modules/@firebase/rules-unit-testing'));
let env;
before(async () => {
  const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '').split(':');
  if (!host) throw new Error('Run through Firebase emulators:exec --only database.');
  env = await initializeTestEnvironment({ projectId: 'demo-smartplaycard', database: { host, port: Number(port), rules: fs.readFileSync('admin-backend/database.rules.json', 'utf8') } });
});
after(async () => { if (env) await env.cleanup(); });
test('RTDB demo supports unauthenticated accounts, card transactions and atomic role updates', async () => {
  const db = env.unauthenticatedContext().database();
  await assertSucceeds(db.ref('accounts/demo').set({ username: 'demo', access: 'user', card: '' }));
  await assertSucceeds(db.ref('accounts').orderByChild('username').equalTo('demo').once('value'));
  await assertSucceeds(db.ref().update({ 'accounts/demo/access': 'admin', 'admin/operations/access/demo': { role: 'viewer', branchId: 'B1' } }));
  await assertSucceeds(db.ref('cards/DEMO').transaction(() => ({ balance: 1000, active: true })));
  await assertSucceeds(db.ref('transactions/t1').set({ uid: 'DEMO', type: 'TOPUP', amount: 1000, timestamp: 1 }));
  await assertSucceeds(db.ref('transactions').orderByChild('uid').equalTo('DEMO').once('value'));
});
