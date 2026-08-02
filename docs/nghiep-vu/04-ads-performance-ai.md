# TÀI LIỆU ĐẶC TẢ NGHIỆP VỤ HỆ THỐNG - PHẦN 4: HIỆU SUẤT QUẢNG CÁO & TỐI ƯU HÓA AI
*Biên soạn bởi: Senior Business Analyst (10 năm kinh nghiệm)*
*Dự án: Nền tảng Marketing & Chăm sóc khách hàng tự động cho Spa (MarketingAutoAZ)*

---

## 1. Nghiệp vụ Đồng bộ dữ liệu Hiệu suất Quảng cáo (Ads Sync)
Chủ Spa chi tiêu rất nhiều tiền cho quảng cáo trên Meta (Facebook Ads) và Google Ads. Hệ thống cung cấp bảng điều khiển (Dashboard) hợp nhất để theo dõi hiệu quả chi tiêu quảng cáo.

### 1.1. Luồng đồng bộ thông số quảng cáo:
1.  **Kết nối Tài khoản Quảng cáo (Ad Account Link)**: Chủ Spa liên kết tài khoản Google Ads và Meta Ads thông qua kết nối OAuth bảo mật.
2.  **Quét dữ liệu định kỳ (Scheduled Ads Sync)**: Hệ thống sử dụng BullMQ chạy nền (`ADS_SYNC` queue) quét dữ liệu định kỳ (mỗi vài giờ hoặc hằng ngày).
3.  **Thu thập chỉ số**: Lấy thông tin về Số lượt hiển thị (Impressions), Số lượt click (Clicks), Chi phí chi tiêu (Spend), và Số lượng chuyển đổi online (Conversions) từ cấp độ Chiến dịch (Campaigns), Nhóm quảng cáo (Ad Sets / Ad Groups) đến từng mẫu Quảng cáo (Ads / Creatives).
4.  **Chuẩn hóa dữ liệu (Ads Normalization)**: Dữ liệu từ hai nền tảng quảng cáo khác nhau được ánh xạ và chuẩn hóa về một cấu trúc dữ liệu thống nhất trong DB để vẽ biểu đồ so sánh chi phí trên mỗi Lead (Cost per Lead - CPL) và tỷ lệ chuyển đổi chung.

---

## 2. Nghiệp vụ Đồng bộ chuyển đổi ngoại tuyến (Offline Conversions Sync)
Đây là nghiệp vụ quan trọng giúp Spa tối ưu hóa tệp đối tượng quảng cáo trên Facebook/Google.

### 2.1. Vấn đề thực tế của Spa:
- Nhiều khách hàng nhấn vào quảng cáo Facebook (Online), nhưng chỉ thực sự mua liệu trình hoặc thanh toán tại Spa (Offline). Facebook Ads Manager không biết được khách hàng nào thực sự mang lại doanh thu để tối ưu thuật toán tìm kiếm.

### 2.2. Giải pháp chuyển đổi ngoại tuyến:
- Khi nhân viên Spa cập nhật trạng thái của khách hàng trên CRM thành `PURCHASED` (Đã mua hàng) kèm giá trị hóa đơn thực tế.
- Hệ thống tự động kích hoạt tiến trình chạy nền `processOfflineConversion`.
- Tiến trình này đóng gói thông tin khách hàng (đã băm mã hóa SHA-256 để bảo mật thông tin cá nhân như SĐT, Email) và giá trị giao dịch, sau đó gọi **Meta Conversions API (CAPI)** hoặc Google Ads Offline Conversion API để đẩy thông tin mua hàng này ngược lại cho tài khoản quảng cáo.
- Thuật toán của Meta/Google sẽ nhận diện và tối ưu phân phối quảng cáo đến những người có hành vi tương tự như nhóm khách hàng thực tế đã chi tiền tại Spa.

---

## 3. Trình tối ưu hóa Quảng cáo tự động bằng AI (AI Ads Manager & Automation)
Hỗ trợ chủ Spa tự động giám sát các chiến dịch quảng cáo 24/7 mà không cần thuê chuyên viên tối ưu.

### 3.1. Các quy tắc tự động hóa cấu hình sẵn (Automation Rules):
Hệ thống cho phép chủ Spa thiết lập các điều kiện tự động để điều chỉnh quảng cáo:
-   **Quy tắc tắt quảng cáo kém hiệu quả**: Nếu một mẫu quảng cáo tiêu hết quá số tiền cấu hình trước (ví dụ 100,000đ) mà không mang lại Lead nào, hệ thống tự động gọi API Meta/Google tắt quảng cáo đó để tránh lãng phí ngân sách.
-   **Quy tắc tăng ngân sách**: Nếu chiến dịch có chi phí trên mỗi Lead (CPL) thấp hơn mức trung bình đặt ra, tự động tăng ngân sách chiến dịch thêm 10% - 20% mỗi ngày.
-   **Quy tắc cảnh báo**: Gửi thông báo ngay cho quản lý qua Telegram hoặc Notification hệ thống khi chi phí quảng cáo tăng vọt bất thường.

### 3.2. Cổng MetaAdsMCP Gateway:
- Cung cấp cổng giao tiếp nội bộ để thực thi các tác vụ thay đổi trạng thái chiến dịch, điều chỉnh ngân sách, hoặc cập nhật nhóm đối tượng trực tiếp lên trình quản lý quảng cáo của Meta thông qua lệnh gọi API từ AI engine.
