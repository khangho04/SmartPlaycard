export function errorText(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const message = error instanceof Error ? error.message : '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code)) return 'Tên tài khoản hoặc mật khẩu không đúng.';
  if (code === 'auth/email-already-in-use') return 'Tên tài khoản đã được sử dụng. Hãy chọn tên khác hoặc đăng nhập.';
  if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') return 'Mật khẩu chưa đáp ứng chính sách bảo mật. Hãy chọn mật khẩu mạnh hơn.';
  if (code === 'auth/too-many-requests') return 'Có quá nhiều yêu cầu. Vui lòng thử lại sau.';
  if (code === 'PERMISSION_DENIED' || code === 'permission-denied') return 'Realtime Database đang chặn đọc/ghi. Dán nội dung admin-backend/database.rules.json vào tab Rules rồi Publish để dùng bản demo.';
  if (code === 'auth/network-request-failed') return 'Không kết nối được Realtime Database. Kiểm tra kết nối mạng.';
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') return `Dịch vụ chưa phản hồi. Kiểm tra mạng và trạng thái backend. (${code})`;
  if (code === 'functions/internal') return 'Không gọi được backend. Kiểm tra triển khai Cloud Functions, khu vực và nhật ký máy chủ. (functions/internal)';
  // A backend not-found can mean a missing card/game/account, not a network error.
  if (code === 'functions/not-found' && (!message || /^not[ -]?found$/i.test(message))) return 'Không tìm thấy dịch vụ backend. Kiểm tra triển khai Cloud Functions tại asia-southeast1. (functions/not-found)';
  return message || 'Không thể hoàn tất thao tác.';
}

export function sessionErrorText(error: unknown): string {
  return `App đã nhận phiên đăng nhập nhưng chưa xác nhận được quyền User/Admin qua platformSession. ${errorText(error)} Bạn có thể thử kết nối lại; nếu vừa tạo tài khoản, không cần đăng ký lại.`;
}
