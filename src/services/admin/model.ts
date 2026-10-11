export type AdminRole =
  "super_admin" | "operations" | "accountant" | "technician" | "viewer";
export type DeviceState =
  "online" | "playing" | "offline" | "error" | "unknown";
export type AlertStatus = "new" | "acknowledged" | "working" | "resolved";
export interface AdminDevice {
  id: string;
  name: string;
  branchId: string;
  lastSeenEpoch?: number;
  status?: string;
  playing?: boolean;
  firmware?: string;
  ipAddress?: string;
  wifiRSSI?: number;
  note?: string;
}
export interface AdminAlert {
  id: string;
  deviceId: string;
  title: string;
  severity: "info" | "warning" | "critical";
  status: AlertStatus;
  createdAt: number;
  updatedAt: number;
  count: number;
  assignee: string;
  note: string;
}
export interface Branch {
  id: string;
  name: string;
  address: string;
  manager: string;
}
export interface Maintenance {
  id: string;
  deviceId: string;
  dueDate: string;
  assignee: string;
  note: string;
  completed: boolean;
  cost: number;
}
export interface Audit {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: number;
  before?: unknown;
  after?: unknown;
}
export interface Access {
  uid: string;
  email: string;
  role: AdminRole;
  branchId: string;
  isDefaultAdmin?: boolean;
}
export interface AdminSnapshot {
  supportCount?: number;
  access: Access;
  devices: AdminDevice[];
  branches: Branch[];
  alerts: AdminAlert[];
  maintenance: Maintenance[];
  audit: Audit[];
  users: Access[];
  settings: { offlineSeconds: number };
  updatedAt: number;
}
export interface Metric {
  gross: number;
  refunds: number;
  success: number;
  failed: number;
  pending: number;
  sessions: number;
  duration: number;
}
export interface ReportDay extends Metric {
  day: string;
}
export interface AdminReport {
  days: ReportDay[];
  previous: Metric;
  today: Metric;
  month: Metric;
  year: Metric;
  ranking: { id: string; name: string; net: number }[];
  methods: Record<string, number>;
  hours: Record<string, number>;
  updatedAt: number | null;
}
export interface LedgerEntry {
  id: string;
  deviceId: string;
  branchId: string;
  amount: number;
  kind: "payment" | "refund" | "session";
  status: "success" | "failed" | "pending";
  paymentMethod: string;
  occurredAt: number;
  durationSeconds?: number;
}
export const roles: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  operations: "Vận hành",
  accountant: "Kế toán",
  technician: "Kỹ thuật viên",
  viewer: "Chỉ xem",
};
export const states: Record<DeviceState, string> = {
  online: "Sẵn sàng",
  playing: "Đang sử dụng",
  offline: "Offline",
  error: "Có lỗi",
  unknown: "Chưa đồng bộ",
};
export const alertStatuses: Record<AlertStatus, string> = {
  new: "Mới",
  acknowledged: "Đã tiếp nhận",
  working: "Đang xử lý",
  resolved: "Đã giải quyết",
};
export const emptyMetric = (): Metric => ({
  gross: 0,
  refunds: 0,
  success: 0,
  failed: 0,
  pending: 0,
  sessions: 0,
  duration: 0,
});
export const money = (amount: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
export function deviceState(
  device: AdminDevice,
  now: number,
  offlineSeconds: number,
): DeviceState {
  const seen = device.lastSeenEpoch;
  if (!seen || !Number.isFinite(seen) || seen * 1000 > now + 60000)
    return "unknown";
  if (now - seen * 1000 > offlineSeconds * 1000 || device.status === "offline")
    return "offline";
  if (device.status === "error") return "error";
  return device.playing === true || device.status === "playing"
    ? "playing"
    : "online";
}
export function dateKey(now = Date.now()) {
  return new Date(now + 7 * 3600000).toISOString().slice(0, 10);
}
export function rangeFor(period: "day" | "month" | "year", now = Date.now()) {
  const end = dateKey(now);
  return {
    start:
      period === "day"
        ? end
        : period === "month"
          ? `${end.slice(0, 7)}-01`
          : `${end.slice(0, 4)}-01-01`,
    end,
  };
}
export function validRange(start: string, end: string) {
  const valid = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  return (
    valid(start) &&
    valid(end) &&
    start <= end &&
    Date.parse(end) - Date.parse(start) < 366 * 86400000
  );
}
export function total(days: Metric[]): Metric {
  return days.reduce((sum, day) => {
    for (const k of Object.keys(sum) as (keyof Metric)[]) sum[k] += day[k];
    return sum;
  }, emptyMetric());
}
export function growth(current: number, previous: number) {
  return previous === 0
    ? current === 0
      ? "Không thay đổi"
      : "Kỳ trước chưa phát sinh"
    : `${current >= previous ? "+" : ""}${(((current - previous) / previous) * 100).toFixed(1)}% so với kỳ trước`;
}
export function csv(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell);
            return `"${(/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
