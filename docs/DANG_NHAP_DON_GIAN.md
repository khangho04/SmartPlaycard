# Đăng nhập trực tiếp Realtime Database

App demo không dùng Firebase Authentication. Đăng nhập tra `accounts` theo `username`, xác minh `credential` trong bản ghi RTDB và lưu phiên demo trên thiết bị.

Tài khoản mặc định: **admin / 123456**, quyền cao nhất, bắt buộc đổi mật khẩu lần đầu. Không đặt lại mật khẩu khi chạy lại app. Tài khoản mới có access `user`, không tự cấp admin.

Trong Firebase Console, Publish nội dung `admin-backend/database.rules.json` để cho phép đọc/ghi và bổ sung index username. Nếu database hiện đã cho phép đọc/ghi, có thể đăng nhập ngay; bổ sung index giúp truy vấn hiệu quả.

Dữ liệu tài khoản, card và lịch sử vẫn ở `accounts`, `cards`, `transactions`. UID cũ được giữ khi bổ sung mật khẩu RTDB. Mật khẩu lưu dạng PBKDF2-SHA256, không lưu rõ. Mật khẩu Firebase Authentication cũ không tự chuyển sang RTDB.

Xem cách khởi tạo, JSON và giới hạn demo tại [ADMIN.md](ADMIN.md).
