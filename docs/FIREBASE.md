# SmartPlaycard — Firebase

## Luồng dữ liệu

- `card-service.ts`: `getCard(uid)`, `subscribeCard(uid, callback, onError)`.
- `transaction-service.ts`: `getCardTransactions(uid)`, `subscribeCardTransactions(uid, callback, onError)`.
- `device-service.ts`: `getDevice()`, `subscribeDevice('GAME001', callback, onError)`.
- `rfid-service.ts`: bridge cho context và luồng nạp mô phỏng từ app; PLAY do firmware xử lý.
- `topup-service.ts`: cộng tiền bằng transaction, lưu biên nhận cùng số dư và đồng bộ lịch sử theo cùng mã giao dịch.
- `wallet-context.tsx`: quản lý listener, trạng thái tải/lỗi và UID đã chọn. Đổi UID, bỏ chọn thẻ hoặc đăng xuất sẽ hủy listener cũ.
- AsyncStorage lưu `smartplaycard.selected-card-uid.v1` và yêu cầu nạp chưa hoàn tất `smartplaycard.pending-topup.v1`. Số dư luôn đọc từ Firebase.

Mẫu Firebase đã xác minh có timestamp transaction theo **giây**, field `time` dạng chuỗi, và các field `...Epoch` trên card/device. `TIME_NOT_SYNCED`/epoch `0` không xác nhận thiết bị đang online. Trạng thái trên Home là giá trị đã lưu trong database.

Query lịch sử dùng `orderByChild('uid')` và `equalTo(uid)`. Chưa sửa Rules/index. Nếu database chưa có index `uid`, Firebase JS SDK có thể tải/lọc nhiều dữ liệu hơn và cảnh báo trong console. Cần xem xét index trước khi dữ liệu lớn; không giới hạn tùy ý lịch sử khiến thiếu giao dịch.

## Kiểm tra trên Expo Go

1. Chạy `npx expo start`, mở app và đăng nhập bằng tài khoản demo hiện có.
2. Vào **Thẻ RFID**, nhập UID chính xác đang tồn tại trong `/cards`. Bản ghi mẫu đã đọc là `2605895D`; chỉ chọn nếu đó là thẻ bạn muốn theo dõi.
3. Nhấn **Theo dõi thẻ này**. Kiểm tra số dư khớp Firebase, bao gồm trường hợp số dư bằng 0. Ô UID chỉ chọn thẻ local, không ghi quan hệ sở hữu hoặc liên kết tài khoản lên Firebase.
4. Thực hiện PLAY trên ESP32: số dư và History phải tự cập nhật từ Firebase; app không trừ tiền lần nữa.
5. Nếu firmware đã có TOPUP, thực hiện qua cơ chế hiện có của thiết bị và kiểm tra app nhận số dư/giao dịch mới.
6. Đổi sang UID khác: không được hiển thị giao dịch/số dư của thẻ cũ. UID không tồn tại hoặc không hợp lệ phải báo lỗi.
7. Tắt mạng: app hiển thị trạng thái mất kết nối sau khi Firebase phát hiện; không thay số dư bằng 0. Bật lại mạng để listener đồng bộ tiếp.
8. Đóng/mở app: UID được nhớ, số dư/lịch sử được đọc lại từ Firebase. **Cá nhân → Bỏ chọn thẻ** chỉ xóa lựa chọn local.
9. Home hiển thị GAME001; chạm thẻ game để xem mode, thời lượng và heartbeat đã lưu.

Nếu thấy `PERMISSION_DENIED`, dừng kiểm tra và gửi log. App không sửa Rules, không tự thêm Authentication và không tự thử một đường dẫn khác để vượt quyền.

## Nạp tiền mô phỏng

1. Nạp mô phỏng chỉ cần thẻ hợp lệ và kết nối Firebase có quyền ghi; không phụ thuộc GAME001 hoặc `balanceProtocolVersion`. Nếu chạy ESP32 đồng thời, dùng firmware trong `firmware/SMARTTAP` có giao thức cập nhật nguyên tử để tránh firmware cũ ghi đè số dư.
2. Chọn thẻ RFID đang tồn tại, còn hoạt động; mở **Nạp tiền**.
3. Chọn mệnh giá hoặc nhập số nguyên bất kỳ từ 0đ đến 5.000.000đ. Kiểm tra UID, số tiền và số dư dự kiến, rồi nhấn **OK — Nạp** để cộng vào thẻ đã chọn. Nạp 0đ vẫn ghi giao dịch, số dư không đổi.
4. App cộng số dư và bộ đếm trong cùng transaction với biên nhận tại `cards/{uid}/_operations/{id}`, sau đó xuất lịch sử tại `transactions/{id}`. Giao dịch mới có `paymentMethod: simulation`; không kết nối ngân hàng hay thu tiền thật.
5. Thành công hiển thị mã giao dịch, thẻ nhận, số tiền và số dư sau giao dịch. Số dư ví và lịch sử cập nhật qua listener Firebase.
6. Nếu bị gián đoạn, mở lại app và dùng **Kiểm tra / thử lại lần nạp**. Giữ nguyên ID để không cộng lần thứ hai. Biên nhận đã ghi có thể đồng bộ lại lịch sử dù thiết bị không còn sẵn sàng hoặc thẻ đã khóa.

Kiểm tra thủ công: nạp 50.000đ, nhấn nhanh nhiều lần, nhập số ngoài giới hạn, tắt/bật mạng, đổi thẻ và mở lại app khi có giao dịch chờ. Không xóa dữ liệu ứng dụng khi còn giao dịch chờ vì ID phục hồi được lưu tại máy.

## Phần chưa tích hợp

- Không còn giả lập quét RFID/NFC. Màn hình Quét hướng dẫn nhập UID thủ công vì chưa có giao thức nhận sự kiện quét từ ESP32.
- Tài khoản/hồ sơ demo vẫn giữ nguyên; điểm thưởng chưa có nguồn Firebase nên hiển thị chưa có dữ liệu.

## Kiểm tra code

```sh
npx tsc --noEmit
node --test scripts/firebase-services.test.cjs
npx expo export --platform android --output-dir .expo/firebase-check
```

Test service dùng Firebase giả lập, không ghi dữ liệu thật. Bundle Android và test tự động không thay thế kiểm tra ESP32 + Expo Go trên thiết bị.
