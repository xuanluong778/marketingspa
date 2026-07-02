"""Extract clean page text for Chatbot CSKH knowledge (no AI)."""

from __future__ import annotations

import ipaddress
import re
from typing import Any
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup, NavigableString, Tag

from app.services.cost_control.executor import execute_guarded_external
from app.services.cost_control.settings import cost_control_enforced
from app.services.cost_control.types import ExternalApiProvider

_USER_AGENT = (
    "Mozilla/5.0 (compatible; SEOAuto-ChatbotCrawler/1.0; +https://seoauto.vn)"
)
_FETCH_TIMEOUT = 25
_MAX_HTML_BYTES = 800_000
_MAX_CONTENT_CHARS = 50_000

_JUNK_TAGS = frozenset(
    {"script", "style", "noscript", "svg", "iframe", "nav", "footer", "header", "aside", "form", "button"}
)
_JUNK_CLASS_ID_RE = re.compile(
    r"(menu|nav|navbar|footer|sidebar|breadcrumb|cookie|popup|modal|social|widget|comment|banner|ads|advert)",
    re.I,
)
_WS_RE = re.compile(r"\s+")


class CrawlValidationError(ValueError):
    pass


class CrawlFetchError(RuntimeError):
    pass


def _normalize_url(url: str) -> str:
    raw = str(url or "").strip()
    if not raw:
        raise CrawlValidationError("URL không được để trống.")
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise CrawlValidationError("URL phải bắt đầu bằng http:// hoặc https://")
    if not parsed.netloc:
        raise CrawlValidationError("URL không hợp lệ.")
    host = parsed.hostname or ""
    if not host:
        raise CrawlValidationError("URL không hợp lệ.")
    lowered = host.lower()
    if lowered in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
        raise CrawlValidationError("Không quét URL nội bộ.")
    try:
        ip = ipaddress.ip_address(lowered)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise CrawlValidationError("Không quét URL nội bộ.")
    except ValueError:
        pass
    return raw


def _clean_text(text: str) -> str:
    t = _WS_RE.sub(" ", str(text or "")).strip()
    if len(t) < 3:
        return ""
    if t.lower() in {"home", "menu", "read more", "xem thêm", "đọc thêm"}:
        return ""
    return t


def _is_junk_element(el: Tag) -> bool:
    cls = " ".join(el.get("class") or [])
    el_id = str(el.get("id") or "")
    role = str(el.get("role") or "").lower()
    if role in ("navigation", "banner", "contentinfo"):
        return True
    return bool(_JUNK_CLASS_ID_RE.search(cls) or _JUNK_CLASS_ID_RE.search(el_id))


def _remove_junk(soup: BeautifulSoup) -> None:
    for tag_name in _JUNK_TAGS:
        for tag in soup.find_all(tag_name):
            tag.decompose()
    for el in list(soup.find_all(True)):
        if isinstance(el, Tag) and _is_junk_element(el) and el.name in ("div", "section", "ul", "ol", "span"):
            el.decompose()


def _text_from_node(node: Tag | NavigableString | None) -> str:
    if node is None:
        return ""
    if isinstance(node, NavigableString):
        return _clean_text(str(node))
    return _clean_text(node.get_text(" ", strip=True))


def _extract_faq(soup: BeautifulSoup) -> list[str]:
    out: list[str] = []
    for details in soup.find_all("details", limit=20):
        summary = details.find("summary")
        body_parts = []
        for child in details.children:
            if child is summary or (isinstance(child, Tag) and child.name == "summary"):
                continue
            t = _text_from_node(child)
            if t:
                body_parts.append(t)
        q = _text_from_node(summary)
        a = _clean_text(" ".join(body_parts))
        if q and a:
            out.append(f"Q: {q}\nA: {a}")
    for dl in soup.find_all("dl", limit=10):
        dts = dl.find_all("dt", limit=20)
        for dt in dts:
            dd = dt.find_next_sibling("dd")
            q = _text_from_node(dt)
            a = _text_from_node(dd)
            if q and a:
                out.append(f"Q: {q}\nA: {a}")
    for block in soup.find_all(class_=re.compile(r"faq", re.I), limit=10):
        for h in block.find_all(["h2", "h3", "h4", "strong"], limit=20):
            q = _text_from_node(h)
            if not q:
                continue
            nxt = h.find_next_sibling(["p", "div"])
            a = _text_from_node(nxt)
            if a:
                out.append(f"Q: {q}\nA: {a}")
    return out


def _extract_service_blocks(soup: BeautifulSoup) -> list[str]:
    out: list[str] = []
    selectors = [
        "[class*='service']",
        "[class*='pricing']",
        "[class*='price']",
        "[id*='service']",
        "[id*='pricing']",
    ]
    seen: set[str] = set()
    for sel in selectors:
        for block in soup.select(sel)[:12]:
            if _is_junk_element(block):
                continue
            heading = block.find(["h1", "h2", "h3", "h4"])
            title = _text_from_node(heading)
            paras = [_text_from_node(p) for p in block.find_all("p", limit=6)]
            paras = [p for p in paras if len(p) >= 20]
            if not paras and not title:
                continue
            chunk = title + "\n" + "\n".join(paras) if title else "\n".join(paras)
            chunk = chunk.strip()
            if len(chunk) < 25 or chunk in seen:
                continue
            seen.add(chunk)
            out.append(chunk[:1200])
    return out


def extract_clean_page_text(html: str, *, page_url: str = "") -> dict[str, Any]:
    raw = str(html or "")[:_MAX_HTML_BYTES]
    if not raw.strip():
        return {"ok": False, "title": "", "content": "", "message": "Trang trống."}

    soup = BeautifulSoup(raw, "html.parser")
    _remove_junk(soup)

    parts: list[str] = []
    title = _text_from_node(soup.title) if soup.title else ""
    if title:
        parts.append(f"# {title}")

    meta = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
    if meta and meta.get("content"):
        desc = _clean_text(str(meta.get("content")))
        if desc:
            parts.append(f"Mô tả: {desc}")

    og_desc = soup.find("meta", attrs={"property": re.compile(r"og:description", re.I)})
    if og_desc and og_desc.get("content"):
        desc = _clean_text(str(og_desc.get("content")))
        if desc and desc not in parts[-1] if parts else True:
            parts.append(f"Mô tả: {desc}")

    for h1 in soup.find_all("h1", limit=4):
        t = _text_from_node(h1)
        if t:
            parts.append(f"## {t}")

    for h2 in soup.find_all("h2", limit=20):
        t = _text_from_node(h2)
        if t:
            parts.append(f"### {t}")

    faq_bits = _extract_faq(soup)
    if faq_bits:
        parts.append("## FAQ")
        parts.extend(faq_bits[:15])

    service_bits = _extract_service_blocks(soup)
    if service_bits:
        parts.append("## Dịch vụ / Bảng giá")
        parts.extend(service_bits[:10])

    main = soup.find("main") or soup.find("article") or soup.find(attrs={"role": "main"}) or soup.body
    root = main if main else soup
    para_seen: set[str] = set()
    for p in root.find_all("p", limit=60):
        if _is_junk_element(p):
            continue
        t = _text_from_node(p)
        if len(t) < 35 or t in para_seen:
            continue
        para_seen.add(t)
        parts.append(t)

    content = "\n\n".join(parts).strip()
    content = re.sub(r"\n{3,}", "\n\n", content)[:_MAX_CONTENT_CHARS]
    if len(content) < 40:
        return {
            "ok": False,
            "title": title,
            "content": "",
            "message": "Không trích xuất được nội dung hữu ích từ trang.",
            "page_url": page_url,
        }
    return {"ok": True, "title": title, "content": content, "message": "", "page_url": page_url}


def fetch_and_extract_url(url: str) -> dict[str, Any]:
    normalized = _normalize_url(url)

    def _fetch() -> requests.Response:
        return requests.get(
            normalized,
            headers={"User-Agent": _USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"},
            timeout=_FETCH_TIMEOUT,
            allow_redirects=True,
        )

    try:
        if cost_control_enforced():
            resp = execute_guarded_external(ExternalApiProvider.CRAWL, "cskh_fetch_page", _fetch)
        else:
            resp = _fetch()
    except requests.RequestException as exc:
        raise CrawlFetchError(f"Không tải được trang: {exc}") from exc

    if resp.status_code >= 400:
        raise CrawlFetchError(f"HTTP {resp.status_code} khi tải trang.")

    ctype = str(resp.headers.get("content-type") or "").lower()
    if "html" not in ctype and "text" not in ctype:
        raise CrawlFetchError("URL không trả về nội dung HTML.")

    result = extract_clean_page_text(resp.text or "", page_url=normalized)
    if not result.get("ok"):
        raise CrawlFetchError(str(result.get("message") or "Không trích xuất được nội dung."))
    return result
