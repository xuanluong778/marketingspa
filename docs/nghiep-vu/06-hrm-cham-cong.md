# TÀI LIỆU ĐẶC TẢ NGHIỆP VỤ HỆ THỐNG - PHẦN 6: QUẢN LÝ NHÂN SỰ & CHẤM CÔNG CA KÍP
*Biên soạn bởi: Senior Business Analyst (10 năm kinh nghiệm)*
*Dự án: Nền tảng Marketing & Chăm sóc khách hàng tự động cho Spa (MarketingAutoAZ)*

---

## 1. Nghiệp vụ Quản lý Nhân sự (HRM)
Hỗ trợ Spa quản lý thông tin nhân viên (kỹ thuật viên điều trị, lễ tân, bác sĩ) và các chế độ hợp đồng lao động.

### 1.1. Trạng thái hoạt động của nhân viên:
-   `ACTIVE` (Đang làm việc chính thức).
-   `PROBATION` (Đang thử việc).
-   `ON_LEAVE` (Tạm thời nghỉ thai sản, nghỉ phép dài hạn).
-   `TERMINATED` (Đã nghỉ việc).

### 1.2. Hợp đồng lao động (Employment Contracts):
- Quản lý các loại hợp đồng: Thử việc, Hợp đồng xác định thời hạn, Hợp đồng không xác định thời hạn.
- Trạng thái hợp đồng di chuyển từ `DRAFT` (Bản thảo) -> `ACTIVE` (Có hiệu lực) -> `EXPIRED` (Hết hạn) hoặc `TERMINATED` (Chấm dứt trước hạn).

---

## 2. Nghiệp vụ Quản lý phân ca làm việc (Shifts Scheduling)
Vận hành Spa yêu cầu phân ca trực linh hoạt cho kỹ thuật viên và lễ tân để đảm bảo luôn có người phục vụ khách hàng.

### 2.1. Định nghĩa Ca làm việc (Shift Settings):
Mỗi ca làm việc bao gồm: Giờ bắt đầu, Giờ kết thúc, Thời gian nghỉ trưa, và **Thời gian đi muộn cho phép (Grace Period)** (ví dụ: cho phép đi muộn 5-10 phút so với giờ bắt đầu ca trực).

### 2.2. Phân ca (Shift Assignment):
- Người quản lý lập lịch phân công ca làm việc cho từng nhân viên theo từng ngày hoặc tuần.
- Lịch phân ca này là cơ sở để đối chiếu và tính toán kết quả chấm công thực tế của nhân viên ngày hôm đó.

---

## 3. Nghiệp vụ Điểm danh & Chấm công (Attendance & Punching)
Hệ thống hỗ trợ nhiều phương thức chấm công khác nhau để hạn chế gian lận chấm công hộ.

### 3.1. Các phương thức chấm công (Punch Methods):
1.  **Chấm công qua mã QR (QR Code)**: Nhân viên quét mã QR động hiển thị trên màn hình máy tính bảng đặt tại quầy lễ tân của Spa. Mã QR này thay đổi liên tục theo thời gian thực để ngăn việc chụp ảnh mang về nhà quét.
2.  **Chấm công qua định vị GPS**: Chấm công trên app di động cá nhân, hệ thống kiểm tra tọa độ GPS của nhân viên. Chỉ khi vị trí nằm trong bán kính cho phép (ví dụ 50 mét) quanh tọa độ của Spa mới được chấp nhận chấm công.
3.  **KiosK**: Thiết bị chuyên dụng đặt tại Spa để nhân viên check-in bằng vân tay hoặc nhận diện khuôn mặt.
4.  **Chấm thủ công (Manual Punch)**: Người quản lý duyệt chấm công bổ sung cho nhân viên trong trường hợp quên chấm công hoặc gặp sự cố kỹ thuật.

### 3.2. Luồng Punching & Trạng thái ngày công:
- Nhân viên thực hiện các lượt bấm nút chấm công: `CHECK_IN` (Vào ca), `CHECK_OUT` (Ra ca), `BREAK_START` (Bắt đầu nghỉ), `BREAK_END` (Kết thúc nghỉ).
- **Tính toán trạng thái ngày công (Attendance Status Calculation)**:
  Cuối ngày, hệ thống chạy worker đối chiếu giờ punch thực tế và giờ ca trực phân bổ để tính toán:
  -   `PRESENT` (Đến đúng giờ, đủ công).
  -   `ABSENT` (Không có dữ liệu punch - Vắng mặt).
  -   `LEAVE` (Xin nghỉ phép và đã được duyệt).
  -   `HOLIDAY` (Nghỉ ngày lễ theo chế độ).
  -   `INCOMPLETE` (Chỉ check-in mà quên check-out, hoặc ngược lại).

---

## 4. Nghiệp vụ Xin nghỉ phép (Leave Requests)
- Nhân viên gửi yêu cầu xin nghỉ phép qua ứng dụng (Nghỉ phép năm hưởng lương, nghỉ ốm, nghỉ không lương).
- Người quản lý xem xét phê duyệt hoặc từ chối đơn.
- Khi đơn xin nghỉ phép được phê duyệt (`APPROVED`), hệ thống tự động cập nhật lại bảng chấm công (Timesheet) của nhân viên đó trong ngày tương ứng thành trạng thái `LEAVE` và tính toán lại quỹ lương cuối tháng.
