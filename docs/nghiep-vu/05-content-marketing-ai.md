# TÀI LIỆU ĐẶC TẢ NGHIỆP VỤ HỆ THỐNG - PHẦN 5: AI CONTENT MARKETING & CHATBOT CSKH
*Biên soạn bởi: Senior Business Analyst (10 năm kinh nghiệm)*
*Dự án: Nền tảng Marketing & Chăm sóc khách hàng tự động cho Spa (MarketingAutoAZ)*

---

## 1. Nghiệp vụ Sáng tạo Nội dung Tiếp thị bằng Trí tuệ Nhân tạo (AI Content)
Công cụ AI Content giúp nhân viên viết bài và chủ Spa tạo ra hàng loạt nội dung truyền thông chất lượng cao chỉ trong vài giây.

### 1.1. Luồng nghiệp vụ sinh nội dung:
1.  **Nhập đề tài & từ khóa**: Người dùng cung cấp chủ đề bài viết (ví dụ: "Giới thiệu dịch vụ Trị mụn ẩn bằng thảo dược") và các từ khóa cốt lõi cần xuất hiện trong bài.
2.  **Lựa chọn tệp khách hàng mục tiêu**: Phân loại đối tượng người đọc để AI lựa chọn từ ngữ phù hợp (ví dụ: "Mẹ bỉm sữa", "Nhân viên văn phòng bận rộn", "Người trẻ quan tâm làm đẹp tự nhiên").
3.  **Lựa chọn Giọng điệu (Tone of Voice)**:
    -   `gentle_deep` (Dịu dàng, sâu lắng): Phù hợp cho các bài viết chia sẻ cảm xúc, trải nghiệm thư giãn tại Spa.
    -   `anh_em` / `chi_em` (Thân mật, gần gũi): Phù hợp viết bài mạng xã hội dạng chia sẻ kinh nghiệm hàng ngày.
    -   `very_strong` (Cực gắt, thẳng thắn nhưng văn minh): Tạo điểm nhấn thu hút, giải quyết thẳng vào nỗi đau của khách hàng.
    -   `frank` (Thẳng thắn), `strong` (Mạnh mẽ), `edgy` (Đột phá).
4.  **Cấu hình Độ dài & Kênh đăng**: Lựa chọn bài viết ngắn cho Facebook, bài viết dài chuẩn SEO cho Blog Website, hoặc kịch bản nhắn tin.
5.  **Sinh nội dung & Chỉnh sửa**: AI tạo bài viết hoàn chỉnh kèm gợi ý các hashtag và ý tưởng hình ảnh đi kèm. Người dùng có thể yêu cầu AI viết lại (Rewrite), dịch thuật sang ngôn ngữ khác, rút ngắn hoặc kéo dài nội dung.

---

## 2. Chatbot Chăm sóc Khách hàng tự động (Chatbot CSKH)
Hệ thống chatbot giúp Spa tự động trả lời khách hàng trên Fanpage Messenger và Zalo OA lập tức 24/7.

### 2.1. Tích hợp RAG Knowledge Base (RAG-KB):
Để tránh việc Chatbot trả lời sai lệch thông tin hoặc trả lời chung chung, hệ thống tích hợp công nghệ **RAG (Retrieval-Augmented Generation)**:
-   **Cơ sở tri thức (Knowledge Base)**: Chủ Spa tải lên các tài liệu nội bộ như: Bảng giá dịch vụ, quy trình liệu trình điều trị mụn/nám, địa chỉ các chi nhánh, chính sách ưu đãi, danh sách bác sĩ/kỹ thuật viên.
-   **Luồng xử lý RAG**:
    1.  Khách hàng nhắn tin hỏi trên Fanpage (ví dụ: *"Liệu trình trị nám bên mình giá bao nhiêu và làm mấy buổi?"*).
    2.  Hệ thống nhận tin nhắn qua Webhook, thực hiện phân tích ngữ nghĩa câu hỏi.
    3.  Thực hiện truy vấn tìm kiếm vector trong cơ sở dữ liệu tri thức của Spa (Knowledge Base) để trích xuất các đoạn thông tin chính xác nhất về liệu trình trị nám và giá cả.
    4.  Đưa các đoạn thông tin thực tế này làm ngữ cảnh (Context) kèm câu hỏi của khách hàng vào LLM (OpenAI API).
    5.  LLM tổng hợp và soạn câu trả lời bằng tiếng Việt tự nhiên, chính xác dựa trên đúng dữ liệu thực tế của Spa, tránh việc AI tự "bịa" thông tin (hallucination).
    6.  Gửi phản hồi lại cho khách hàng ngay lập tức.

### 2.2. Cơ chế bàn giao cho nhân viên tư vấn (Human Handover):
-   Khi khách hàng yêu cầu gặp tư vấn viên trực tiếp (ví dụ: gõ *"cho gặp nhân viên"*, *"tư vấn trực tiếp"*), hoặc khi AI phát hiện câu hỏi quá phức tạp nằm ngoài cơ sở tri thức đã cấu hình.
-   Hệ thống tự động tạm ngưng chế độ trả lời tự động của Chatbot đối với cuộc hội thoại đó và gửi thông báo khẩn (Notification) cho nhân viên trực page trên hệ thống CRM kèm âm thanh cảnh báo để nhân viên vào chat tiếp quản thủ công.
