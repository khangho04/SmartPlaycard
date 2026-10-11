# Triển khai đồng bộ SmartPlaycard: Admin, User và ESP32

Cập nhật mã nguồn: 09/10/2026. Ứng dụng dùng Firebase Authentication và dữ liệu thật; không còn tài khoản `admin/user / 123456`, adapter demo hoặc nạp mô phỏng. Không có dữ liệu mẫu được tự tạo khi khởi động.

## Luồng sử dụng

- **Admin:** đăng nhập tên tài khoản được cấp quyền. Tạo chi nhánh, xem ESP32 đã đăng ký, vào **Game · Thẻ · Hỗ trợ** để công bố game, gán thẻ cho tên tài khoản User và trả lời hỗ trợ. Badge của mục này báo số yêu cầu mới trong phạm vi được phép.
- **User:** chọn **Tạo tài khoản** ngay trên màn hình đăng nhập, tự đặt tên và mật khẩu; chỉ chọn được thẻ do nhân viên liên kết. Xem chi nhánh quản lý thẻ, game được Admin công bố, lịch sử, hồ sơ, thông báo và hỗ trợ.
- **ESP32:** dùng tài khoản riêng, đọc cấu hình game, xác nhận phiên bản cấu hình và gửi yêu cầu nghiệp vụ. Cloud Function cập nhật tiền; ESP32 chỉ phát xung relay sau khi nhận biên nhận thành công.
- **Nạp tiền thật:** tại quầy. Super Admin/Kế toán xác nhận đã thu tiền và nhập số biên nhận trong Admin; thiết bị được cấp `cashier` cũng có thể ghi nhận tiền nhân viên đã thu. User không có quyền tự cộng tiền. Chưa tích hợp ngân hàng/payment webhook.

Danh sách User làm mới tuần tự mỗi 10 giây khi màn hình hoạt động. Admin vận hành làm mới mỗi 30 giây, phần Game/Thẻ/Hỗ trợ mỗi 10 giây khi mở. Thông báo là hộp thư trong app, chưa phải push khi ứng dụng đóng.

## 1. Firebase thật

Project trong app: `rfid-001-270d9`, RTDB tại `asia-southeast1`. Backend cần billing phù hợp cho Cloud Functions và Scheduler.

1. Firebase Console → Authentication → bật Email/Password (phương thức kỹ thuật ở backend, không yêu cầu Gmail). Trong app, chọn **Tạo tài khoản**, nhập tên gồm 3–32 ký tự chữ không dấu/số/dấu `_`, bắt đầu bằng chữ hoặc số; mật khẩu ít nhất 8 ký tự và đáp ứng chính sách Firebase. Tên không phân biệt hoa/thường. Tài khoản mới luôn có quyền User; tạo tài khoản sẽ tự đăng nhập, kể cả khi backend phân quyền đang lỗi, tài khoản Auth vẫn đã được tạo nên không đăng ký lại. Tạo một tài khoản cho người quản trị theo cách này, sau đó bootstrap quyền ở bước 4. Tài khoản ESP32 vẫn tạo riêng trong Firebase Console.

   App ánh xạ tên thành định danh nội bộ `ten_tai_khoan@accounts.smartplaycard.invalid` cho Firebase Auth; đây không phải hộp thư hoặc dữ liệu demo. Người dùng không cần sở hữu Gmail và không nhập email này. Mật khẩu được quản lý bởi Firebase Auth, không ghi vào RTDB hoặc file danh sách mật khẩu. Tài khoản email cũ vẫn đăng nhập được. Đổi mật khẩu trong **Cá nhân → Đổi mật khẩu**, xác nhận mật khẩu hiện tại; quên mật khẩu thì liên hệ nhân viên để xác minh và đặt lại từ Firebase Console, không gửi reset tới địa chỉ nội bộ.
2. Cài backend: `npm ci --prefix admin-backend`.
3. Thiết lập Application Default Credentials trên máy tin cậy cho script bootstrap/provision. Có thể dùng `gcloud auth application-default login` hoặc biến `GOOGLE_APPLICATION_CREDENTIALS` trỏ tới khóa service account được giữ ngoài repo. Không đưa khóa/mật khẩu vào app hoặc chat.
4. Cấp quyền Admin đầu tiên:

   ```powershell
   node admin-backend/bootstrap.cjs TEN_TAI_KHOAN_ADMIN https://rfid-001-270d9-default-rtdb.asia-southeast1.firebasedatabase.app
   ```

5. Kiểm thử Rules bằng Emulator trước khi áp dụng (mục 5). `admin-backend/database.rules.json` là **bộ Rules đầy đủ**, mặc định đóng. Nó thay thế quyền công khai của firmware cũ; SDK User/Admin chỉ gọi backend, không đọc trực tiếp kho riêng.
6. Đăng nhập Firebase CLI và triển khai:

   ```powershell
   firebase login
   firebase deploy --config firebase.admin.json --only functions:smartplaycard-admin,database --project rfid-001-270d9
   ```

   Nếu dùng bộ công cụ kiểm tra đã tải tại dự án, thay `firebase` bằng `node .expo/validation-tools/node_modules/firebase-tools/lib/bin/firebase.js`.

7. Đăng nhập Admin thật và tạo chi nhánh. Không tự tạo game/máy giả. Nếu có firmware cũ đang hoạt động, bố trí thời gian chuyển đổi; firmware `NoAuth` cũ không hoạt động sau khi đóng Rules.

Không xóa hoặc đặt lại số dư cũ bằng script này. Trước khi vận hành, nhân viên cần đối soát các số dư/giao dịch đã từng được nạp mô phỏng; phiên bản mới không tự biến giao dịch mô phỏng thành doanh thu.

## Nếu app báo không kết nối được dịch vụ khi đăng nhập

Ngày 09/10/2026, kiểm tra HTTP tại `https://asia-southeast1-rfid-001-270d9.cloudfunctions.net/platformSession` trả về 404. Địa chỉ này hiện chưa phục vụ endpoint xác nhận quyền mà app gọi. Kiểm tra/deploy Cloud Functions vào đúng project và region; không sửa bằng cách tự cấp quyền Admin hoặc đưa lại dữ liệu demo.

Tại terminal trong thư mục dự án, đăng nhập tài khoản Google quản lý project Firebase (đây là tài khoản triển khai, không phải Gmail của khách hàng):

```powershell
node .expo/validation-tools/node_modules/firebase-tools/lib/bin/firebase.js login
node .expo/validation-tools/node_modules/firebase-tools/lib/bin/firebase.js deploy --config firebase.admin.json --only functions:smartplaycard-admin --project rfid-001-270d9
```

Lệnh này triển khai Functions; Rules vẫn cần được kiểm thử/triển khai theo mục 1. Nếu bị chặn vì quyền hoặc billing, khắc phục trên project Firebase rồi chạy lại. Sau khi deploy thành công, nhấn **Thử kết nối lại** trong app. Nếu tài khoản đã được tạo trong Authentication, dùng tên/mật khẩu đó, không đăng ký lại. Máy tại thời điểm kiểm tra chưa có phiên Firebase CLI để tự deploy.

## 2. Cấp quyền ESP32

Tạo tài khoản thiết bị trong Firebase Authentication rồi cấp quyền từ máy tin cậy:

```powershell
node admin-backend/provision-device.cjs DEVICE_EMAIL GAME001 BRANCH_ID https://rfid-001-270d9-default-rtdb.asia-southeast1.firebasedatabase.app game
```

Đổi `game` thành `cashier` chỉ cho thiết bị thu ngân do nhân viên vận hành. Quyền nằm tại `deviceAccess/{authUid}` và `deviceProvision/{deviceId}`. Để thu hồi, đặt `enabled=false` ở cả hai node bằng Admin SDK tin cậy.

Chi nhánh trong cấu hình game phải khớp chi nhánh đã cấp quyền cho ESP32. Việc đổi metadata chi nhánh ở trang Thiết bị không tự thay đổi quyền phần cứng; khi chuyển máy sang chi nhánh khác cần cập nhật provisioning tương ứng.

## 3. Firmware và relay

Copy `firmware/SMARTTAP/SmartTapConfig.example.h` thành `SmartTapConfig.h`, điền Wi-Fi, API key Firebase, email/mật khẩu của **thiết bị**, device ID và chứng chỉ CA PEM cho HTTPS Firebase. File cục bộ này được gitignore. Firmware dùng `UserAuth`, kiểm tra TLS bằng `setCACert`, không dùng `NoAuth`/`setInsecure`.

Cấu hình mặc định cho board ESP32 thường đang dùng trong dự án:

| Tham số | Giá trị |
| --- | --- |
| Relay | GPIO 26, chưa trùng các chân màn hình, RC522 và nút |
| Mức kích | HIGH, đổi thành LOW nếu module relay của bạn kích mức thấp |
| Độ dài xung | 100 ms, điều chỉnh theo đầu vào máy game |
| Phản hồi máy chạy/lỗi | `-1`: chưa lắp tín hiệu phản hồi |
| Timeout chờ phản hồi bắt đầu | 5000 ms, chỉ dùng khi đã cấu hình chân phản hồi |

Đấu GPIO 26 tới đầu vào điều khiển của module relay; tiếp điểm relay nối đầu vào credit/start của máy theo thiết kế phần cứng thực tế. Các chân phản hồi chỉ nhận tín hiệu phù hợp mức điện áp GPIO và cách ly phù hợp với máy.

Khi chưa có cảm biến phản hồi, app báo **đã gửi xung kích hoạt** và **hết thời lượng dự kiến**. Không báo máy đã bắt đầu/kết thúc thật chỉ từ xung relay. Khi bổ sung `SMARTTAP_RUNNING_PIN` và `SMARTTAP_ERROR_PIN`, firmware phát sự kiện xác nhận bắt đầu/kết thúc hoặc lỗi/timeout.

Firmware lưu request đang chờ và hàng đợi sự kiện trong NVS. Yêu cầu trùng không cộng/trừ tiền lần nữa. ID đã xử lý được ghi trước khi phát xung: nếu mất điện sát thời điểm kích relay, firmware báo cần kiểm tra thay vì phát lại xung tự động. Nhân viên đối soát lượt chơi bị gián đoạn; chưa có tự động hoàn tiền.

**Chuyển từ firmware v2:** kiểm tra và giải quyết hết yêu cầu NVS `pending` của giao thức CAS cũ trước khi nạp v3. Firmware mới không tự coi một giao dịch cũ chưa rõ kết quả là yêu cầu mới để trừ tiền lại.

Biên dịch bằng Arduino CLI/IDE với board `esp32:esp32:esp32` và các thư viện đã dùng: ESP32 core 3.3.1, FirebaseClient 2.2.13, ArduinoJson 7.4.2, MFRC522 và Adafruit GFX/ST7789. Cấu hình rỗng chỉ dùng ở thư mục build kiểm tra, không phải cấu hình chạy thật và không sinh dữ liệu demo.

## 4. Tạo game, gán thẻ và hỗ trợ

1. Nạp firmware đã cấu hình, chờ ESP32 đăng ký node `devices/{id}` và heartbeat.
2. Trong Admin → **Game · Thẻ · Hỗ trợ**, chọn máy và chi nhánh; nhập mã/tên/mô tả/giá/thời lượng rồi lưu.
3. Game hiển thị cho User nếu được bật; chỉ được đánh dấu sẵn sàng khi máy xác nhận đúng version, giá, thời lượng và heartbeat còn mới. Backend từ chối yêu cầu PLAY dùng config cũ hoặc đã tắt.
4. Tạo thẻ tại ESP32 được cấp quyền `cashier`; backend tạo số dư 0 cho thẻ RFID thật. Admin gán UID, tên tài khoản User và chi nhánh. User không tự nhận quyền sở hữu chỉ bằng cách biết UID.
5. Nạp tiền tại quầy. Trong Admin, dùng số biên nhận duy nhất trong chi nhánh: retry hoặc đổi máy đăng nhập với cùng số biên nhận không cộng tiền hai lần. Giữ nguyên số biên nhận khi kết quả giao dịch chưa rõ.
6. User mở Trung tâm hỗ trợ, gọi **0794088678 / 0708348573** hoặc gửi form. Admin đúng chi nhánh thấy yêu cầu mới và trả lời; User nhận thông báo và xem phản hồi. Yêu cầu chưa xác định chi nhánh chỉ chuyển tới Admin toàn hệ thống.
7. Hồ sơ User lưu họ tên và điện thoại theo tài khoản. Tên tài khoản/ngày tham gia lấy từ Firebase Auth. Đổi mật khẩu cần xác nhận mật khẩu hiện tại, không cần Gmail. Điều khoản là văn bản đọc được trong app.

## 5. Kiểm tra

```powershell
npm run typecheck
npm run lint
npm test
npx expo export --platform web --output-dir .expo/platform-web-check
npx expo export --platform android --output-dir .expo/platform-android-check
```

Kiểm tra Security Rules riêng, không kết nối database production:

```powershell
npm install --prefix .expo/validation-tools --no-package-lock firebase-tools @firebase/rules-unit-testing
# Cần Java 21+ trong PATH
npm run test:rules
```

Project Emulator là `demo-smartplaycard`; dữ liệu trong test chỉ là fixture kiểm thử, không được dùng trong app hay tạo trên Firebase thật. Test bao gồm chặn SDK User/Admin đọc kho riêng, chặn ghi trực tiếp tiền, phạm vi thiết bị/chi nhánh, quyền cashier và sự kiện bất biến.

Sau khi triển khai, kiểm tra trên phần cứng thật:

- Admin tạo game → ESP32 nhận version → User thấy giá/thời lượng đúng.
- Hai User không đọc thẻ, thông báo hoặc yêu cầu của nhau.
- Nạp quầy → số dư/lịch sử/thông báo/doanh thu cập nhật; retry cùng số biên nhận không cộng lại.
- Quẹt RFID → nhận diện → backend trừ tiền một lần → relay GPIO 26 phát đúng một xung.
- Tắt game từ Admin, mất mạng, khóa thẻ, thu hồi tài khoản thiết bị: không phát xung khi chưa có biên nhận thành công.
- Mất điện trước/sau phát xung: không phát lại tự động; thông báo cần hỗ trợ.
- Nếu có phản hồi phần cứng, thử bắt đầu, kết thúc, lỗi và timeout; nếu không có, xác nhận nội dung chỉ báo đã gửi xung.
- User gửi hỗ trợ → badge Admin → Admin trả lời → User nhận thông báo.

## Kết quả tại workspace

TypeScript, ESLint và 36 test đã đạt ở mã nguồn cuối, bao gồm ánh xạ tên tài khoản đồng nhất và liên kết thẻ theo tên tài khoản. Bundle web/Android đã xuất thành công trước các chỉnh sửa giao diện và đăng ký tài khoản mới; yêu cầu xuất lại web trước đó bị từ chối nên chưa xác nhận bundle cho các chỉnh sửa này. Firmware cuối biên dịch thành công với ESP32 core 3.3.1: flash 1.170.427 byte (89%), RAM tĩnh 50.828 byte (15%). Những kết quả này không xác nhận đăng ký/đăng nhập Firebase production, APK cài thực tế hoặc relay đã hoạt động.

Chưa có phiên Firebase CLI/ADC để triển khai lên project thật. Security Rules Emulator chưa chạy vì máy thiếu Java và yêu cầu tải Java đã bị từ chối. Bộ test Rules đã chuẩn bị để chạy khi có Java.
