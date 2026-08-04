# TÀI LIỆU ĐẶC TẢ NGHIỆP VỤ HỆ THỐNG - PHẦN 2: KẾT NỐI KÊNH & ĐĂNG BÀI TỰ ĐỘNG
*Biên soạn bởi: Senior Business Analyst (10 năm kinh nghiệm)*
*Dự án: Nền tảng Marketing & Chăm sóc khách hàng tự động cho Spa (MarketingAutoAZ)*

---

## 1. Nghiệp vụ Kết nối kênh Tiếp thị (Channel Integration)
Hệ thống cho phép Spa liên kết các kênh tiếp thị bên thứ ba để tập trung quản lý và tự động hóa các chiến dịch tiếp cận khách hàng.

### 1.1. Các kênh hỗ trợ kết nối:
-   **Facebook Fanpage**: Để tự động đăng bài, quản lý tin nhắn khách hàng (Messenger) và chatbot.
-   **Zalo Official Account (Zalo OA)**: Kênh chính thức để gửi tin chăm sóc khách hàng hàng loạt và tương tác trực tiếp qua Zalo.
-   **WordPress**: Đồng bộ các bài viết tiếp thị từ AI Content lên trang Web/Blog của Spa.
-   **Google & Meta Ad Accounts**: Liên kết để đọc số liệu hiệu suất chiến dịch quảng cáo.

### 1.2. Cơ chế Kết nối Fanpage Facebook (Hai chế độ):
*   **Chế độ Cấu hình Tĩnh (Env Mode)**:
    - *Nghiệp vụ*: Dành cho hệ thống chạy đơn thương hiệu, hoặc Spa chỉ chạy trên duy nhất 1 Fanpage chính. Admin cấu hình `META_PAGE_ID` và `META_PAGE_ACCESS_TOKEN` trực tiếp trong file `.env` trên máy chủ. Người dùng chỉ cần nhấn nút "Đồng bộ" là hệ thống tự lấy cấu hình này lưu mã hóa vào DB mà không yêu cầu người dùng phải trải qua luồng đăng nhập OAuth của Facebook.
*   **Chế độ OAuth Đa tài khoản (OAuth Mode)**:
    - *Nghiệp vụ*: Dành cho hệ thống đa chuỗi hoặc nhiều khách hàng dùng chung nền tảng SaaS. Người dùng click "Kết nối", hệ thống điều hướng sang luồng đăng nhập **Facebook Login for Business** (sử dụng cấu hình ID `META_LOGIN_CONFIG_ID`).
    - Sau khi cấp quyền cho ứng dụng, Meta trả về Webhook mã authorization `code`. Backend thực hiện trao đổi lấy Token User dài hạn (Long-lived Token), sau đó truy vấn danh sách các Fanpage mà User quản trị thông qua endpoint `/me/accounts` để lấy Page ID, tên page, ảnh đại diện, và Page Access Token cụ thể của từng Page lưu mã hóa vào database.

---

## 2. Nghiệp vụ Đăng bài tự động lên Fanpage (Auto Post)
Hỗ trợ chủ Spa tự động hóa hoàn toàn lịch trình xây dựng thương hiệu trên mạng xã hội Facebook.

### 2.1. Quy trình Nghiệp vụ Đăng bài viết:
1.  **Soạn thảo bài viết**: Người dùng nhập nội dung văn bản (caption), tải lên hình ảnh hoặc đính kèm liên kết (link) của Spa. Nội dung có thể tự soạn thảo hoặc sinh tự động thông qua Content AI.
2.  **Thiết lập xuất bản**: Người dùng có thể chọn **Đăng ngay (Publish Now)** hoặc **Lên lịch đăng bài (Scheduled Post)** vào ngày giờ cụ thể trong tương lai.
3.  **Xét duyệt bài viết (Approval flow)**: Bài viết sau khi lên lịch sẽ ở trạng thái `SCHEDULED`. Chỉ những bài viết được Quản lý Spa hoặc Chủ Spa nhấn phê duyệt (`approvedAt !== null`) mới được phép đẩy vào hàng đợi xuất bản.

### 2.2. Kiểm duyệt định dạng đầu vào (Validation Rules):
Nhằm tuân thủ quy chuẩn định dạng bài đăng của Meta Graph API và tối ưu khả năng hiển thị:
- Nội dung văn bản bắt buộc không được để trống.
- Khách hàng chỉ được phép chọn 1 trong 2 hình thức: **Hoặc** đính kèm liên kết (Link), **Hoặc** tải lên ảnh (imageUrl). Hệ thống chặn việc gửi đồng thời cả hai định dạng này trên 1 bài đăng để tránh lỗi hiển thị bài viết trên tường Fanpage.
- Đường dẫn Link hoặc Ảnh tải lên bắt buộc phải tuân theo định dạng giao thức truyền tải hợp lệ (`http:` hoặc `https:`).

### 2.3. Xử lý xuất bản tự động qua BullMQ:
- Đối với bài đăng ngay: Gửi yêu cầu trực tiếp đến API Facebook.
- Đối với bài lên lịch: Worker chạy nền sẽ thực hiện quét các bài viết đã duyệt có thời gian hẹn giờ nhỏ hơn hoặc bằng thời gian hiện tại (`scheduledAt <= now`).
- Tác vụ gọi đến API Facebook (`/feed` hoặc `/photos` tương ứng) sử dụng token đã được giải mã động để thực hiện xuất bản. Kết quả thành công sẽ lưu lại ID bài đăng từ Facebook (`facebookPostId`) để người dùng xem lại. Trạng thái lỗi (Token hết hạn, Page ID sai, giới hạn rate limit) sẽ được phân loại lỗi chi tiết ghi vào log và cập nhật trạng thái bài đăng về `FAILED`.
