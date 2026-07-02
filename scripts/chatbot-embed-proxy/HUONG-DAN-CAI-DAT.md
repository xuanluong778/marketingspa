# MarketingSpa Chatbot — Nhúng lên website HTTPS (WordPress)

## Vì sao widget không hiện?

`https://backlinkbrand.com/chatbot-api/...` trả **404** vì **chưa cài proxy** trên server WordPress.

API MarketingSpa đang chạy trên máy dev (`127.0.0.1:4000`), còn website host trên VPS — cần plugin proxy + URL API public.

## Cài đặt (5 phút)

### 1. Upload plugin WordPress

1. Mở **WP Admin** → **Plugins** → **Add New** → **Upload Plugin**
2. Chọn file: `scripts/chatbot-embed-proxy/mspa-chatbot-proxy.zip`
3. **Install** → **Activate**

### 2. Cấu hình URL API upstream

**Settings** → **MarketingSpa Chatbot**:

| Tình huống | URL upstream |
|------------|----------------|
| API chạy **cùng VPS** với website | `http://127.0.0.1:4000` |
| API chạy **máy dev** (Laragon) | URL tunnel HTTPS (Cloudflare Tunnel / ngrok) |

### 3. Refresh permalink

**Settings** → **Permalinks** → **Save Changes** (không cần đổi gì)

### 4. Kiểm tra

Mở trình duyệt:

```
https://backlinkbrand.com/chatbot-api/chatbot/widget.js
```

Phải thấy mã JavaScript (không phải 404).

### 5. Dán mã nhúng

Copy mã từ tab Chatbot CSKH (đã dùng `https://backlinkbrand.com/chatbot-api`).

## API chạy máy dev + website trên VPS

VPS **không** truy cập được `127.0.0.1:4000` trên máy bạn.

Chọn một:

- **A.** Deploy API MarketingSpa lên VPS (production)
- **B.** Dùng Cloudflare Tunnel / ngrok expose port 4000 → dán URL tunnel vào plugin upstream

## Kiểm tra bot ACTIVE

Tab Chatbot CSKH → Danh sách → **Kích hoạt** (trạng thái ACTIVE).
