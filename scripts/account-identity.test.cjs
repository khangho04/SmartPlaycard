/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const backend = require('../admin-backend/account-identity.cjs');
const moduleValue = { exports: {} };
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/account-identity.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('module', 'exports', source)(moduleValue, moduleValue.exports);
const client = moduleValue.exports;

test('username identity is canonical and identical for client, card assignment and admin bootstrap', () => {
  for (const name of ['cuong_01', ' ADMIN_01 ', 'user123', 'a'.repeat(32)]) {
    const email = client.accountEmail(name, true);
    assert.equal(email, backend.accountEmail(name));
    assert.equal(client.accountEmail(email), email);
    assert.equal(client.accountName(email), name.trim().toLowerCase());
  }
});
test('registration refuses emails and malformed usernames; existing email logins remain compatible', () => {
  for (const name of ['', 'ab', 'a'.repeat(33), '_admin', 'nguyễn', 'a b', 'a/b', 'a.b', 'user@gmail.com', 'user@accounts.smartplaycard.invalid']) {
    assert.throws(() => client.accountEmail(name, true));
  }
  for (const name of ['', 'ab', '_admin', 'a/b', 'a b']) assert.throws(() => backend.accountEmail(name));
  assert.equal(client.accountEmail('Existing@Example.com'), 'existing@example.com');
  assert.equal(backend.accountEmail('Existing@Example.com'), 'existing@example.com');
  assert.equal(client.accountName('existing@example.com'), 'existing@example.com');
});
