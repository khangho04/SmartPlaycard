const SUFFIX = '@accounts.smartplaycard.invalid';
function accountEmail(value) {
  const name = String(value || '').trim().toLowerCase();
  if (name.includes('@') && !name.endsWith(SUFFIX)) return name;
  const username = name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : name;
  if (!/^[a-z0-9][a-z0-9_]{2,31}$/.test(username)) throw new Error('Tên tài khoản không hợp lệ (3–32 ký tự chữ, số, dấu _).');
  return `${username}${SUFFIX}`;
}
module.exports = { accountEmail };
