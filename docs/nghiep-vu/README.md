# HƯỚNG DẪN ĐỌC TÀI LIỆU ĐẶC TẢ NGHIỆP VỤ HỆ THỐNG
*Dự án: Nền tảng Marketing & Chăm sóc khách hàng tự động cho Spa (MarketingAutoAZ)*

Chào mừng bạn đến với thư mục tài liệu đặc tả nghiệp vụ của MarketingAutoAZ. Tài liệu này được biên soạn bởi **Senior Business Analyst (10 năm kinh nghiệm)** nhằm làm rõ toàn bộ quy trình nghiệp vụ và các tính năng cốt lõi của hệ thống.

---

## Danh mục tài liệu nghiệp vụ chi tiết:

1.  **[Phần 0: Tổng quan & Multi-tenant](file:///var/www/marketingaut_usr75/data/www/docs/nghiep-vu/00-tong-quan.md)**
    *   Mô tả kiến trúc Multi-tenant (Spa isolation).
    *   Nghiệp vụ gói cước định kỳ (Subscriptions) & lạm dụng dùng thử (Anti-trial abuse).
    *   Tích hợp thanh toán tự động qua cổng SePay QR.
    *   Quy định sử dụng và phân phối Credit nội bộ.

2.  **[Phần 1: CRM & Tự động hóa lịch hẹn](file:///var/www/marketingaut_usr75/data/www/docs/nghiep-vu/01-crm-appointments.md)**
    *   Quy trình phân biệt Lead và Customer trong ngành Spa.
    *   Phễu bán hàng CRM (Funnel stages) và lưu bộ lọc tìm kiếm (Saved Views).
    *   Cơ chế đồng bộ Lead Ads từ Facebook và Website.
    *   Luồng tự động nhắc lịch hẹn (Appointment Reminders) trước 24h qua các kênh tự động.

3.  **[Phần 2: Kết nối kênh & Đăng bài tự động](file:///var/www/marketingaut_usr75/data/www/docs/nghiep-vu/02-auto-post-channels.md)**
    *   Tích hợp đa kênh tiếp thị (Facebook, Google, Zalo OA, WordPress).
    *   Hai cơ chế kết nối Facebook Fanpage: Env Mode (Tĩnh) và OAuth Mode (Động).
    *   Quy định kiểm duyệt đầu vào bài viết tự động (Auto Post).
    *   Lập lịch và xuất bản bài đăng hàng loạt qua hàng đợi BullMQ.

4.  **[Phần 3: Chiến dịch gửi tin & Bộ lọc kiểm duyệt](file:///var/www/marketingaut_usr75/data/www/docs/nghiep-vu/03-messaging-campaigns.md)**
    *   Phân loại chiến dịch gửi tin: Hàng loạt (Broadcast) và Kịch bản (Automation).
    *   Nguyên tắc kiểm duyệt điều kiện gửi tin (Eligibility Engine).
    *   Quy tắc 24h đối với Messenger, chính sách chống spam, quản lý danh sách Opt-out.
    *   Cấu hình Khung giờ yên tĩnh (Quiet Hours) tránh làm phiền khách hàng.
    *   Cá nhân hóa nội dung thông qua mẫu tin nhắn động (Dynamic Templates).

5.  **[Phần 4: Hiệu suất quảng cáo & Tối ưu hóa AI](file:///var/www/marketingaut_usr75/data/www/docs/nghiep-vu/04-ads-performance-ai.md)**
    *   Đồng bộ chỉ số hiển thị, click, chi tiêu từ Meta Ads & Google Ads về Dashboard chung.
    *   Đồng bộ chuyển đổi ngoại tuyến (Offline Conversions Sync) qua Meta CAPI tối ưu tệp đối tượng.
    *   Quy tắc AI tự động bật/tắt, điều chỉnh ngân sách quảng cáo 24/7.
    *   Cổng giao tiếp Ads MCP Gateway.

6.  **[Phần 5: AI Content Marketing & Chatbot CSKH](file:///var/www/marketingaut_usr75/data/www/docs/nghiep-vu/05-content-marketing-ai.md)**
    *   Trình sinh bài viết tiếp thị AI định vị theo đối tượng mục tiêu và Tone of voice.
    *   Chatbot CSKH tự động sử dụng công nghệ RAG Knowledge Base lấy thông tin bảng giá, dịch vụ chính xác.
    *   Luồng chuyển giao hội thoại từ AI sang tư vấn viên (Human Handover) khi có yêu cầu.

7.  **[Phần 6: Quản lý nhân sự & Chấm công ca kíp](file:///var/www/marketingaut_usr75/data/www/docs/nghiep-vu/06-hrm-cham-cong.md)**
    *   Kiểm soát trạng thái nhân viên và vòng đời hợp đồng lao động.
    *   Quản lý lập ca làm việc linh hoạt, định nghĩa giờ đi muộn cho phép (Grace period).
    *   Cơ chế chấm công chống gian lận: Quét QR động tại quầy và GPS ranh giới tọa độ Spa.
    *   Quy trình đề xuất và phê duyệt đơn xin nghỉ phép (Leave request) tự động cập nhật Timesheet.

8.  **[Phần 7: Tính năng gửi tin Messenger hàng loạt theo danh sách Excel/CSV](file:///var/www/marketingaut_usr75/data/www/docs/nghiep-vu/07-gui-tin-nhan-danh-sach-co-san.md)**
    *   Tải lên danh sách mã định danh người dùng Facebook (PSID) qua file Excel/CSV mẫu.
    *   Đối chiếu khớp danh tính tương tác trước đó trên Fanpage và tự động lọc loại trừ khách hàng không hợp lệ (Opt-out, ngoài cửa sổ 24h không có tag, block).
    *   Cá nhân hóa tin nhắn bằng cách lấy dữ liệu động từ các cột của file Excel chèn vào mẫu tin nhắn.
    *   Theo dõi tiến trình gửi tin nhắn thực tế thời gian thực và quản lý chống gửi trùng (Idempotency).


