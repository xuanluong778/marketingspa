# AI Service Placeholder - FastAPI

# MVP: Chưa triển khai sâu. Thư mục này dành cho tích hợp AI sau (gợi ý nội dung, phân khúc khách hàng...)

## Cấu trúc dự kiến

```
ai-service-placeholder/
├── app/
│   └── main.py          # FastAPI entry (placeholder)
├── requirements.txt
├── Dockerfile
└── README.md
```

## Chạy local (tùy chọn)

```bash
cd apps/ai-service-placeholder
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Endpoints placeholder

- `GET /health` — health check
- `POST /ai/suggest-campaign` — trả về mock response

## Tích hợp sau MVP

1. Kết nối từ `apps/api` qua `AI_SERVICE_URL`
2. Queue job riêng cho AI tasks
3. Auth nội bộ (API key) giữa api ↔ ai-service
