"""Chatbot CSKH — auto-detect lead info from visitor messages."""

from __future__ import annotations

import re
from typing import Any

_PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?84|0)(?:3|5|7|8|9)\d{8}(?!\d)",
    re.IGNORECASE,
)
_NAME_PATTERNS = (
    re.compile(r"(?:tên\s*(?:tôi|em|mình|của\s*tôi)\s*(?:là|:)\s*)([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ\s]{1,40})", re.I),
    re.compile(r"(?:tôi\s+là|em\s+là|mình\s+là)\s+([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ\s]{1,40})", re.I),
)
_NEED_PATTERNS = (
    re.compile(r"(?:cần|muốn|đang\s+tìm|quan\s+tâm)\s+(.{8,200})", re.I),
    re.compile(r"(?:tư\s+vấn|hỏi)\s+(?:về\s+)?(.{8,200})", re.I),
)


def _normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", str(raw or ""))
    if digits.startswith("84") and len(digits) >= 11:
        digits = "0" + digits[2:]
    if len(digits) == 9 and digits[0] in "35789":
        digits = "0" + digits
    return digits[:32] if len(digits) >= 9 else ""


def extract_phone(text: str) -> str:
    for m in _PHONE_RE.finditer(str(text or "")):
        phone = _normalize_phone(m.group(0))
        if len(phone) >= 10:
            return phone
    return ""


def extract_name(text: str) -> str:
    t = str(text or "").strip()
    for pat in _NAME_PATTERNS:
        m = pat.search(t)
        if m:
            name = str(m.group(1) or "").strip()
            if 2 <= len(name) <= 80:
                return name[:120]
    return ""


def extract_need(text: str) -> str:
    t = str(text or "").strip()
    for pat in _NEED_PATTERNS:
        m = pat.search(t)
        if m:
            need = str(m.group(1) or "").strip().rstrip(".,;")
            if len(need) >= 8:
                return need[:2000]
    if len(t) >= 15 and not extract_phone(t):
        return t[:2000]
    return ""


def detect_lead_from_text(text: str) -> dict[str, Any]:
    phone = extract_phone(text)
    name = extract_name(text)
    need = extract_need(text) if phone or name else ""
    return {
        "phone": phone,
        "name": name,
        "need": need,
        "has_lead_signal": bool(phone or (name and need)),
    }
