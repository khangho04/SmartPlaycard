const p = require('./platform-core.cjs');
function applyRequest(card, request, deviceId, provision, config, now) {
  if (!card) return null; // Forces comparison against server when SDK cache is empty.
  const old = card._operations?.[request.id];
  if (old) {
    p.check(old.uid === request.uid && old.deviceId === deviceId && old.type === request.type && old.amount === request.amount, 'Biên nhận không khớp.');
    return card;
  }
  p.check(Number.isSafeInteger(request.timestamp) && request.timestamp > 0 && request.timestamp * 1000 <= now + 60000 && now - request.timestamp * 1000 <= 120000, 'Yêu cầu đã hết hạn hoặc đồng hồ chưa đồng bộ.');
  p.check(card.branchId === provision.branchId, 'Thẻ không thuộc chi nhánh của máy.');
  p.check(Number.isSafeInteger(card.balance) && card.balance >= 0, 'Số dư không hợp lệ.');
  const play = request.type === 'PLAY';
  p.check(play || request.type === 'TOPUP', 'Loại yêu cầu không hợp lệ.');
  p.check(Number.isSafeInteger(request.amount) && request.amount >= 0 && request.amount <= 5000000, 'Số tiền không hợp lệ.');
  if (play) p.check(config?.enabled && config.version === request.configVersion && config.price === request.amount && config.branchId === provision.branchId, 'Cấu hình game đã thay đổi hoặc bị tắt.');
  else p.check(provision.canTopUp === true && request.amount > 0, 'Thiết bị không có quyền thu tiền.');
  const countKey = play ? 'playCount' : 'topupCount', totalKey = play ? 'totalSpent' : 'totalTopup';
  for (const field of [countKey, totalKey]) p.check(card[field] === undefined || (Number.isSafeInteger(card[field]) && card[field] >= 0), 'Bộ đếm không hợp lệ.');
  const balance = card.balance + (play ? -request.amount : request.amount);
  const reason = card.active !== true ? 'CARD BLOCKED' : balance < 0 ? 'INSUFFICIENT BALANCE' : balance > 2147483647 || (card[totalKey] || 0) + request.amount > 2147483647 || (card[countKey] || 0) >= 2147483647 ? 'MONEY LIMIT' : '';
  const timestamp = Math.floor(now / 1000);
  const receipt = { requestId: request.id, uid: request.uid, deviceId, branchId: provision.branchId,
    type: request.type, amount: request.amount, balanceBefore: card.balance, balanceAfter: reason ? card.balance : balance,
    timestamp, time: new Date(now).toISOString(), status: reason ? 'REJECTED' : 'COMMITTED', reason,
    source: 'ESP32_SERVER', paymentMethod: play ? 'card' : 'cashier', cardName: card.name || request.uid,
    ownerAuthUid: card.ownerAuthUid || '',
    gameId: play ? config.gameId : '', configVersion: play ? config.version : '', gameDurationSeconds: play ? config.durationSeconds : 0,
  };
  return { ...card, ...(reason ? {} : { balance, [countKey]: (card[countKey] || 0) + 1, [totalKey]: (card[totalKey] || 0) + request.amount,
    [play ? 'lastPlayedAt' : 'lastTopupAt']: receipt.time, [play ? 'lastPlayedAtEpoch' : 'lastTopupAtEpoch']: timestamp }),
    _operations: { ...card._operations, [request.id]: receipt } };
}
module.exports = { applyRequest };
