# MarketingSpa Chatbot — Proxy HTTPS cho website WordPress/Laragon

## Vấn đề
Website HTTPS (vd. https://backlinkbrand.com) KHÔNG tải được script từ http://127.0.0.1:4000 (trình duyệt chặn mixed content).

## Cách sửa (Laragon / Apache)

1. Copy thư mục `chatbot-api/` vào **document root** của website (cùng cấp file `wp-config.php` hoặc `index.php`).

2. Trong `.env` MarketingSpa đặt:
   CHATBOT_PUBLIC_API_URL=https://backlinkbrand.com/chatbot-api

3. Khởi động lại API, vào Chatbot CSKH → Copy mã nhúng mới.

4. Kiểm tra:
   - https://backlinkbrand.com/chatbot-api/chatbot/widget.js  → phải trả về JavaScript
   - Widget hiện góc phải màn hình

## Apache mod_proxy (tùy chọn, nếu bật sẵn)
Thêm vào .htaccess gốc website:
RewriteEngine On
RewriteRule ^chatbot-api/(.*)$ http://127.0.0.1:4000/$1 [P,L]
