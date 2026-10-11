# SmartPlaycard Admin — Realtime Database demo

Toàn bộ app dùng Firebase Realtime Database trực tiếp: đăng nhập, đăng ký, đổi mật khẩu, phân quyền, thiết bị, chi nhánh, bảo trì, game, liên kết thẻ, nạp tiền quầy, hỗ trợ và báo cáo. Không dùng Firebase Authentication, Cloud Functions hoặc Firebase Admin credentials.

## Sử dụng

1. Chạy `npm install`, rồi `npm start`. Nếu dùng bản native đã build trước khi thêm expo-crypto, build lại hoặc dùng Expo Go tương thích SDK 57.
2. Trong Firebase Console → Realtime Database → Rules, dán nội dung `admin-backend/database.rules.json` rồi Publish. Rules hiện cho phép đọc/ghi công khai theo yêu cầu dùng demo; các index vẫn giữ để tìm tài khoản và giao dịch.
3. Đăng nhập `admin` / `123456`. App tạo `accounts/admin` nếu chưa có, hoặc bổ sung credential cho bản ghi admin cũ chưa có mật khẩu RTDB; không ghi đè mật khẩu đã đổi. Nếu cần khởi tạo từ terminal, chạy `node scripts/demo-bootstrap.cjs`.
4. Đặt mật khẩu mới ít nhất 6 ký tự bất kỳ, nhập lại để xác nhận. App lưu hash mới trong RTDB rồi đăng xuất; đăng nhập lại bằng mật khẩu mới.

`admin` có quyền `super_admin`, tất cả chi nhánh. App không cho hạ/thu hồi quyền admin mặc định hoặc sửa quyền chính mình. Những kiểm tra này chỉ chạy trong app: database công khai không xác minh danh tính và không bảo vệ vai trò trước truy cập ngoài app. Chỉ dùng dữ liệu demo.

## Cấu trúc JSON

`accounts/<id>` có `username`, `createdAt`, `access` (`admin`/`user`), `card`, `credential` (PBKDF2-SHA256, salt, hash, 100.000 vòng, version), `adminRole`, `branchId`, `isDefaultAdmin`, `requiresPasswordChange`. Không lưu mật khẩu rõ. Phiên demo trên thiết bị lưu ID, version và thời hạn 12 giờ; không lưu mật khẩu. Đổi mật khẩu đổi version và vô hiệu phiên cũ khi app đọc lại dữ liệu.

Tài khoản mới dùng tên chuẩn hóa làm khóa. Tài khoản cũ giữ nguyên UID và liên kết thẻ. Mật khẩu cũ trong Firebase Authentication không thể đọc từ RTDB: tài khoản cũ cần bổ sung `credential` để đăng nhập demo. Tài khoản admin mặc định được khởi tạo tự động.

File `docs/admin-account.json` là JSON để import vào **/accounts/admin**, không import ở gốc database. Chỉ import khi chưa có tài khoản; import đè sẽ đặt lại mật khẩu và mất liên kết thẻ của bản ghi đó. Có thể tạo lại mẫu bằng `node scripts/demo-bootstrap.cjs --seed-only`.

## Phân quyền và tác vụ

- Trong **Phân quyền admin**, cấp/sửa/thu hồi vai trò cho tên đã đăng ký. Vai trò: Super Admin, Vận hành, Kế toán, Kỹ thuật viên, Chỉ xem. Cập nhật accounts và admin/operations/access cùng nhật ký bằng multi-location update.
- Quản lý chi nhánh, thiết bị, cảnh báo, bảo trì và cấu hình trong `admin/operations`.
- Game trong `catalog/games`; cấu hình máy trong `catalog/deviceConfig`.
- Liên kết thẻ cập nhật `cards/<UID>/ownerAuthUid` và `accounts/<id>/card` trong cùng transaction; giữ nguyên số dư.
- Nạp tiền quầy dùng số biên nhận duy nhất theo chi nhánh; lưu receipt trong thẻ cùng số dư bằng transaction. Retry cùng biên nhận không cộng tiền hai lần; lịch sử ở `transactions` có thể hoàn tất bằng retry nếu mất mạng.
- Hỗ trợ ở `support`; phản hồi tạo thông báo ở `userData/<id>/notifications`.
- Báo cáo và danh sách giao dịch đọc trực tiếp `transactions`; TOPUP tính tiền nạp, REFUND tính hoàn tiền, PLAY tính lượt chơi. Không cần ledger/reportDays được Functions tổng hợp. Timestamp 0 chưa đồng bộ không tính vào báo cáo ngày. Giao dịch cũ thiếu branchId dùng chi nhánh thiết bị/thẻ hiện tại nên không bảo toàn lịch sử chuyển chi nhánh; bản ghi mới có branchId.
- `cards` và `transactions` giữ đường dẫn tương thích dữ liệu phần cứng cũ.

Backend cũ trong admin-backend vẫn còn để tham khảo; app không gọi và firebase.admin.json không cấu hình deploy Functions.
