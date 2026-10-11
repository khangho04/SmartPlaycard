import { directCall } from '../firebase/direct-admin';
import type { AdminReport, AdminSnapshot, LedgerEntry } from "./model";

export async function adminCall<T>(
  name: string,
  data: unknown = {},
): Promise<T> {
  return directCall<T>(name, data);
}
export const loadAdmin = () => adminCall<AdminSnapshot>("adminSnapshot");
export const loadReport = (
  start: string,
  end: string,
  branchId: string,
  deviceId: string,
) => adminCall<AdminReport>("adminReport", { start, end, branchId, deviceId });
export const loadLedger = (cursor?: string) =>
  adminCall<{ rows: LedgerEntry[]; next: string | null }>("adminLedger", {
    cursor,
  });
export const saveAdmin = (action: string, id: string, value: unknown, revoke = false) =>
  adminCall("adminMutate", { action, id, value, revoke });
export function adminError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (/unauthenticated|auth\//.test(code))
    return "Không thể đăng nhập. Kiểm tra tên tài khoản và mật khẩu trong Realtime Database.";
  if (/permission-denied/.test(code))
    return "Tài khoản chưa được cấp quyền quản trị hoặc không có quyền thực hiện thao tác này.";
  if (/not-found|unavailable|internal/.test(code))
    return "Chưa kết nối được Realtime Database. Kiểm tra mạng và địa chỉ database.";
  return error instanceof Error
    ? error.message
    : "Không thể tải dữ liệu quản trị.";
}
