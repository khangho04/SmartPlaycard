const { ROLES } = require('./core.cjs');
function accountAccess(account, legacy, authTime) {
  if (account?.requiresPasswordChange === true) return null;
  if (account?.passwordChangedAt && Number(authTime || 0) < Math.ceil(account.passwordChangedAt / 1000)) return null;
  if (account?.access === 'user') return null;
  if (account?.access === 'admin') return legacy && ROLES.includes(legacy.role)
    ? legacy : { role: 'super_admin', branchId: '' };
  // Keep accounts created before the access field usable.
  return !account?.access && legacy && ROLES.includes(legacy.role) ? legacy : null;
}
module.exports = { accountAccess };
