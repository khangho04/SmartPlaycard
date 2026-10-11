const { test } = require('node:test');
const assert = require('node:assert/strict');
const { accountAccess } = require('../admin-backend/account-access.cjs');
test('account role grants admin and explicit user revokes old admin access', () => {
  const legacy = { role: 'super_admin', branchId: '' };
  assert.equal(accountAccess({ access: 'user' }, legacy), null);
  assert.equal(accountAccess({ access: 'admin' }, null).role, 'super_admin');
  assert.equal(accountAccess({ access: 'invalid' }, legacy), null);
  assert.equal(accountAccess(null, legacy), legacy);
  assert.equal(accountAccess({ access: 'admin' }, { role: 'viewer', branchId: 'B1' }).role, 'viewer');
});
test('first password change blocks all admin roles and old sessions remain denied after completion', () => {
  const role = { role: 'super_admin', branchId: '' };
  assert.equal(accountAccess({ access: 'admin', requiresPasswordChange: true }, role, 100), null);
  assert.equal(accountAccess({ access: 'admin', passwordChangedAt: 100500 }, role, 100), null);
  assert.equal(accountAccess({ access: 'admin', passwordChangedAt: 100500 }, role, 101), role);
});
