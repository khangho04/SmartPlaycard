# SmartPlaycard

## 📲 Tải ứng dụng cho điện thoại Android

[![Tải APK Android](https://img.shields.io/badge/⬇_TẢI_APK_CHO_ĐIỆN_THOẠI_ANDROID-1.0.0-2ea44f?style=for-the-badge&logo=android&logoColor=white)](https://github.com/khangho04/SmartPlaycard/raw/refs/heads/main/apk/application-f0a646ce-bf94-47d0-a39c-71b756bdb256.apk)

**[👉 Nhấn vào đây để tải SmartPlaycard.apk](https://github.com/khangho04/SmartPlaycard/raw/refs/heads/main/apk/application-f0a646ce-bf94-47d0-a39c-71b756bdb256.apk)**

**Bản 1.0.0 · Khoảng 104 MB · Dành cho Android · Không cần Expo Go**

1. Mở trang này trên điện thoại Android và nhấn nút **TẢI APK** phía trên.
2. Mở file `.apk` vừa tải về. Nếu Android yêu cầu, cho phép trình duyệt hoặc trình quản lý file **cài đặt ứng dụng từ nguồn này**.
3. Nhấn **Cài đặt**, sau đó mở **SmartPlaycard**. Cần kết nối Internet để đăng nhập và đồng bộ dữ liệu.

> File cài đặt nằm trong thư mục **[apk/](apk/)**. APK này không cài được trên iPhone/iOS.

---

## Dành cho người phát triển

Ứng dụng Expo SDK 58 quản lý thẻ RFID và máy trò chơi. App hiện dùng **Realtime Database trực tiếp cho bản demo/nội bộ**, gồm đăng nhập và mọi tác vụ Admin/User; không dùng Firebase Authentication, Cloud Functions hoặc Admin credentials.

Yêu cầu Node.js 22.13+ (nhánh 22) hoặc 24.3+ (nhánh 24), và Expo Go hỗ trợ SDK 58 trên điện thoại. Sau khi nâng SDK, khởi động lại bằng `npx expo start --clear` rồi quét mã QR mới.

```powershell
npm ci
npm start
npm run typecheck
npm run lint
npm test
```

Đăng nhập **admin / 123456**, đổi mật khẩu lần đầu rồi đăng nhập lại. Tài khoản tự đăng ký là User. Publish file `admin-backend/database.rules.json` trong tab Rules của Firebase để dùng quyền đọc/ghi mở và các index. Dữ liệu công khai, chỉ dùng demo. Khởi tạo trực tiếp qua REST nếu cần: `node scripts/demo-bootstrap.cjs`. Hướng dẫn hiện tại: [Realtime Database demo](docs/ADMIN.md).

- [Hướng dẫn cấu hình và triển khai đồng bộ](docs/TRIEN_KHAI_DONG_BO.md)
- [Báo cáo kiến trúc cập nhật](docs/BAO_CAO_KIEN_TRUC_APP_DI_DONG.md)
- [Quản trị](docs/ADMIN.md)
- [Firebase và giao thức phần cứng](docs/FIREBASE.md)

Relay mặc định GPIO 26, HIGH, 100 ms; chưa có chân phản hồi máy. Nạp tiền thực hiện tại quầy, xác nhận từ Admin hoặc thiết bị cashier. Không có thanh toán ngân hàng trong ứng dụng.
