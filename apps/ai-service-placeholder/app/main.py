"""
FastAPI AI Service - PLACEHOLDER cho MVP MarketingSpa.
Chưa triển khai logic AI thực tế.
"""
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="MarketingSpa AI Service", version="0.0.1-placeholder")


class SuggestRequest(BaseModel):
    spa_name: str
    campaign_goal: str


class SuggestResponse(BaseModel):
    suggestion: str
    status: str = "placeholder"


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-placeholder"}


@app.post("/ai/suggest-campaign", response_model=SuggestResponse)
def suggest_campaign(req: SuggestRequest):
    # Placeholder - thay bằng LLM integration sau MVP
    return SuggestResponse(
        suggestion=f"[Placeholder] Gợi ý cho {req.spa_name}: Chiến dịch '{req.campaign_goal}' — giảm 20% gói massage cuối tuần.",
    )
