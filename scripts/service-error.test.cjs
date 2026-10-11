/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const loaded = { exports: {} };
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/service-error.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('module', 'exports', source)(loaded, loaded.exports);
const { errorText, sessionErrorText } = loaded.exports;
const error = (code, message) => Object.assign(new Error(message), { code });
test('business not-found retains its explanation rather than reporting a connection failure', () => {
  assert.equal(errorText(error('functions/not-found', 'Tài khoản chưa được đăng ký.')), 'Tài khoản chưa được đăng ký.');
  assert.match(errorText(error('functions/not-found', 'NOT FOUND')), /Cloud Functions/);
});
test('session lookup failure identifies the failed stage without presenting it as wrong credentials', () => {
  const message = sessionErrorText(error('functions/internal', 'INTERNAL'));
  assert.match(message, /platformSession/);
  assert.match(message, /không cần đăng ký lại/);
  assert.doesNotMatch(message, /mật khẩu không đúng/);
  assert.match(errorText(error('auth/invalid-credential', 'bad')), /mật khẩu không đúng/);
  assert.match(errorText(error('auth/network-request-failed', 'network')), /Realtime Database/);
});
