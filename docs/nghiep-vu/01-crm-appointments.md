# TÀI LIỆU ĐẶC TẢ NGHIỆP VỤ HỆ THỐNG - PHẦN 1: CRM & TỰ ĐỘNG HÓA LỊCH HẸN
*Biên soạn bởi: Senior Business Analyst (10 năm kinh nghiệm)*
*Dự án: Nền tảng Marketing & Chăm sóc khách hàng tự động cho Spa (MarketingAutoAZ)*

---

## 1. Nghiệp vụ Quản lý quan hệ khách hàng (CRM)
Hệ thống quản lý dữ liệu đối tượng khách hàng của Spa theo hai trạng thái phát triển chính: **Cơ hội (Lead)** và **Khách hàng chính thức (Customer)**.

### 1.1. Phân loại thực thể dữ liệu:
*   **Lead (Cơ hội)**: Là những người dùng quan tâm đến dịch vụ của Spa (thông qua điền form quảng cáo Facebook, đăng ký nhận tư vấn trên website, v.v.) nhưng chưa thực hiện giao dịch mua hàng lần nào.
*   **Customer (Khách hàng)**: Là những người đã phát sinh ít nhất một giao dịch thanh toán dịch vụ hoặc mua sản phẩm tại Spa. Khi một Lead phát sinh hóa đơn đầu tiên, hệ thống sẽ tự động chuyển đổi hồ sơ của họ sang trạng thái Customer.

### 1.2. Phễu chuyển đổi CRM (CRM Funnel Stages):
Hành trình của một Lead được quản lý nghiêm ngặt qua các giai đoạn sau:
1.  **NEW (Mới tạo)**: Cơ hội vừa được ghi nhận vào hệ thống (tự động hoặc thủ công).
2.  **CONTACTED (Đã liên hệ)**: Nhân viên tư vấn đã gọi điện hoặc nhắn tin trao đổi lần đầu.
3.  **QUALIFIED (Có nhu cầu thực tế)**: Lead được xác nhận có nhu cầu, phù hợp với dịch vụ của Spa.
4.  **BOOKED (Đã đặt hẹn)**: Khách hàng đồng ý lên lịch hẹn đến Spa trực tiếp.
5.  **CONFIRMED (Đã xác nhận hẹn)**: Khách hàng xác nhận chắc chắn sẽ đến trước giờ hẹn.
6.  **VISITED (Đã đến Spa)**: Khách hàng đã đến check-in và thực hiện buổi tư vấn/trị liệu.
7.  **PURCHASED (Đã mua hàng)**: Khách hàng thanh toán dịch vụ/gói sản phẩm (trở thành Customer).

### 1.3. Nguồn nhập Lead tự động (Lead Ingestion):
- **Facebook Leads Sync**: Tích hợp trực tiếp với Meta Lead Ads API. Khi khách hàng nhấn vào quảng cáo và điền Form trên Facebook, Webhook của Meta sẽ lập tức đẩy dữ liệu về hệ thống để tạo mới Lead trong tổ chức tương ứng.
- **API tích hợp bên ngoài**: Hỗ trợ tích hợp Form từ Landing Page, Website WordPress thông qua mã API token riêng của từng Spa.
- **Tạo thủ công**: Lễ tân hoặc telesale tạo nhanh ngay trên màn hình CRM.

### 1.4. Bộ lọc thông minh và Saved Views (Chế độ xem đã lưu):
- Cho phép quản lý hoặc nhân viên kinh doanh lọc danh sách Lead/Customer theo nhiều tiêu chí động: theo trạng thái phễu, theo nguồn (Facebook, Google, Website), theo ca nhân viên phụ trách, theo thẻ tag định danh.
- **Saved Views**: Hỗ trợ lưu lại bộ lọc cấu hình phức tạp này thành một thẻ menu riêng (ví dụ: Chế độ xem "Lead từ Facebook Ads chưa liên hệ") giúp tư vấn viên truy cập nhanh trong lần đăng nhập tiếp theo mà không cần cấu hình lại bộ lọc từ đầu.

---

## 2. Nghiệp vụ Lịch hẹn & Tự động hóa nhắc lịch (Appointment Automation)
Đặt lịch và nhắc lịch là hoạt động cốt lõi quyết định tỷ lệ khách hàng đến Spa (Show-up rate).

### 2.1. Quản lý Lịch hẹn (Appointments):
- Lịch hẹn lưu trữ các thông tin: Khách hàng đặt hẹn, nhân viên phục vụ, giường/phòng thực hiện dịch vụ, khung giờ bắt đầu/kết thúc, và trạng thái lịch hẹn (`PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`).

### 2.2. Kịch bản Tự động hóa nhắc lịch (Automation Triggers):
Hệ thống tích hợp một **Automation Engine** chạy nền chuyên xử lý các sự kiện thay đổi trạng thái của lịch hẹn để gửi tin nhắn tự động đến khách hàng cuối qua các kênh Messenger, Zalo OA hoặc SMS:

*   **Trigger: Lịch hẹn được tạo mới (APPOINTMENT_CREATED)**
    - *Nghiệp vụ*: Ngay khi lễ tân tạo lịch hẹn thành công, hệ thống tự động sinh và gửi tin nhắn xác nhận: *"Cảm ơn Anh/Chị [Tên khách hàng] đã đặt lịch dịch vụ [Tên dịch vụ] tại Spa chúng em vào lúc [Thời gian]. Lịch hẹn của bạn đang được xử lý..."*
*   **Trigger: Nhắc lịch trước 24 giờ (APPOINTMENT_24H_BEFORE)**
    - *Nghiệp vụ*: Worker quét định kỳ các lịch hẹn có thời gian diễn ra cách thời điểm hiện tại đúng 24 tiếng. Hệ thống gửi tin nhắn nhắc nhở kèm theo một liên kết để khách hàng xác nhận nhanh hoặc yêu cầu đổi giờ hẹn.
*   **Trigger: Hủy lịch hẹn (APPOINTMENT_CANCELLED)**
    - *Nghiệp vụ*: Tự động gửi lời xin lỗi và đề xuất hỗ trợ khách hàng đặt lịch hẹn khác.
*   **Trigger: Hoàn thành dịch vụ (APPOINTMENT_COMPLETED)**
    - *Nghiệp vụ*: Gửi tin nhắn cảm ơn sau khi khách hàng trải nghiệm xong dịch vụ tại Spa, đính kèm hướng dẫn chăm sóc da tại nhà hoặc đề xuất đánh giá chất lượng dịch vụ (Feedback survey).
