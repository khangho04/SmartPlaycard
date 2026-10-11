# Firebase và giao thức SmartPlaycard v3

## Nguyên tắc

App User/Admin dùng Firebase Authentication và Callable Functions. ESP32 dùng một tài khoản Firebase riêng cho từng thiết bị. Số dư chỉ được thay đổi ở backend; User, Admin SDK client và ESP32 không có quyền ghi trực tiếp `cards`/`transactions`.

`admin-backend/database.rules.json` là bộ Rules đầy đủ, mặc định đóng. `database.rules.fragment.json` cũ không còn là cấu hình triển khai; fragment đó chỉ được giữ để tham khảo. Firebase CLI dùng `firebase.admin.json` để triển khai bộ Rules đầy đủ.

## Dữ liệu

```text
cards/{rfidUid}                       balance, active, ownerAuthUid, branchId, _operations
cardHistory/{rfidUid}/{time-id}       projection từ biên nhận đã xác nhận
catalog/games/{gameId}                mô tả, máy, chi nhánh, giá, thời lượng, enabled, version
catalog/deviceConfig/{deviceId}       cấu hình do Admin công bố
userData/{authUid}/profile            họ tên, điện thoại
userData/{authUid}/notifications/{id}  thông báo, createdAt, read
support/{ticketId}                    người gửi, chi nhánh, vấn đề, phản hồi, trạng thái
deviceAccess/{authUid}                deviceId, branchId, enabled, canTopUp
deviceProvision/{deviceId}            authUid, branchId, enabled, canTopUp
deviceRequests/{deviceId}/{id}        yêu cầu bất biến PLAY/TOPUP/CREATE
deviceResults/{deviceId}/{id}         biên nhận/trạng thái do backend trả về
deviceEvents/{deviceId}/{id}          nhận thẻ, xung relay, phản hồi hoặc lỗi
devices/{deviceId}                    heartbeat, configVersion, playing, trạng thái
cashReceipts/{stableId}               giữ danh tính biên nhận quầy để chống nạp trùng
admin/operations                     quyền, chi nhánh, metadata, cảnh báo, bảo trì, audit
admin/ledger                         ledger xác nhận từ backend
admin/reportDays                     tổng hợp ngày UTC+7
```

Heartbeat/transaction timestamp dùng Unix seconds; ledger/notifications dùng Unix milliseconds. Giá và số dư là số nguyên VND. Game không sẵn sàng khi chưa có ack đúng cấu hình, heartbeat cũ hoặc lỗi.

## Nghiệp vụ phần cứng

1. ESP32 lưu yêu cầu cùng ID vào NVS rồi tạo `deviceRequests`.
2. `processDeviceRequest` kiểm tra thiết bị còn quyền, chi nhánh, loại thao tác và cấu hình.
3. Backend cập nhật tiền và `_operations/{id}` cùng transaction. Receipt trùng trả lại kết quả đã lưu; thẻ bị khóa/thiếu tiền nhận REJECTED.
4. Backend xuất transaction/ledger khi phù hợp, rồi ghi `deviceResults`.
5. ESP32 đọc result thành công mới phát xung relay. Retry result/history không phát thêm xung.
6. Sự kiện nhận diện/lượt chơi được backend chuyển thành thông báo đúng User. Không phát thông báo bắt đầu thật khi chỉ có xung mà chưa có phản hồi máy.

Thẻ CREATE chỉ được tạo bởi thiết bị đã cấp quyền cashier. UID của thẻ không phải Firebase Auth UID. Quyền sở hữu chỉ do Admin gán; User không tự claim thẻ bằng UID.

## Giới hạn vận hành

- Nạp thật hiện qua nhân viên thu ngân/Admin; chưa có cổng thanh toán trực tuyến.
- Mất điện quanh xung relay được coi là không rõ kết quả; không tự phát lại xung hoặc hoàn tiền. Nhân viên cần đối soát.
- Dữ liệu/lịch sử mô phỏng trước đây không được tự chuyển thành doanh thu. Không tự reset số dư cũ.
- Hộp thư thông báo được cập nhật bằng polling; chưa có push khi app đóng.
- Lịch sử User tải 100 giao dịch gần nhất từ projection mới; giao dịch cũ trước khi triển khai trigger chưa tự backfill.
- Cần chính sách lưu trữ/phân trang khi request, receipt, sự kiện và thông báo tăng. Không xóa receipt chống trùng tùy tiện.

Hướng dẫn cấu hình và triển khai: [Triển khai đồng bộ](TRIEN_KHAI_DONG_BO.md).
