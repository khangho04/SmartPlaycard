import { UserPage, UserText } from '@/components/user-page';
const terms = [
  ['Phạm vi sử dụng', 'SmartPlaycard hỗ trợ quản lý thẻ, số dư, lịch sử và trò chơi tại các chi nhánh tham gia hệ thống. Khách hàng tuân thủ nội quy khu vui chơi và hướng dẫn của nhân viên.'],
  ['Tài khoản và thẻ', 'Cung cấp thông tin liên hệ chính xác, bảo quản thẻ và thông tin đăng nhập. Không sử dụng tài khoản/thẻ của người khác khi chưa được cho phép. Khi mất thẻ hoặc nghi ngờ sử dụng trái phép, liên hệ nhân viên để kiểm tra và hỗ trợ khóa thẻ.'],
  ['Nạp tiền và số dư', 'Kiểm tra mã thẻ, số tiền và biên nhận khi nạp tại quầy. Số dư chỉ cập nhật sau khi giao dịch được xác nhận. Chính sách hoàn tiền, chuyển số dư và thời hạn sử dụng được công bố tại chi nhánh trước khi nạp tiền.'],
  ['Sử dụng trò chơi', 'Giá, thời lượng và điều kiện tham gia được công bố tại máy hoặc trên app. Tuân thủ yêu cầu về độ tuổi, chiều cao, sức khỏe và an toàn. Trẻ em cần người lớn giám sát theo quy định khu vui chơi.'],
  ['An toàn', 'Không tự tháo lắp, can thiệp máy, đầu đọc thẻ hoặc thiết bị điện; không gian lận, làm sai lệch số dư hoặc gây gián đoạn hệ thống. Dừng sử dụng và báo nhân viên nếu thiết bị có dấu hiệu bất thường.'],
  ['Sự cố giao dịch', 'Nếu đã bị trừ tiền nhưng máy không bắt đầu, lượt chơi bị lỗi hoặc tiền nạp chưa được ghi nhận, cung cấp mã thẻ, máy, chi nhánh và thời điểm sự cố. Nhân viên kiểm tra để hỗ trợ khôi phục lượt chơi, điều chỉnh số dư hoặc hoàn tiền theo kết quả xác minh và chính sách được công bố.'],
  ['Thông tin cá nhân', 'Thông tin tài khoản, liên hệ và lịch sử được sử dụng để cung cấp dịch vụ, hỗ trợ khách hàng và bảo đảm an toàn hệ thống. Liên hệ đơn vị vận hành để biết chính sách lưu trữ và yêu cầu hỗ trợ về dữ liệu cá nhân.'],
  ['Hỗ trợ', 'Gửi yêu cầu tại Trung tâm hỗ trợ hoặc gọi 0794088678 / 0708348573. Không gửi mật khẩu, OTP hoặc thông tin thanh toán nhạy cảm.'],
  ['Cập nhật điều khoản', 'Đơn vị vận hành công bố thay đổi và thời điểm áp dụng để khách hàng biết trước khi tiếp tục sử dụng. Quyền của khách hàng được thực hiện theo quy định áp dụng và chính sách đã công bố.'],
];
export default function Terms() { return <UserPage title="Điều khoản sử dụng">{terms.map(([title, body], i) => <UserText key={title}>{i + 1}. {title}{'\n'}{body}</UserText>)}</UserPage>; }
