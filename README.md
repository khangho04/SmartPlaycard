# SmartPlaycard

Ứng dụng quản lý thẻ RFID, số dư và máy trò chơi, kết nối với Firebase Realtime Database và thiết bị ESP32. Gồm giao diện khách hàng và trang quản trị theo vai trò, chi nhánh.

## 📲 Tải ứng dụng cho điện thoại Android

[![Tải APK Android](https://img.shields.io/badge/⬇_TẢI_APK_CHO_ĐIỆN_THOẠI_ANDROID-1.0.0-2ea44f?style=for-the-badge&logo=android&logoColor=white)](https://github.com/khangho04/SmartPlaycard/raw/refs/heads/main/apk/application-f0a646ce-bf94-47d0-a39c-71b756bdb256.apk)

**[👉 Nhấn vào đây để tải SmartPlaycard.apk](https://github.com/khangho04/SmartPlaycard/raw/refs/heads/main/apk/application-f0a646ce-bf94-47d0-a39c-71b756bdb256.apk)**

**Bản 1.0.0 · Khoảng 104 MB · Dành cho Android · Không cần Expo Go**

1. Mở trang này trên điện thoại Android và nhấn nút **TẢI APK** phía trên.
2. Mở file `.apk` vừa tải về. Nếu Android yêu cầu, cho phép trình duyệt hoặc trình quản lý file **cài đặt ứng dụng từ nguồn này**.
3. Nhấn **Cài đặt**, sau đó mở **SmartPlaycard**. Cần kết nối Internet để đăng nhập và đồng bộ dữ liệu.

> File cài đặt nằm trong thư mục **[apk/](apk/)**. APK này không cài được trên iPhone/iOS.

---

## 🔐 Đăng nhập và sử dụng

Đăng nhập quyền **admin / Abcd@1234**.

- **Admin:** đăng nhập bằng tài khoản trên để mở trang quản trị.
- **Khách hàng:** chọn **Tạo tài khoản** trên màn hình đăng nhập. Tài khoản tự đăng ký có quyền User.
- Cần kết nối Internet để đăng nhập, đọc số dư và đồng bộ trạng thái thiết bị.
- Thông tin đăng nhập trên dành cho bản demo hiện tại. Khởi tạo database mới và cơ chế đổi mật khẩu lần đầu được mô tả trong [hướng dẫn quản trị](docs/ADMIN.md).

## ✨ Chức năng

| Đối tượng | Chức năng |
| --- | --- |
| Khách hàng | Xem thẻ RFID, số dư, lịch sử giao dịch, danh sách game, hồ sơ, thông báo và gửi yêu cầu hỗ trợ. |
| Quản trị | Quản lý thiết bị, chi nhánh, game, liên kết thẻ, nạp tiền tại quầy, xử lý hỗ trợ và phân quyền admin. |
| Vận hành | Theo dõi trạng thái máy, cảnh báo và lịch bảo trì; cập nhật thông báo khi máy vào hoặc thoát chế độ maintenance. |
| Báo cáo | Xem giao dịch, doanh thu và xuất CSV theo phạm vi quyền được cấp. |

## 🛠️ Chạy mã nguồn

### Yêu cầu

- Node.js **22.13+** thuộc nhánh 22 hoặc **24.3+** thuộc nhánh 24.
- npm và kết nối Internet.
- Nếu chạy trên điện thoại qua mã QR: **Expo Go tương thích SDK 58**. Điện thoại và máy tính dùng cùng mạng Wi-Fi.
- Nếu cài APK ở đầu trang: không cần Node.js, máy tính hoặc Expo Go.

### Cài đặt và khởi động

```powershell
git clone https://github.com/khangho04/SmartPlaycard.git
cd SmartPlaycard
npm ci
npx expo start --clear
```

Quét mã QR bằng Expo Go để mở app. Nhấn **Ctrl + C** trong terminal để dừng Expo.

Nếu cổng 8081 đang được dùng:

```powershell
npx expo start --clear --port 8082
```

Để mở giao diện web:

```powershell
npm run web
```

### Kiểm tra mã nguồn

```powershell
npm run typecheck
npm run lint
npm test
```

## 🔥 Firebase và phần cứng

App dùng **Realtime Database trực tiếp cho bản demo/nội bộ**, gồm đăng nhập và các tác vụ Admin/User; luồng hiện tại không dùng Firebase Authentication, Cloud Functions hoặc Firebase Admin credentials.

- Cấu hình kết nối app: [`src/services/firebase/firebase-config.ts`](src/services/firebase/firebase-config.ts).
- Rules demo: [`admin-backend/database.rules.json`](admin-backend/database.rules.json). Publish trong **Firebase Console → Realtime Database → Rules** khi thiết lập database demo.
- Rules hiện cho phép đọc/ghi công khai; chỉ dùng dữ liệu demo. Các vai trò trong app không thay thế kiểm soát truy cập tại database.
- Firmware ESP32: [`firmware/SMARTTAP/`](firmware/SMARTTAP/). Dùng `SmartTapConfig.example.h` làm mẫu cấu hình thiết bị; không đưa thông tin Wi-Fi và tài khoản thiết bị riêng lên GitHub.
- Relay mặc định GPIO 26, HIGH, 100 ms; chưa có chân phản hồi máy. Nạp tiền thực hiện tại quầy, xác nhận từ Admin hoặc thiết bị cashier. Không có thanh toán ngân hàng trong ứng dụng.

## 📁 Cấu trúc dự án

| Thư mục | Nội dung |
| --- | --- |
| [`apk/`](apk/) | File APK và hướng dẫn cài trên điện thoại Android. |
| [`src/app/`](src/app/) | Các màn hình và điều hướng Expo Router. |
| [`src/components/`](src/components/) | Giao diện dùng chung và trang quản trị. |
| [`src/services/`](src/services/) | Kết nối Firebase và xử lý nghiệp vụ. |
| [`firmware/SMARTTAP/`](firmware/SMARTTAP/) | Mã nguồn thiết bị ESP32/RFID. |
| [`admin-backend/`](admin-backend/) | Rules, script thiết lập và backend cũ để tham khảo. |
| [`scripts/`](scripts/) | Các kiểm thử và công cụ hỗ trợ. |
| [`docs/`](docs/) | Hướng dẫn cấu hình, vận hành và tài liệu kiến trúc. |

## 📚 Tài liệu

- [Hướng dẫn cấu hình và triển khai đồng bộ](docs/TRIEN_KHAI_DONG_BO.md)
- [Báo cáo kiến trúc cập nhật](docs/BAO_CAO_KIEN_TRUC_APP_DI_DONG.md)
- [Quản trị](docs/ADMIN.md)
- [Firebase và giao thức phần cứng](docs/FIREBASE.md)
