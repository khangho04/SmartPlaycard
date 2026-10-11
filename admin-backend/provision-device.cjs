// Trusted terminal only; existing Firebase Auth device account, no passwords in argv.
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getAuth } = require('firebase-admin/auth');
const { validKey } = require('./core.cjs');
async function main() {
  const [email, deviceId, branchId, databaseURL, capability = 'game'] = process.argv.slice(2);
  if (!email || !validKey(deviceId) || !validKey(branchId) || !databaseURL?.startsWith('https://') || !['game', 'cashier'].includes(capability)) throw new Error('Usage: node provision-device.cjs EMAIL DEVICE_ID BRANCH_ID DATABASE_URL [game|cashier]');
  initializeApp({ credential: applicationDefault(), databaseURL });
  const db = getDatabase(), user = await getAuth().getUserByEmail(email);
  if ((await db.ref(`admin/operations/access/${user.uid}`).get()).exists()) throw new Error('Không dùng tài khoản Admin cho phần cứng.');
  if (!(await db.ref(`admin/operations/branches/${branchId}`).get()).exists()) throw new Error('Tạo chi nhánh thật trong Admin trước.');
  const existing = (await db.ref(`deviceProvision/${deviceId}`).get()).val();
  const accountDevice = (await db.ref(`deviceAccess/${user.uid}`).get()).val();
  if (accountDevice && accountDevice.deviceId !== deviceId) throw new Error('Tài khoản đã gắn với thiết bị khác. Thu hồi cấu hình cũ trước.');
  if (existing && existing.authUid !== user.uid) throw new Error('Thiết bị đã đăng ký tài khoản khác. Thu hồi cấu hình cũ trước.');
  await db.ref().update({
    [`deviceAccess/${user.uid}`]: { deviceId, branchId, enabled: true, canTopUp: capability === 'cashier' },
    [`deviceProvision/${deviceId}`]: { authUid: user.uid, branchId, enabled: true, canTopUp: capability === 'cashier' },
  });
  console.log(`Đã cấp quyền ${capability} cho ${deviceId} tại ${branchId}. Không tạo dữ liệu thiết bị/game giả.`);
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
