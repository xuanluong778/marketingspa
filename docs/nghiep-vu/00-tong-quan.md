# TÀI LIỆU ĐẶC TẢ NGHIỆP VỤ HỆ THỐNG - PHẦN 0: TỔNG QUAN & MULTI-TENANT
*Biên soạn bởi: Senior Business Analyst (10 năm kinh nghiệm)*
*Dự án: Nền tảng Marketing & Chăm sóc khách hàng tự động cho Spa (MarketingAutoAZ)*

---

## 1. Giới thiệu chung về Dự án
**MarketingAutoAZ** là giải pháp phần mềm dạng dịch vụ (SaaS) chuyên biệt cho ngành chăm sóc sức khỏe, sắc đẹp (Spa, Thẩm mỹ viện, Hair Salon, Clinic). Hệ thống cung cấp bộ công cụ tự động hóa toàn diện từ thu hút khách hàng (Ads Sync, Auto Post, AI Content), nuôi dưỡng khách hàng (CRM, Auto Message) đến quản lý vận hành nội bộ (HRM Chấm công, Quản lý ca kíp, Quản lý lịch hẹn).

## 2. Kiến trúc Nghiệp vụ Multi-Tenant (Đa thuê)
Dự án được thiết kế theo mô hình **Đa thuê (Multi-tenant)**, trong đó tài nguyên phần mềm được chia sẻ nhưng dữ liệu và nghiệp vụ được cô lập tuyệt đối giữa các tổ chức doanh nghiệp (Spa).

### 2.1. Cấu trúc Đối tượng cốt lõi:
- **Tổ chức (Organization)**: Là thực thể cao nhất đại diện cho một Spa hoặc chuỗi Spa. Mọi dữ liệu như Khách hàng, Lead, Chiến dịch, Ca kíp, Hóa đơn,... bắt buộc phải gắn với một `organizationId` duy nhất. Dữ liệu giữa các Organization được ngăn cách vật lý ở tầng ứng dụng và truy vấn database.
- **Người dùng (User)**: Là tài khoản của nhân viên, quản lý hoặc chủ doanh nghiệp. Một người dùng thuộc về một Tổ chức chính thức nhưng có thể có các quyền hạn khác nhau.
- **Phân quyền người dùng (Role-Based Access Control - RBAC)**:
  - **Platform Admin (Quản trị viên hệ thống)**: Có toàn quyền cấu hình hệ thống, kiểm duyệt mẫu tin nhắn, kiểm tra lịch sử thanh toán toàn hệ thống, quản lý tài khoản người dùng của các Spa khác.
  - **Tenant Owner / Admin (Chủ Spa / Quản lý)**: Có toàn quyền quản lý các thiết lập trong phạm vi Spa của mình, quản lý nhân viên, kết nối các kênh tiếp thị, thanh toán gói cước.
  - **Staff / Employee (Nhân viên)**: Nhân viên điều trị, lễ tân. Bị giới hạn quyền truy cập chỉ xem được danh sách khách hàng được phân công, chấm công ca trực, tạo lịch hẹn.

---

## 3. Nghiệp vụ Gói dịch vụ, Thanh toán & Quản lý Credit

### 3.1. Đăng ký & Dùng thử (Trial)
- Mỗi tổ chức khi đăng ký tài khoản mới được cấp quyền **Dùng thử miễn phí trong vòng 3 ngày (3-Day Free Trial)** với đầy đủ các tính năng cơ bản.
- Hệ thống áp dụng quy tắc chống lạm dụng dùng thử (Anti-trial abuse): Kiểm tra địa chỉ IP, dấu vân tay trình duyệt (Device Fingerprint) và số điện thoại liên kết để ngăn chặn việc một Spa tạo nhiều tài khoản ảo nhằm kéo dài thời gian dùng thử.

### 3.2. Chu kỳ Gói cước (Subscriptions)
- Cung cấp các gói cước trả phí định kỳ linh hoạt theo **Tháng** hoặc **Năm** (Ví dụ: Gói Cơ bản, Gói Nâng cao, Gói Chuyên nghiệp).
- Khi hết hạn chu kỳ hiện tại, nếu chủ Spa không thực hiện thanh toán gia hạn, hệ thống sẽ tự động chuyển trạng thái tổ chức sang `EXPIRED`. Lúc này, các tính năng tự động đăng bài, gửi tin nhắn tự động và chấm công sẽ bị tạm khóa cho đến khi thanh toán hoàn tất.

### 3.3. Tích hợp cổng thanh toán SePay
- Hệ thống tích hợp với cổng thanh toán **SePay** để tự động nhận dạng giao dịch chuyển khoản ngân hàng qua mã QR.
- **Luồng nghiệp vụ**:
  1. Chủ Spa chọn gói cước hoặc số lượng Credit cần nạp trên giao diện.
  2. Hệ thống tạo ra một hóa đơn (Invoice) kèm mã QR thanh toán chứa nội dung chuyển khoản động chứa mã hóa đơn cụ thể.
  3. Khi khách hàng quét mã QR và thực hiện chuyển khoản thành công, ngân hàng gửi webhook báo về SePay.
  4. SePay đẩy webhook về API của MarketingAutoAZ.
  5. Hệ thống xác thực tính toàn vẹn của webhook giao dịch, khớp mã hóa đơn và tự động nâng cấp gói dịch vụ hoặc cộng Credit cho Spa ngay lập tức mà không cần nhân viên hỗ trợ duyệt thủ công.

### 3.4. Nghiệp vụ Quản lý Credit
- **Credit** là đơn vị tiền tệ nội bộ của hệ thống.
- Được sử dụng để chi trả cho các tác vụ tiêu hao tài nguyên như: Gọi AI tạo nội dung tiếp thị, gửi tin nhắn Zalo OA, tin nhắn ZBS Template hoặc SMS chăm sóc khách hàng.
- Mỗi tác vụ gửi tin hoặc tạo AI sẽ trừ một lượng Credit tương ứng dựa trên cấu hình giá cước hệ thống.
- Credit không có giá trị quy đổi thành tiền mặt và không được chuyển nhượng giữa các Organization khác nhau.
