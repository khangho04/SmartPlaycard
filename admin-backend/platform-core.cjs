const { validKey, ROLES, inScope } = require('./core.cjs');
function check(ok, message) { if (!ok) throw new Error(message); }
function text(v, field, max = 500, required = true) {
  check(typeof v?.[field] === 'string' && v[field].trim().length <= max && (!required || v[field].trim()), `${field} không hợp lệ.`);
  return v[field].trim();
}
function cleanGame(v) {
  const name = text(v, 'name', 100);
  const description = text(v, 'description', 1000, false);
  check(validKey(v.deviceId) && validKey(v.branchId), 'Cần thiết bị và chi nhánh.');
  check(Number.isSafeInteger(v.price) && v.price >= 0 && v.price <= 5000000, 'Giá không hợp lệ.');
  check(Number.isSafeInteger(v.durationSeconds) && v.durationSeconds >= 1 && v.durationSeconds <= 86400, 'Thời lượng không hợp lệ.');
  check(typeof v.enabled === 'boolean', 'Trạng thái không hợp lệ.');
  return { name, description, deviceId: v.deviceId, branchId: v.branchId, price: v.price, durationSeconds: v.durationSeconds, enabled: v.enabled };
}
function cleanProfile(v) {
  const name = text(v, 'name', 100);
  const phone = text(v, 'phone', 20, false);
  check(!phone || /^\+?[0-9]{9,15}$/.test(phone), 'Số điện thoại không hợp lệ.');
  return { name, phone };
}
function cleanTicket(v) {
  check(validKey(v.id), 'Mã yêu cầu không hợp lệ.');
  check(['card', 'topup', 'game', 'other'].includes(v.category), 'Loại hỗ trợ không hợp lệ.');
  const title = text(v, 'title', 120);
  const message = text(v, 'message', 2000);
  const cardUid = text(v, 'cardUid', 128, false);
  const gameId = text(v, 'gameId', 128, false);
  check((!cardUid || validKey(cardUid)) && (!gameId || validKey(gameId)), 'Thẻ/game không hợp lệ.');
  return { id: v.id, category: v.category, title, message, cardUid, gameId };
}
function canManage(access, branchId) {
  return !!access && ['super_admin', 'operations'].includes(access.role) && inScope(access, branchId);
}
function canSupport(access, branchId) {
  return !!access && ['super_admin', 'operations', 'technician'].includes(access.role) && inScope(access, branchId);
}
function isOwner(card, uid) { return !!card && card.ownerAuthUid === uid; }
function publishable(game, device, now, threshold = 120) {
  return game.enabled === true && device?.configVersion === game.version && device?.price === game.price &&
    device?.gameDurationSeconds === game.durationSeconds && device?.gameId === game.id &&
    Number(device.lastSeenEpoch) > 0 && Number(device.lastSeenEpoch) * 1000 <= now + 60000 &&
    now - Number(device.lastSeenEpoch) * 1000 <= threshold * 1000 && !['error', 'offline', 'awaiting_confirmation'].includes(device.status);
}
function eventNotice(event) {
  check(validKey(event.uid) && validKey(event.id), 'Sự kiện không hợp lệ.');
  if (event.type === 'CARD_READ') return { type: 'card', title: 'Đã nhận diện thẻ', message: `Đầu đọc đã nhận thẻ ${event.uid}.` };
  if (event.type === 'SESSION_PULSE_SENT') return { type: 'game', title: 'Đã gửi xung kích hoạt', message: 'Relay đã gửi xung đến máy. Nếu game không bắt đầu, vui lòng liên hệ hỗ trợ.' };
  if (event.type === 'SESSION_WINDOW_ENDED') return { type: 'game', title: 'Đã hết thời lượng dự kiến', message: 'Đã hết thời lượng cấu hình. Máy chưa có cảm biến xác nhận kết thúc lượt chơi.' };
  if (event.type === 'SESSION_STARTED') return { type: 'game', title: 'Bắt đầu lượt chơi', message: 'Thiết bị đã xác nhận bắt đầu lượt chơi.' };
  if (event.type === 'SESSION_ERROR') return { type: 'error', title: 'Lượt chơi gặp sự cố', message: 'Thiết bị báo lỗi. Vui lòng gửi yêu cầu hỗ trợ để kiểm tra lượt chơi.' };
  if (event.type === 'CARD_REJECTED') return { type: 'card', title: 'Thẻ cần kiểm tra', message: 'Thẻ không được chấp nhận. Kiểm tra số dư, trạng thái hoặc liên hệ nhân viên.' };
  if (event.type === 'SESSION_ENDED') return { type: 'game', title: 'Lượt chơi đã kết thúc', message: 'Thiết bị đã ghi nhận kết thúc lượt chơi.' };
  throw new Error('Loại sự kiện không hợp lệ.');
}
module.exports = { check, text, cleanGame, cleanProfile, cleanTicket, canManage, canSupport, isOwner, publishable, eventNotice, validKey, ROLES };
