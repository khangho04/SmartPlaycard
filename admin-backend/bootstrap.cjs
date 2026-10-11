// Run only in a trusted terminal with Application Default Credentials.
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { randomUUID } = require("node:crypto");
const { accountEmail } = require('./account-identity.cjs');
async function main() {
  const args = process.argv.slice(2);
  const createDefault = args[0] === '--default';
  const [email, databaseURL] = createDefault ? ['admin', args[1]] : args;
  if (!email || !databaseURL?.startsWith("https://"))
    throw new Error("Usage: node bootstrap.cjs USERNAME_OR_EMAIL|--default DATABASE_URL");
  const credential = applicationDefault();
  await credential.getAccessToken();
  initializeApp({ credential, databaseURL });
  const db = getDatabase();
  const existing = (await db.ref('admin/operations/access').get()).val() || {};
  if (!createDefault && Object.values(existing).some((a) => a.role === 'super_admin'))
    throw new Error('Đã có Super Admin. Dùng giao diện để cấp quyền bổ sung.');
  const password = createDefault ? '123456' : null;
  const user = createDefault
    ? await getAuth().createUser({ email: accountEmail(email), password, displayName: 'Admin' })
    : await getAuth().getUserByEmail(accountEmail(email));
  const auditId = randomUUID();
  const now = Date.now();
  const result = await db.ref('/').transaction((state) => {
    state ??= {};
    state.admin ??= {};
    const ops = state.admin.operations ??= {};
    if (!createDefault && Object.values(ops.access || {}).some((a) => a.role === "super_admin"))
      return;
    ops.access ??= {};
    ops.access[user.uid] = {
      email: user.email,
      role: "super_admin",
      branchId: "",
      ...(createDefault ? { isDefaultAdmin: true } : {}),
    };
    ops.settings ??= { offlineSeconds: 120 };
    ops.audit ??= {};
    ops.audit[auditId] = {
      actor: "bootstrap",
      action: "access",
      target: user.uid,
      at: now,
      after: ops.access[user.uid],
      branchId: "",
    };
    state.accounts ??= {};
    state.accounts[user.uid] = { username: email, createdAt: new Date(now).toISOString(), card: '', ...state.accounts[user.uid], access: 'admin', ...(createDefault ? { isDefaultAdmin: true, requiresPasswordChange: true } : {}) };
    return state;
  });
  if (!result.committed)
    throw new Error("Đã có Super Admin. Dùng giao diện để cấp quyền bổ sung.");
  console.log("Đã cấp quyền Super Admin cho tài khoản đã chọn.");
  if (createDefault) console.log(`Tên tài khoản: admin\nMật khẩu ban đầu: ${password}\nBắt buộc đổi mật khẩu khi đăng nhập lần đầu.`);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
