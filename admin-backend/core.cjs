const { Buffer } = require("node:buffer");
const ROLES = [
  "super_admin",
  "operations",
  "accountant",
  "technician",
  "viewer",
];
const FINANCE = ["super_admin", "accountant", "viewer"];
const empty = () => ({
  gross: 0,
  refunds: 0,
  success: 0,
  failed: 0,
  pending: 0,
  sessions: 0,
  duration: 0,
});
const dayKey = (ms) => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
const validKey = (v) =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 128 &&
  !/[.#$\[\]/\u0000-\u001f\u007f]/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v);
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function validDate(v) {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  );
}
function validRange(start, end) {
  return (
    validDate(start) &&
    validDate(end) &&
    start <= end &&
    Date.parse(end) - Date.parse(start) < 366 * 86400000
  );
}
function allowed(access, action) {
  if (!access || !ROLES.includes(access.role)) return false;
  if (access.role === "super_admin") return true;
  if (["device", "branch"].includes(action))
    return access.role === "operations";
  if (["alert", "maintenance"].includes(action))
    return ["operations", "technician"].includes(access.role);
  return false;
}
function inScope(access, branchId) {
  return !access.branchId || access.branchId === branchId;
}
function text(value, field, required = false) {
  const result = value[field];
  check(
    typeof result === "string" &&
      result.length <= 1000 &&
      (!required || result.trim().length > 0),
    `${field} không hợp lệ.`,
  );
  return result.trim();
}
function cleanMutation(action, value) {
  check(
    value && typeof value === "object" && !Array.isArray(value),
    "Dữ liệu không hợp lệ.",
  );
  if (action === "device")
    return {
      name: text(value, "name", true),
      branchId: text(value, "branchId"),
      note: text(value, "note"),
    };
  if (action === "branch")
    return {
      name: text(value, "name", true),
      address: text(value, "address"),
      manager: text(value, "manager"),
    };
  if (action === "alert") {
    check(
      ["new", "acknowledged", "working", "resolved"].includes(value.status),
      "Trạng thái không hợp lệ.",
    );
    return {
      status: value.status,
      assignee: text(value, "assignee"),
      note: text(value, "note"),
    };
  }
  if (action === "maintenance") {
    check(
      validKey(value.deviceId) &&
        validDate(value.dueDate) &&
        typeof value.completed === "boolean",
      "Thiết bị/ngày/trạng thái bảo trì không hợp lệ.",
    );
    check(
      Number.isSafeInteger(value.cost) &&
        value.cost >= 0 &&
        value.cost <= 1000000000,
      "Chi phí không hợp lệ.",
    );
    return {
      deviceId: value.deviceId,
      dueDate: value.dueDate,
      completed: value.completed,
      cost: value.cost,
      assignee: text(value, "assignee"),
      note: text(value, "note"),
    };
  }
  if (action === "settings") {
    check(
      Number.isInteger(value.offlineSeconds) &&
        value.offlineSeconds >= 30 &&
        value.offlineSeconds <= 3600,
      "Ngưỡng phải từ 30 đến 3600 giây.",
    );
    return { offlineSeconds: value.offlineSeconds };
  }
  if (action === "access") {
    check(ROLES.includes(value.role), "Vai trò không hợp lệ.");
    const branchId = text(value, "branchId");
    check(
      value.role !== "super_admin" || !branchId,
      "Super Admin phải có phạm vi toàn hệ thống.",
    );
    return { email: text(value, "email", true), role: value.role, branchId };
  }
  throw new Error("Thao tác không hợp lệ.");
}
function validateLedger(entry) {
  check(
    entry && entry.verified === true && entry.paymentMethod !== "simulation",
    "Chỉ chấp nhận sổ giao dịch đã xác minh.",
  );
  check(
    validKey(entry.deviceId) && validKey(entry.branchId),
    "Thiếu thiết bị/chi nhánh hợp lệ.",
  );
  check(
    Number.isSafeInteger(entry.amount) &&
      entry.amount >= 0 &&
      entry.amount <= 1000000000,
    "Số tiền phải là số nguyên VND.",
  );
  check(
    Number.isSafeInteger(entry.occurredAt) &&
      entry.occurredAt > 0 &&
      entry.occurredAt < 8640000000000000,
    "occurredAt phải là Unix milliseconds.",
  );
  check(
    ["payment", "refund", "session"].includes(entry.kind) &&
      ["success", "failed", "pending"].includes(entry.status),
    "Loại/trạng thái không hợp lệ.",
  );
  check(validKey(entry.paymentMethod), "Phương thức thanh toán không hợp lệ.");
  if (entry.kind === "refund")
    check(
      validKey(entry.originalPaymentId) && entry.status === "success",
      "Hoàn tiền cần mã thanh toán gốc và trạng thái thành công.",
    );
  if (entry.kind === "session")
    check(
      entry.amount === 0 &&
        Number.isSafeInteger(entry.durationSeconds) &&
        entry.durationSeconds >= 0 &&
        entry.durationSeconds <= 86400,
      "Phiên sử dụng không hợp lệ.",
    );
  return entry;
}
// A whole day is updated transactionally with its receipt IDs. Retried events cannot double count.
function applyLedger(current, id, entry, now) {
  validateLedger(entry);
  check(validKey(id), "Mã giao dịch không hợp lệ.");
  const day = structuredClone(
    current || { receipts: {}, devices: {}, updatedAt: now },
  );
  if (day.receipts?.[id]) return undefined;
  day.receipts ??= {};
  day.devices ??= {};
  // Include branch in the grouping key to preserve historical branch attribution after device moves.
  const key = Buffer.from(
    JSON.stringify([entry.branchId, entry.deviceId]),
  ).toString("base64url");
  const bucket = day.devices[key] ?? {
    ...empty(),
    deviceId: entry.deviceId,
    branchId: entry.branchId,
    methods: {},
    hours: {},
  };
  if (entry.kind === "payment") {
    if (entry.status === "success") {
      bucket.gross += entry.amount;
      bucket.success++;
      bucket.methods[entry.paymentMethod] =
        (bucket.methods[entry.paymentMethod] || 0) + 1;
    } else bucket[entry.status]++;
  } else if (entry.kind === "refund") bucket.refunds += entry.amount;
  else if (entry.status === "success") {
    bucket.sessions++;
    bucket.duration += entry.durationSeconds;
    const hour = new Date(entry.occurredAt + 7 * 3600000)
      .toISOString()
      .slice(11, 13);
    bucket.hours[hour] = (bucket.hours[hour] || 0) + 1;
  }
  for (const field of Object.keys(empty()))
    check(Number.isSafeInteger(bucket[field]), "Tổng vượt giới hạn số nguyên.");
  day.devices[key] = bucket;
  day.receipts[id] = true;
  day.updatedAt = now;
  return day;
}
function sumDays(days, start, end, branchId, deviceId) {
  const result = empty();
  for (const [day, data] of Object.entries(days))
    if (day >= start && day <= end)
      for (const b of Object.values(data.devices || {}))
        if (
          (!branchId || b.branchId === branchId) &&
          (!deviceId || b.deviceId === deviceId)
        )
          for (const k of Object.keys(result)) result[k] += b[k] || 0;
  return result;
}
module.exports = {
  ROLES,
  FINANCE,
  empty,
  dayKey,
  validKey,
  validDate,
  validRange,
  allowed,
  inScope,
  cleanMutation,
  validateLedger,
  applyLedger,
  sumDays,
};
