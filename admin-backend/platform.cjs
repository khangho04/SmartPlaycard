const p = require('./platform-core.cjs');
const { randomUUID, createHash } = require('node:crypto');
const { accountEmail } = require('./account-identity.cjs');
const { accountAccess } = require('./account-access.cjs');

module.exports = function platform({ db, auth, onCall, onValueCreated, onValueWritten, HttpsError, options }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const list = (value) => Object.entries(value || {}).map(([id, v]) => ({ ...v, id }));
  const uidFor = (r) => { if (!r.auth) fail('unauthenticated', 'Hãy đăng nhập.'); return r.auth.uid; };
  const parse = (fn, v) => { try { return fn(v); } catch (e) { fail('invalid-argument', e.message); } };
  const key = (v) => { if (!p.validKey(v)) fail('invalid-argument', 'Mã không hợp lệ.'); return v; };
  async function accessFor(r) {
    const uid = uidFor(r);
    const a = accountAccess((await db.ref(`accounts/${uid}`).get()).val(), (await db.ref(`admin/operations/access/${uid}`).get()).val(), r.auth.token?.auth_time);
    if (!a || !p.ROLES.includes(a.role)) fail('permission-denied', 'Chưa được cấp quyền quản trị.');
    return a;
  }
  async function ownCard(uid, cardUid) {
    const card = (await db.ref(`cards/${key(cardUid)}`).get()).val();
    if (!p.isOwner(card, uid)) fail('permission-denied', 'Thẻ chưa được nhân viên liên kết với tài khoản của bạn.');
    // Receipts remain server-side; never download the unbounded _operations tree.
    const { _operations, ...safe } = card;
    return { ...safe, id: cardUid };
  }
  async function bounded(path, max = 500) {
    const snap = await db.ref(path).orderByKey().limitToFirst(max + 1).get();
    const value = list(snap.val());
    if (value.length > max) fail('resource-exhausted', `Dữ liệu ${path} vượt giới hạn; cần phân trang.`);
    return value;
  }
  async function notice(uid, id, value) {
    await db.ref(`userData/${uid}/notifications/${id}`).transaction((old) => old || { ...value, createdAt: Date.now(), read: false });
  }
  const exports = {};
  exports.adminFirstPasswordChange = onCall(options, async (r) => {
    const uid = uidFor(r);
    const account = (await db.ref(`accounts/${uid}`).get()).val();
    if (!account?.isDefaultAdmin || account.requiresPasswordChange !== true)
      fail('failed-precondition', 'Tài khoản không cần đổi mật khẩu lần đầu.');
    const authTime = Number(r.auth.token?.auth_time) || 0;
    if (!authTime || Date.now() / 1000 - authTime > 300)
      fail('unauthenticated', 'Hãy đăng nhập lại trước khi đổi mật khẩu.');
    const password = r.data?.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 128 || password === '123456')
      fail('invalid-argument', 'Mật khẩu mới cần từ 8 đến 128 ký tự và khác mật khẩu ban đầu.');
    await auth.updateUser(uid, { password });
    await auth.revokeRefreshTokens(uid);
    // Keep the gate closed if Auth or the database fails; a retry can finish setup.
    const changedAt = Date.now();
    const result = await db.ref(`accounts/${uid}`).transaction(current => {
      if (!current) return {}; // Retry against server state.
      if (!current.isDefaultAdmin || current.requiresPasswordChange !== true) return;
      return { ...current, requiresPasswordChange: false, passwordChangedAt: changedAt };
    });
    if (!result.committed) fail('failed-precondition', 'Chưa hoàn tất đổi mật khẩu. Hãy đăng nhập lại.');
    return { ok: true };
  });
  exports.platformSession = onCall(options, async (r) => {
    const uid = uidFor(r);
    const access = accountAccess((await db.ref(`accounts/${uid}`).get()).val(), (await db.ref(`admin/operations/access/${uid}`).get()).val(), r.auth.token?.auth_time);
    const device = (await db.ref(`deviceAccess/${uid}`).get()).val();
    if (device) fail('permission-denied', 'Tài khoản thiết bị không dùng để đăng nhập ứng dụng.');
    return { role: access && p.ROLES.includes(access.role) ? 'admin' : 'user', uid };
  });
  exports.userSnapshot = onCall(options, async (r) => {
    const uid = uidFor(r);
    const [profile, cardsSnap, games, ops, notices, tickets] = await Promise.all([
      db.ref(`userData/${uid}/profile`).get(),
      db.ref('cards').orderByChild('ownerAuthUid').equalTo(uid).limitToFirst(51).get(),
      bounded('catalog/games'), db.ref('admin/operations').get(),
      db.ref(`userData/${uid}/notifications`).orderByKey().limitToLast(100).get(),
      db.ref('support').orderByChild('userId').equalTo(uid).limitToFirst(101).get(),
    ]);
    const cards = list(cardsSnap.val()).map(({ _operations, ...card }) => card);
    if (cards.length > 50 || list(tickets.val()).length > 100) fail('resource-exhausted', 'Cần phân trang thẻ/yêu cầu hỗ trợ.');
    const operation = ops.val() || {};
    const devices = await Promise.all(games.map(async (g) => ({ game: g, device: (await db.ref(`devices/${g.deviceId}`).get()).val() })));
    let card = null, transactions = [];
    if (r.data?.cardUid) {
      card = await ownCard(uid, r.data.cardUid);
      // New records are projected per card by the backend, indexed chronologically by time-prefixed ID.
      transactions = list((await db.ref(`cardHistory/${card.id}`).orderByKey().limitToLast(100).get()).val())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
    const account = await auth.getUser(uid);
    return {
      profile: { name: account.displayName || '', phone: '', ...profile.val(), email: account.email || '', memberSince: account.metadata.creationTime },
      cards, card, transactions,
      branches: list(operation.branches).map(({ id, name, address }) => ({ id, name, address })),
      games: devices.filter(({ game }) => game.enabled).map(({ game, device }) => ({ ...game, available: p.publishable(game, device, Date.now(), operation.settings?.offlineSeconds || 120), status: device?.status || 'unknown', lastSeenEpoch: device?.lastSeenEpoch || 0 })),
      notifications: list(notices.val()).sort((a, b) => b.createdAt - a.createdAt),
      tickets: list(tickets.val()).sort((a, b) => b.updatedAt - a.updatedAt), updatedAt: Date.now(),
    };
  });
  exports.userProfileSave = onCall(options, async (r) => {
    const uid = uidFor(r); const value = parse(p.cleanProfile, r.data);
    await db.ref(`userData/${uid}/profile`).set(value); return { ok: true };
  });
  exports.userNoticeRead = onCall(options, async (r) => {
    const uid = uidFor(r), id = key(r.data?.id);
    await db.ref(`userData/${uid}/notifications/${id}`).transaction((v) => v ? { ...v, read: true } : undefined);
    return { ok: true };
  });
  exports.userSupportCreate = onCall(options, async (r) => {
    const uid = uidFor(r), clean = parse(p.cleanTicket, r.data);
    let branchId = '', deviceId = '';
    if (clean.cardUid) branchId = (await ownCard(uid, clean.cardUid)).branchId || '';
    if (clean.gameId) {
      const game = (await db.ref(`catalog/games/${clean.gameId}`).get()).val();
      if (!game) fail('not-found', 'Không tìm thấy game.');
      branchId = game.branchId; deviceId = game.deviceId;
    }
    const email = r.auth.token.email || '';
    const result = await db.ref(`support/${clean.id}`).transaction((old) => old || { ...clean, userId: uid, email, branchId, deviceId, status: 'new', reply: '', createdAt: Date.now(), updatedAt: Date.now() });
    const saved = result.snapshot.val();
    if (saved.userId !== uid || saved.title !== clean.title || saved.message !== clean.message || saved.cardUid !== clean.cardUid || saved.gameId !== clean.gameId || saved.category !== clean.category) fail('already-exists', 'Mã yêu cầu đã được sử dụng.');
    return { id: clean.id };
  });
  exports.adminPlatformSnapshot = onCall(options, async (r) => {
    const access = await accessFor(r);
    const [games, branches, devices, tickets, cards] = await Promise.all([
      bounded('catalog/games'), bounded('admin/operations/branches'), bounded('devices', 1000), bounded('support'), bounded('cards'),
    ]);
    return {
      games: games.filter((g) => !access.branchId || g.branchId === access.branchId),
      branches: branches.filter((b) => !access.branchId || b.id === access.branchId),
      devices: devices.filter((d) => !access.branchId || d.branchId === access.branchId).map(({ id, name, configVersion, price, gameDurationSeconds }) => ({ id, name, configVersion, price, gameDurationSeconds })),
      tickets: tickets.filter((t) => p.canSupport(access, t.branchId)).sort((a, b) => b.updatedAt - a.updatedAt),
      cards: cards.filter((c) => ['super_admin', 'operations', 'accountant'].includes(access.role) && (!access.branchId || c.branchId === access.branchId)).map(({ id, name, ownerAuthUid, branchId, active, balance }) => ({ id, name, ownerAuthUid: ownerAuthUid || '', branchId: branchId || '', active, balance })),
      access,
    };
  });
  exports.adminGameSave = onCall(options, async (r) => {
    const access = await accessFor(r), id = key(r.data?.id), clean = parse(p.cleanGame, r.data?.value);
    const [device, branch, metadata, provision] = await Promise.all([db.ref(`devices/${clean.deviceId}`).get(), db.ref(`admin/operations/branches/${clean.branchId}`).get(), db.ref(`admin/operations/devices/${clean.deviceId}`).get(), db.ref(`deviceProvision/${clean.deviceId}`).get()]);
    if (!device.exists() || !branch.exists()) fail('not-found', 'Cần máy đã đăng ký và chi nhánh tồn tại.');
    if (provision.val()?.enabled !== true || provision.val()?.branchId !== clean.branchId) fail('failed-precondition', 'Chi nhánh game phải khớp chi nhánh đã cấp quyền cho ESP32.');
    const deviceBranch = metadata.val()?.branchId || device.val()?.branchId || '';
    if (!p.canManage(access, clean.branchId) || !p.canManage(access, deviceBranch)) fail('permission-denied', 'Ngoài phạm vi quản lý.');
    // Catalog and configuration share one transaction; one game per machine.
    const version = randomUUID(); let rejection = 'Game không hợp lệ.';
    const result = await db.ref('catalog').transaction((catalog) => {
      catalog ||= {}; catalog.games ||= {}; catalog.deviceConfig ||= {};
      const old = catalog.games[id];
      if (old && (!p.canManage(access, old.branchId) || old.deviceId !== clean.deviceId)) { rejection = 'Không đổi máy của game đã tạo; hãy tắt game cũ.'; return; }
      if (Object.entries(catalog.games).some(([other, g]) => other !== id && g.deviceId === clean.deviceId)) { rejection = 'Máy này đã có game. Hãy sửa game hiện tại.'; return; }
      catalog.games[id] = { ...clean, version, updatedAt: Date.now() };
      catalog.deviceConfig[clean.deviceId] = { ...clean, gameId: id, version };
      return catalog;
    });
    if (!result.committed) fail('failed-precondition', rejection);
    return { ok: true, version };
  });
  exports.adminCardAssign = onCall(options, async (r) => {
    const access = await accessFor(r), cardUid = key(r.data?.cardUid), branchId = key(r.data?.branchId);
    if (!p.canManage(access, branchId)) fail('permission-denied', 'Ngoài phạm vi quản lý.');
    if (!(await db.ref(`admin/operations/branches/${branchId}`).get()).exists()) fail('not-found', 'Chi nhánh không tồn tại.');
    const email = parse((v) => p.text(v, 'email', 254), r.data);
    const user = await auth.getUserByEmail(parse(accountEmail, email)).catch(() => fail('not-found', 'Tài khoản chưa được đăng ký.'));
    if ((await db.ref(`deviceAccess/${user.uid}`).get()).exists()) fail('failed-precondition', 'Không gán thẻ cho tài khoản thiết bị.');
    const result = await db.ref(`cards/${cardUid}`).transaction((card) => {
      if (!card) return null; // Empty local cache: allow server comparison/retry; never create a card here.
      if (!p.canManage(access, card.branchId || '')) return;
      return { ...card, ownerAuthUid: user.uid, branchId };
    });
    if (!result.committed || result.snapshot.val()?.ownerAuthUid !== user.uid) fail('permission-denied', 'Thẻ không tồn tại hoặc ngoài phạm vi quản lý.');
    await notice(user.uid, `assigned-${cardUid}-${user.uid}`, { type: 'card', title: 'Đã liên kết thẻ', message: `Thẻ ${cardUid} đã được nhân viên liên kết với tài khoản của bạn.`, cardUid, branchId });
    return { ok: true };
  });
  exports.adminCashTopUp = onCall(options, async (r) => {
    const access = await accessFor(r), cardUid = key(r.data?.cardUid), branchId = key(r.data?.branchId);
    if (!['super_admin', 'accountant'].includes(access.role) || (access.branchId && access.branchId !== branchId)) fail('permission-denied', 'Không có quyền thu tiền tại chi nhánh.');
    const amount = r.data?.amount;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 5000000) fail('invalid-argument', 'Số tiền từ 1 đến 5.000.000đ.');
    const reference = parse((v) => p.text(v, 'reference', 120), r.data);
    // A numbered cashier receipt has the same identity across devices and app restarts.
    const id = `cash-${createHash('sha256').update(`${branchId}\n${reference}`).digest('hex')}`;
    const claim = await db.ref(`cashReceipts/${id}`).transaction((old) => old || { cardUid, amount, branchId, reference });
    if (claim.snapshot.val()?.cardUid !== cardUid || claim.snapshot.val()?.amount !== amount) fail('already-exists', 'Số biên nhận đã dùng cho thẻ/số tiền khác.');
    if (!(await db.ref(`admin/operations/branches/${branchId}`).get()).exists()) fail('not-found', 'Chi nhánh không tồn tại.');
    let rejection = 'Không thể ghi nhận tiền.';
    const result = await db.ref(`cards/${cardUid}`).transaction((card) => {
      if (!card) return null;
      if (card.branchId !== branchId) { rejection = 'Thẻ không thuộc chi nhánh đã chọn.'; return; }
      const old = card._operations?.[id];
      if (old) {
        if (old.source !== 'ADMIN_CASH' || old.amount !== amount || old.reference !== reference) { rejection = 'Mã giao dịch đã được sử dụng.'; return; }
        return card;
      }
      if (card.active !== true || !Number.isSafeInteger(card.balance) || card.balance < 0 || card.balance + amount > 2147483647) { rejection = 'Thẻ bị khóa hoặc số dư không hợp lệ.'; return; }
      for (const field of ['topupCount', 'totalTopup']) {
        if (card[field] !== undefined && (!Number.isSafeInteger(card[field]) || card[field] < 0)) { rejection = 'Bộ đếm không hợp lệ.'; return; }
      }
      if ((card.topupCount || 0) >= 2147483647 || (card.totalTopup || 0) + amount > 2147483647) { rejection = 'Bộ đếm vượt giới hạn của thẻ.'; return; }
      const now = Math.floor(Date.now() / 1000);
      const receipt = { requestId: id, uid: cardUid, type: 'TOPUP', amount, balanceBefore: card.balance, balanceAfter: card.balance + amount, timestamp: now, time: new Date(now * 1000).toISOString(), source: 'ADMIN_CASH', paymentMethod: 'cash', status: 'COMMITTED', branchId, deviceId: `cashier-${branchId}`, reference, actor: r.auth.uid, ownerAuthUid: card.ownerAuthUid || '' };
      return { ...card, balance: receipt.balanceAfter, topupCount: (card.topupCount || 0) + 1, totalTopup: (card.totalTopup || 0) + amount, lastTopupAtEpoch: now, lastTopupAt: receipt.time, _operations: { ...card._operations, [id]: receipt } };
    });
    if (!result.committed || !result.snapshot.val()?._operations?.[id]) fail('failed-precondition', rejection);
    const receipt = result.snapshot.val()._operations[id];
    // Immutable projections can be retried after a lost response without crediting twice.
    await db.ref(`transactions/${id}`).transaction((old) => old || receipt);
    await db.ref(`admin/ledger/${id}`).transaction((old) => old || { verified: true, deviceId: receipt.deviceId, branchId, amount, kind: 'payment', status: 'success', paymentMethod: 'cash', occurredAt: receipt.timestamp * 1000, actor: receipt.actor, reference });
    return { ok: true, receipt };
  });
  exports.adminSupportReply = onCall(options, async (r) => {
    const access = await accessFor(r), id = key(r.data?.id), requestId = key(r.data?.requestId);
    const reply = parse((v) => p.text(v, 'reply', 2000), r.data);
    if (!['new', 'working', 'resolved'].includes(r.data?.status)) fail('invalid-argument', 'Trạng thái không hợp lệ.');
    const result = await db.ref(`support/${id}`).transaction((t) => {
      if (!t) return null;
      if (!p.canSupport(access, t.branchId)) return;
      if (t.replyRequestId === requestId) return t.reply === reply && t.status === r.data.status ? t : undefined;
      return { ...t, reply, status: r.data.status, repliedBy: r.auth.uid, replyRequestId: requestId, updatedAt: Date.now() };
    });
    if (!result.committed || !result.snapshot.val()?.userId) fail('permission-denied', 'Yêu cầu ngoài phạm vi quản lý.');
    await notice(result.snapshot.val().userId, `support-${requestId}`, { type: 'support', title: 'Phản hồi hỗ trợ', message: reply, ticketId: id });
    return { ok: true };
  });
  exports.projectCardTransaction = onValueCreated({ ref: '/transactions/{id}', region: options.region, retry: true }, async (event) => {
    const t = event.data.val();
    if (!p.validKey(t?.uid) || !Number.isSafeInteger(t.timestamp) || t.timestamp <= 0) return;
    const card = (await db.ref(`cards/${t.uid}`).get()).val();
    // Only publish a committed receipt actually stored atomically on the card.
    const receipt = card?._operations?.[event.params.id];
    if (!receipt || receipt.paymentMethod === 'simulation' || receipt.status === 'REJECTED' || receipt.uid !== t.uid || receipt.balanceAfter !== t.balanceAfter || receipt.amount !== t.amount || receipt.type !== t.type || receipt.timestamp !== t.timestamp) return;
    const historyId = `${String(t.timestamp).padStart(12, '0')}-${event.params.id}`;
    await db.ref(`cardHistory/${t.uid}/${historyId}`).transaction((old) => old || { ...receipt, requestId: event.params.id });
    if (receipt.ownerAuthUid && receipt.ownerAuthUid === card.ownerAuthUid && t.type === 'TOPUP') await notice(receipt.ownerAuthUid, `topup-${event.params.id}`, { type: 'money', title: 'Đã nhận tiền', message: `Thẻ ${t.uid} đã được cộng ${t.amount.toLocaleString('vi-VN')}đ.`, cardUid: t.uid });
  });
  exports.projectDeviceEvent = onValueCreated({ ref: '/deviceEvents/{deviceId}/{id}', region: options.region, retry: true }, async (event) => {
    const e = event.data.val();
    if (!e || e.id !== event.params.id || !p.validKey(e.uid)) return;
    let value; try { value = p.eventNotice(e); } catch { return; }
    const [cardSnap, configSnap] = await Promise.all([db.ref(`cards/${e.uid}`).get(), db.ref(`catalog/deviceConfig/${event.params.deviceId}`).get()]);
    const card = cardSnap.val(), config = configSnap.val();
    if (!card?.ownerAuthUid) return;
    if (/^SESSION_/.test(e.type)) {
      if (!p.validKey(e.operationId)) return;
      const receipt = card._operations?.[e.operationId];
      if (!receipt || receipt.type !== 'PLAY' || receipt.status !== 'COMMITTED' || receipt.deviceId !== event.params.deviceId || receipt.ownerAuthUid !== card.ownerAuthUid) return;
    }
    await notice(card.ownerAuthUid, `event-${event.params.deviceId}-${e.id}`, { ...value, cardUid: e.uid, deviceId: event.params.deviceId, branchId: config?.branchId || card.branchId || '' });
  });
  exports.processDeviceRequest = onValueCreated({ ref: '/deviceRequests/{deviceId}/{id}', region: options.region, retry: true }, async (event) => {
    const { deviceId, id } = event.params; const request = event.data.val();
    const resultRef = db.ref(`deviceResults/${deviceId}/${id}`);
    if (!request || request.id !== id || !p.validKey(request.uid) || !['PLAY', 'TOPUP', 'CREATE'].includes(request.type)) {
      await resultRef.set({ status: 'REJECTED', reason: 'INVALID REQUEST' }); return;
    }
    const provision = (await db.ref(`deviceProvision/${deviceId}`).get()).val();
    const access = provision?.authUid ? (await db.ref(`deviceAccess/${provision.authUid}`).get()).val() : null;
    if (!access?.enabled || access.deviceId !== deviceId || provision.enabled !== true || access.branchId !== provision.branchId) {
      await resultRef.set({ status: 'REJECTED', reason: 'DEVICE DISABLED' }); return;
    }
    if (request.type === 'CREATE') {
      if (!provision.canTopUp) { await resultRef.set({ status: 'REJECTED', reason: 'CASHIER ONLY' }); return; }
      const created = await db.ref(`cards/${request.uid}`).transaction((card) => card || { uid: request.uid, name: `Card ${request.uid}`, branchId: provision.branchId, balance: 0, active: true, createdAtEpoch: Math.floor(Date.now() / 1000), playCount: 0, topupCount: 0, totalSpent: 0, totalTopup: 0, createRequestId: id });
      if (created.snapshot.val()?.createRequestId !== id) { await resultRef.set({ status: 'REJECTED', reason: 'CARD ALREADY EXISTS' }); return; }
      await resultRef.set({ status: 'COMMITTED', requestId: id, uid: request.uid, type: 'CREATE', amount: 0, balanceBefore: 0, balanceAfter: 0 }); return;
    }
    const config = (await db.ref(`catalog/deviceConfig/${deviceId}`).get()).val();
    let rejection = '';
    const result = await db.ref(`cards/${request.uid}`).transaction((card) => {
      try { return require('./device-money.cjs').applyRequest(card, request, deviceId, provision, config, Date.now()); }
      catch (e) { rejection = e.message; return; }
    });
    const receipt = result.snapshot.val()?._operations?.[id];
    if (!result.committed || !receipt) { await resultRef.set({ status: 'REJECTED', reason: rejection || 'CARD NOT FOUND' }); return; }
    if (receipt.status === 'COMMITTED') {
      await db.ref(`transactions/${id}`).transaction((old) => old || receipt);
      if (receipt.type === 'TOPUP') await db.ref(`admin/ledger/${id}`).transaction((old) => old || { verified: true, kind: 'payment', status: 'success', deviceId, branchId: receipt.branchId, paymentMethod: 'cash', amount: receipt.amount, occurredAt: receipt.timestamp * 1000 });
    }
    // Result is published after durable money/history projections, so retry cannot credit again.
    await resultRef.set(receipt);
  });
  exports.syncAccountCard = onValueWritten({ ref: '/cards/{uid}', region: options.region, retry: true }, async (event) => {
    const previousOwner = event.data.before.val()?.ownerAuthUid;
    const current = (await db.ref(`cards/${event.params.uid}`).get()).val();
    const owner = current?.ownerAuthUid;
    if (previousOwner && previousOwner !== owner) {
      await db.ref(`accounts/${previousOwner}/card/${event.params.uid}`).set(null);
    }
    if (owner) {
      const { _operations, ...card } = current;
      await db.ref(`accounts/${owner}/card/${event.params.uid}`).set({ ...card, uid: event.params.uid });
    }
  });
  exports.notifyCardBlocked = onValueWritten({ ref: '/cards/{uid}/active', region: options.region, retry: true }, async (event) => {
    if (event.data.after.val() !== false || event.data.before.val() === false) return;
    const card = (await db.ref(`cards/${event.params.uid}`).get()).val();
    if (card?.ownerAuthUid) await notice(card.ownerAuthUid, `blocked-${event.id}`, { type: 'card', title: 'Thẻ đã bị khóa', message: 'Vui lòng liên hệ nhân viên để kiểm tra.', cardUid: event.params.uid });
  });
  exports.notifyActiveGameError = onValueWritten({ ref: '/devices/{deviceId}/status', region: options.region, retry: true }, async (event) => {
    if (event.data.after.val() !== 'error') return;
    const device = (await db.ref(`devices/${event.params.deviceId}`).get()).val();
    if (!p.validKey(device?.activeUid) || !p.validKey(device?.activeOperationId)) return;
    const card = (await db.ref(`cards/${device.activeUid}`).get()).val();
    const receipt = card?._operations?.[device.activeOperationId];
    if (card?.ownerAuthUid && receipt?.ownerAuthUid === card.ownerAuthUid && receipt?.status === 'COMMITTED' && receipt.deviceId === event.params.deviceId) await notice(card.ownerAuthUid, `game-error-${device.activeOperationId}`, { type: 'error', title: 'Máy gặp sự cố', message: 'Máy trong lượt chơi của bạn báo lỗi. Vui lòng liên hệ hỗ trợ.', deviceId: event.params.deviceId, cardUid: device.activeUid });
  });
  return exports;
};
