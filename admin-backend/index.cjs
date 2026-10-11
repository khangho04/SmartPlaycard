const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onValueCreated, onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { randomUUID } = require("node:crypto");
const core = require("./core.cjs");
const { accountEmail } = require('./account-identity.cjs');
initializeApp();
const db = getDatabase();
const options = {
  region: "asia-southeast1",
  maxInstances: 10,
  timeoutSeconds: 60,
};
Object.assign(exports, require('./platform.cjs')({ db, auth: getAuth(), onCall, onValueCreated, onValueWritten, HttpsError, options }));
const rows = (value) =>
  Object.entries(value || {}).map(([id, item]) => ({ ...item, id }));
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
async function accessFor(request) {
  if (!request.auth) fail("unauthenticated", "Cần đăng nhập.");
  const access = require('./account-access.cjs').accountAccess(
    (await db.ref(`accounts/${request.auth.uid}`).get()).val(),
    (await db.ref(`admin/operations/access/${request.auth.uid}`).get()).val(), request.auth.token?.auth_time
  );
  if (!access || !core.ROLES.includes(access.role))
    fail("permission-denied", "Chưa được cấp quyền quản trị.");
  return { ...access, uid: request.auth.uid };
}
async function devices() {
  const result =
    (await db.ref("devices").orderByKey().limitToFirst(1001).get()).val() || {};
  if (Object.keys(result).length > 1000)
    fail(
      "resource-exhausted",
      "Vượt 1000 thiết bị. Cần phân vùng dữ liệu trước khi tiếp tục.",
    );
  return result;
}
function branchOf(ops, raw, id) {
  return ops.devices?.[id]?.branchId ?? raw[id]?.branchId ?? "";
}
function deviceList(raw, ops, access) {
  return Object.entries(raw)
    .map(([id, d]) => ({
      id,
      name: ops.devices?.[id]?.name || d.name || id,
      branchId: branchOf(ops, raw, id),
      lastSeenEpoch: Number(d.lastSeenEpoch) || 0,
      status: typeof d.status === "string" ? d.status : "unknown",
      playing: d.playing === true,
      firmware: d.firmwareVersion || d.firmware || "",
      ipAddress: d.ipAddress || "",
      wifiRSSI: Number(d.wifiRSSI) || 0,
      note: ops.devices?.[id]?.note || "",
    }))
    .filter((d) => core.inScope(access, d.branchId));
}
exports.adminSnapshot = onCall(options, async (request) => {
  const access = await accessFor(request);
  const [opsSnap, raw, supportSnap] = await Promise.all([
    db.ref("admin/operations").get(),
    devices(),
    db.ref('support').get(),
  ]);
  const ops = opsSnap.val() || {};
  const list = deviceList(raw, ops, access);
  const ids = new Set(list.map((d) => d.id));
  return {
    access,
    supportCount: ['super_admin', 'operations', 'technician'].includes(access.role)
      ? rows(supportSnap.val()).filter((t) => t.status === 'new' && core.inScope(access, t.branchId)).length : 0,
    devices: list,
    branches: rows(ops.branches).filter((b) => core.inScope(access, b.id)),
    alerts: rows(ops.alerts)
      .filter((a) => ids.has(a.deviceId))
      .sort((a, b) => b.updatedAt - a.updatedAt),
    maintenance: rows(ops.maintenance)
      .filter((m) => ids.has(m.deviceId))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    audit: ["super_admin", "operations"].includes(access.role)
      ? rows(ops.audit)
          .filter((a) => core.inScope(access, a.branchId))
          .sort((a, b) => b.at - a.at)
          .slice(0, 100)
      : [],
    users:
      access.role === "super_admin"
        ? Object.entries(ops.access || {}).map(([uid, a]) => ({ ...a, uid }))
        : [],
    settings: { offlineSeconds: ops.settings?.offlineSeconds || 120 },
    updatedAt: Date.now(),
  };
});
exports.adminMutate = onCall(options, async (request) => {
  const initialAccess = await accessFor(request);
  const { action, value } = request.data || {};
  let id = request.data?.id;
  if (!core.allowed(initialAccess, action))
    fail("permission-denied", "Không có quyền thay đổi.");
  if (!core.validKey(id)) fail("invalid-argument", "Mã không hợp lệ.");
  let clean;
  try {
    clean = core.cleanMutation(action, value);
    if (action === 'access') clean.email = accountEmail(clean.email);
  } catch (e) {
    fail("invalid-argument", e.message);
  }
  if (action === "access") {
    const target = await getAuth()
      .getUserByEmail(clean.email)
      .catch(() =>
        fail("not-found", "Tài khoản chưa được đăng ký."),
      );
    if (id !== "new" && id !== target.uid)
      fail("invalid-argument", "Tài khoản không khớp UID.");
    id = target.uid;
    if (id === request.auth.uid)
      fail("failed-precondition", "Không thể thay đổi quyền của chính mình.");
  }
  const raw = ["device", "maintenance", "alert"].includes(action)
    ? await devices()
    : {};
  const auditId = randomUUID();
  const now = Date.now();
  let rejection = "Không thể lưu thay đổi.";
  const account = (await db.ref(`accounts/${request.auth.uid}`).get()).val();
  const accessChange = action === 'access';
  const revoke = accessChange && request.data?.revoke === true;
  const result = await db.ref(accessChange ? '/' : "admin/operations").transaction((state) => {
    if (!state) return {};
    const current = accessChange ? state.admin?.operations : state;
    if (!current) return {}; // Force retry against server state on an empty SDK cache; grants nothing.
    const access = require('./account-access.cjs').accountAccess(accessChange ? state.accounts?.[request.auth.uid] : account, current.access?.[request.auth.uid], request.auth.token?.auth_time);
    if (!core.allowed(access, action)) {
      rejection = "Quyền đã thay đổi.";
      return;
    }
    if (accessChange && state.accounts?.[id]?.isDefaultAdmin) {
      rejection = 'Không thể thay đổi hoặc thu hồi quyền của tài khoản admin mặc định.';
      return;
    }
    const collection = {
      device: "devices",
      branch: "branches",
      alert: "alerts",
      maintenance: "maintenance",
      access: "access",
      settings: "settings",
    }[action];
    const before =
      action === "settings"
        ? current.settings || null
        : current[collection]?.[id] || null;
    let branchId = "";
    if (action === "device") {
      branchId = branchOf(current, raw, id);
      if (
        !raw[id] ||
        !core.inScope(access, branchId) ||
        !core.inScope(access, clean.branchId)
      ) {
        rejection = "Thiết bị ngoài phạm vi quản lý.";
        return;
      }
    }
    if (action === "alert" || action === "maintenance") {
      const targetId = action === "alert" ? before?.deviceId : clean.deviceId;
      branchId = branchOf(current, raw, targetId);
      if (
        !raw[targetId] ||
        !core.inScope(access, branchId) ||
        (before?.deviceId &&
          !core.inScope(access, branchOf(current, raw, before.deviceId)))
      ) {
        rejection = "Thiết bị ngoài phạm vi quản lý.";
        return;
      }
    }
    if (action === "branch") {
      branchId = id;
      if (!core.inScope(access, id)) {
        rejection = "Chi nhánh ngoài phạm vi quản lý.";
        return;
      }
    }
    if (clean.branchId && !current.branches?.[clean.branchId]) {
      rejection = "Chi nhánh không tồn tại.";
      return;
    }
    const after = revoke ? null :
      action === "alert" ? { ...before, ...clean, updatedAt: now } : clean;
    if (action === "settings") current.settings = after;
    else {
      current[collection] ??= {};
      if (revoke) delete current[collection][id];
      else current[collection][id] = after;
    }
    if (accessChange) {
      state.accounts ??= {};
      state.accounts[id] ??= {};
      state.accounts[id].access = revoke ? 'user' : 'admin';
    }
    current.audit ??= {};
    current.audit[auditId] = {
      actor: access.email || request.auth.uid,
      action,
      target: id,
      at: now,
      branchId,
      before,
      after,
    };
    // This operational log is intentionally bounded. Archive externally for long-term retention.
    const audit = Object.entries(current.audit).sort(
      (a, b) => b[1].at - a[1].at,
    );
    for (const [key] of audit.slice(1000)) delete current.audit[key];
    return accessChange ? state : current;
  });
  if (!result.committed || !result.snapshot.child(`${accessChange ? 'admin/operations/' : ''}audit/${auditId}`).exists())
    fail("failed-precondition", rejection);
  return { ok: true };
});
exports.adminReport = onCall(options, async (request) => {
  const access = await accessFor(request);
  if (!core.FINANCE.includes(access.role))
    fail("permission-denied", "Không có quyền xem doanh thu.");
  const { start, end, deviceId = "" } = request.data || {};
  const branchId = access.branchId || request.data?.branchId || "";
  if (
    !core.validRange(start, end) ||
    (deviceId && !core.validKey(deviceId)) ||
    (branchId && !core.validKey(branchId))
  )
    fail("invalid-argument", "Bộ lọc không hợp lệ; tối đa 366 ngày.");
  if (
    access.branchId &&
    request.data?.branchId &&
    request.data.branchId !== access.branchId
  )
    fail("permission-denied", "Ngoài phạm vi chi nhánh.");
  const span = Date.parse(end) - Date.parse(start) + 86400000;
  const previousStart = new Date(Date.parse(start) - span)
    .toISOString()
    .slice(0, 10);
  const previousEnd = new Date(Date.parse(start) - 86400000)
    .toISOString()
    .slice(0, 10);
  const today = core.dayKey(Date.now());
  const yearStart = `${today.slice(0, 4)}-01-01`;
  // Fetch disjoint bounded windows rather than all historical transactions.
  const read = async (from, to) =>
    (
      await db
        .ref("admin/reportDays")
        .orderByKey()
        .startAt(from)
        .endAt(to)
        .get()
    ).val() || {};
  const [selected, previous, year] = await Promise.all([
    read(start, end),
    read(previousStart, previousEnd),
    read(yearStart, today),
  ]);
  const days = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    days.push({ day, ...core.sumDays(selected, day, day, branchId, deviceId) });
  }
  const ranking = {};
  const methods = {};
  const hours = {};
  let updatedAt = null;
  for (const d of Object.values(selected)) {
    updatedAt = Math.max(updatedAt || 0, d.updatedAt || 0);
    for (const b of Object.values(d.devices || {}))
      if (
        (!branchId || b.branchId === branchId) &&
        (!deviceId || b.deviceId === deviceId)
      ) {
        ranking[b.deviceId] = (ranking[b.deviceId] || 0) + b.gross - b.refunds;
        for (const [k, v] of Object.entries(b.methods || {}))
          methods[k] = (methods[k] || 0) + v;
        for (const [k, v] of Object.entries(b.hours || {}))
          hours[k] = (hours[k] || 0) + v;
      }
  }
  return {
    days,
    previous: core.sumDays(
      previous,
      previousStart,
      previousEnd,
      branchId,
      deviceId,
    ),
    today: core.sumDays(year, today, today, branchId, deviceId),
    month: core.sumDays(
      year,
      `${today.slice(0, 7)}-01`,
      today,
      branchId,
      deviceId,
    ),
    year: core.sumDays(year, yearStart, today, branchId, deviceId),
    ranking: Object.entries(ranking)
      .map(([id, net]) => ({ id, name: id, net }))
      .sort((a, b) => b.net - a.net),
    methods,
    hours,
    updatedAt,
  };
});
exports.adminLedger = onCall(options, async (request) => {
  const access = await accessFor(request);
  if (!core.FINANCE.includes(access.role))
    fail("permission-denied", "Không có quyền xem giao dịch.");
  const cursor = request.data?.cursor;
  if (cursor && !core.validKey(cursor))
    fail("invalid-argument", "Cursor không hợp lệ.");
  // Per-branch index prevents scans of other branches and guarantees full pages.
  let query = db
    .ref(
      access.branchId
        ? `admin/ledgerByBranch/${access.branchId}`
        : "admin/ledger",
    )
    .orderByKey();
  if (cursor) query = query.endBefore(cursor);
  const page = rows((await query.limitToLast(51).get()).val()).sort((a, b) =>
    b.id.localeCompare(a.id),
  );
  return {
    rows: page.slice(0, 50),
    next: page.length > 50 ? page[49].id : null,
  };
});
// Only a trusted payment backend may create immutable ledger records, using a stable ID.
// Legacy PLAY/TOPUP records are deliberately NOT promoted into verified revenue.
exports.aggregateAdminLedger = onValueCreated(
  { ref: "/admin/ledger/{id}", region: "asia-southeast1", retry: true },
  async (event) => {
    const entry = event.data.val();
    const id = event.params.id;
    core.validateLedger(entry);
    await db
      .ref(`admin/reportDays/${core.dayKey(entry.occurredAt)}`)
      .transaction((current) =>
        core.applyLedger(current, id, entry, Date.now()),
      );
    await db.ref(`admin/ledgerByBranch/${entry.branchId}/${id}`).set(entry);
  },
);
exports.detectAdminAlerts = onSchedule(
  { schedule: "every 1 minutes", region: "asia-southeast1", maxInstances: 1 },
  async () => {
    const raw = await devices();
    const now = Date.now();
    const alertState = await db.ref("admin/operations").transaction((ops) => {
      if (!ops) return {};
      ops.alerts ??= {};
      const threshold = (ops.settings?.offlineSeconds || 120) * 1000;
      for (const [id, d] of Object.entries(raw)) {
        const seen = Number(d.lastSeenEpoch) * 1000;
        const unknown =
          !Number.isFinite(seen) || seen <= 0 || seen > now + 60000;
        const offline =
          !unknown && (now - seen > threshold || d.status === "offline");
        const conditions = {
          offline: [offline, "Thiết bị mất kết nối", "warning"],
          clock: [unknown, "Thiết bị chưa đồng bộ thời gian", "warning"],
          hardware: [
            d.status === "error",
            "Thiết bị báo lỗi phần cứng/ứng dụng",
            "critical",
          ],
        };
        for (const [code, [active, title, severity]] of Object.entries(
          conditions,
        )) {
          const key = `${id}_${code}`;
          const old = ops.alerts[key];
          if (active && (!old || old.conditionActive !== true))
            ops.alerts[key] = {
              id: key,
              deviceId: id,
              title,
              severity,
              status: "new",
              createdAt: old?.createdAt || now,
              updatedAt: now,
              count: (old?.count || 0) + 1,
              assignee: old?.assignee || "",
              note: old?.note || "",
              conditionActive: true,
            };
          else if (!active && old?.conditionActive)
            ops.alerts[key] = {
              ...old,
              conditionActive: false,
              updatedAt: now,
              status: "resolved",
            };
        }
      }
      return ops;
    });
    const offlineThreshold = (alertState.snapshot.val()?.settings?.offlineSeconds || 120) * 1000;
    // Notify only the owner of an actual active receipt, once per interrupted session.
    for (const [deviceId, d] of Object.entries(raw)) {
      const seen = Number(d.lastSeenEpoch) * 1000;
      if (!seen || now - seen <= offlineThreshold || !core.validKey(d.activeUid) || !core.validKey(d.activeOperationId)) continue;
      const card = (await db.ref(`cards/${d.activeUid}`).get()).val();
      const receipt = card?._operations?.[d.activeOperationId];
      if (!card?.ownerAuthUid || receipt?.ownerAuthUid !== card.ownerAuthUid || receipt.deviceId !== deviceId || receipt.status !== 'COMMITTED') continue;
      await db.ref(`userData/${card.ownerAuthUid}/notifications/offline-${d.activeOperationId}`).transaction((old) => old || {
        title: 'Máy mất kết nối trong lượt chơi', message: 'Máy không gửi heartbeat mới. Vui lòng liên hệ hỗ trợ để kiểm tra lượt chơi.', type: 'error', deviceId, cardUid: d.activeUid, createdAt: now, read: false,
      });
    }
  },
);
