# TÀI LIỆU ĐẶC TẢ NGHIỆP VỤ HỆ THỐNG - PHẦN 3: CHIẾN DỊCH GỬI TIN & BỘ LỌC KIỂM DUYỆT
*Biên soạn bởi: Senior Business Analyst (10 năm kinh nghiệm)*
*Dự án: Nền tảng Marketing & Chăm sóc khách hàng tự động cho Spa (MarketingAutoAZ)*

---

## 1. Nghiệp vụ Chiến dịch gửi tin nhắn (Messaging Campaigns)
Hệ thống cho phép Spa tiếp cận khách hàng hàng loạt hoặc theo kịch bản cá nhân hóa thông qua 2 loại chiến dịch chính:
-   **Chiến dịch Gửi tin hàng loạt (Broadcast Campaigns)**: Gửi thông điệp khuyến mãi, thông báo ngày lễ, hoặc giới thiệu dịch vụ mới đến một tệp khách hàng được phân khúc cụ thể (Segment) tại một thời điểm xác định hoặc lên lịch trước.
-   **Chiến dịch Tự động (Automation Campaigns)**: Gửi tin tự động dựa trên hành vi của khách hàng hoặc các cột mốc thời gian (nhắc lịch hẹn sinh nhật, nhắc lịch tái khám da sau 7 ngày, khảo sát dịch vụ sau khi thực hiện liệu trình).

### 1.1. Các kênh gửi tin tích hợp:
1.  **Facebook Messenger**: Tương tác trực tiếp bằng tài khoản Fanpage của Spa đến tài khoản cá nhân của khách hàng đã từng nhắn tin cho Fanpage.
2.  **Zalo Official Account (Zalo OA)**: Sử dụng OpenAPI Zalo OA gửi tin nhắn CSKH (tin nhắn phản hồi miễn phí trong vòng 8h hoặc tin nhắn chăm sóc khách hàng).
3.  **Zalo Business Service (ZBS - ZNS)**: Gửi tin nhắn theo mẫu (Template) đã đăng ký với Zalo đến số điện thoại khách hàng. Đây là hình thức có tính phí dựa trên số lượng tin gửi thành công.

---

## 2. Nghiệp vụ Bộ lọc Kiểm duyệt & Chống Spam (Eligibility & Anti-Spam Engine)
Để tránh việc gửi tin nhắn rác làm phiền khách hàng dẫn đến việc Fanpage bị khóa hoặc Zalo OA bị báo cáo, hệ thống tích hợp một **Bộ lọc kiểm duyệt tự động (Eligibility Engine)** trước khi tiến hành gửi bất kỳ tin nhắn nào:

### 2.1. Quy tắc cửa sổ tương tác 24h đối với Messenger:
- Theo chính sách của Meta, trang chỉ được gửi tin nhắn quảng cáo/chăm sóc khách hàng thông thường đến người dùng trong vòng **24 giờ** kể từ lần cuối cùng người dùng tương tác chủ động với trang (inbound message).
- Hệ thống sẽ kiểm tra thời gian tương tác cuối cùng của khách hàng (`lastInboundAt`). Nếu nằm ngoài cửa sổ 24 giờ, hệ thống sẽ đánh dấu Lead/Khách hàng này là `Không đủ điều kiện (Ineligible)` và tự động bỏ qua lượt gửi này để bảo vệ Fanpage.

### 2.2. Kiểm tra quyền đồng ý nhận tin (Opt-in / Opt-out):
- Chỉ những khách hàng đã xác nhận đồng ý nhận tin nhắn tiếp thị mới được đưa vào danh sách gửi tin.
- Nếu khách hàng gửi tin nhắn có chứa các từ khóa từ chối như `STOP`, `HUY`, `OPTOUT`, hệ thống sẽ tự động chuyển trạng thái của họ sang `optedOut = true`. Khi chạy bất kỳ chiến dịch nào, hệ thống sẽ loại trừ tự động các số điện thoại/tài khoản này.

### 2.3. Cấu hình Khung giờ yên tĩnh (Quiet Hours):
- Để tránh gửi tin nhắn quấy rầy khách hàng vào ban đêm (gây trải nghiệm xấu), hệ thống có cấu hình khung giờ yên tĩnh (ví dụ từ 22:00 đêm đến 08:00 sáng hôm sau).
- Nếu có lịch gửi tin rơi vào khung giờ này, hệ thống sẽ tự động trì hoãn (pause/delay) và dời lịch gửi sang đầu giờ sáng của ngày tiếp theo.

---

## 3. Nghiệp vụ Cá nhân hóa nội dung tin nhắn (Dynamic Templates)
Hệ thống sử dụng các mẫu tin nhắn (`MessageTemplate`) chứa các biến động để mỗi khách hàng nhận được nội dung cá nhân hóa riêng:
- Cấu trúc mẫu hỗ trợ các thẻ biến dạng: `{{customer_name}}`, `{{appointment_time}}`, `{{branch_name}}`, `{{service_name}}`.
- Trước khi gửi tin, hệ thống tự động trích xuất các biến này, truy vấn cơ sở dữ liệu CRM để lấy thông tin thực tế của khách hàng và lịch hẹn tương ứng để thay thế vào tin nhắn.

## 4. Kiểm soát Tốc độ gửi tin (Rate Limiting & Concurrency)
- Gửi tin nhắn hàng loạt quá nhanh sẽ bị các nhà mạng hoặc Facebook đánh giá là hành vi Spam.
- Hệ thống giải quyết bằng cách đưa các công việc gửi tin vào hàng đợi **BullMQ**. Worker sẽ giới hạn mức độ xử lý đồng thời tối đa (ví dụ `concurrency: 5`), mỗi tin nhắn được gửi cách nhau một khoảng trễ nhỏ để duy trì luồng gửi tự nhiên và an toàn cho tài khoản Spa.
