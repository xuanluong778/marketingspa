"""Structured logging for Chatbot CSKH (AI, crawler, widget)."""

from __future__ import annotations

import logging
from typing import Any

_LOG_AI = logging.getLogger("chatbot_cskh.ai")
_LOG_CRAWL = logging.getLogger("chatbot_cskh.crawl")
_LOG_WIDGET = logging.getLogger("chatbot_cskh.widget")


def _ctx(**kwargs: Any) -> str:
    parts = [f"{k}={v}" for k, v in kwargs.items() if v is not None and v != ""]
    return " ".join(parts)


def log_ai_error(*, bot_id: int | None = None, conversation_id: int | None = None, error: str, exc: BaseException | None = None) -> None:
    msg = _ctx(bot_id=bot_id, conversation_id=conversation_id, error=error[:500])
    if exc is not None:
        _LOG_AI.warning("ai_error %s", msg, exc_info=exc)
    else:
        _LOG_AI.warning("ai_error %s", msg)


def log_crawl_error(*, bot_id: int | None = None, url: str = "", error: str, exc: BaseException | None = None) -> None:
    msg = _ctx(bot_id=bot_id, url=(url or "")[:200], error=error[:500])
    if exc is not None:
        _LOG_CRAWL.warning("crawl_error %s", msg, exc_info=exc)
    else:
        _LOG_CRAWL.warning("crawl_error %s", msg)


def log_widget_error(*, bot_id: int | None = None, code: str = "", client_ip: str = "", detail: str = "") -> None:
    _LOG_WIDGET.info(
        "widget_event %s",
        _ctx(bot_id=bot_id, code=code, ip=client_ip, detail=detail[:300]),
    )


def log_widget_message(
    *,
    bot_id: int | None = None,
    session_id: str = "",
    status_code: str = "ok",
    client_ip: str = "",
    detail: str = "",
) -> None:
    _LOG_WIDGET.info(
        "widget_message %s",
        _ctx(bot_id=bot_id, session_id=(session_id or "")[:64], status=status_code, ip=client_ip, detail=detail[:200]),
    )
