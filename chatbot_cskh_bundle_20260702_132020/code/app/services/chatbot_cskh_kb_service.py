"""Shared chatbot KB service — single source of truth (DB, per user_id + bot_id)."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.chatbot_cskh import ChatbotBot, ChatbotKnowledgeSource
from app.models.chatbot_cskh_kb import ChatbotKbEdge, ChatbotKbMap, ChatbotKbNode
from app.services.chatbot_kb_cache import (
    get_bot_kb_version,
    get_cached_search,
    invalidate_bot_kb_cache,
    make_search_key,
    set_cached_search,
)

MAP_STATUSES = frozenset({"draft", "active", "disabled"})
NODE_TYPES = frozenset({"group", "node"})
RELATION_TYPES = frozenset({"child", "related", "see_also"})
KB_TAGS = frozenset({"dịch vụ", "bảng giá", "chính sách", "faq", "bảo hành", "liên hệ"})

_SOURCE_TAG_MAP = {
    "faq": "faq",
    "business": "dịch vụ",
    "website": "dịch vụ",
}


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _tokenize(query: str) -> list[str]:
    return [t for t in re.split(r"\s+", str(query or "").strip().lower()) if len(t) >= 2]


def _parse_tags(raw: str | list[str] | None) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        items = [str(x).strip().lower() for x in raw if str(x).strip()]
    else:
        text = str(raw).strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    items = [str(x).strip().lower() for x in parsed if str(x).strip()]
                else:
                    items = [text.lower()]
            except json.JSONDecodeError:
                items = [p.strip().lower() for p in re.split(r"[,;|]", text) if p.strip()]
        else:
            items = [p.strip().lower() for p in re.split(r"[,;|]", text) if p.strip()]
    return [t for t in items if t]


def _tags_to_storage(tags: list[str]) -> str:
    clean = [t for t in tags if t]
    return json.dumps(clean, ensure_ascii=False) if clean else ""


def _get_user_bot(db: Session, user_id: int, bot_id: int) -> ChatbotBot:
    row = db.execute(
        select(ChatbotBot).where(ChatbotBot.id == int(bot_id), ChatbotBot.user_id == int(user_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy chatbot.")
    return row


def _get_user_map_for_bot(db: Session, user_id: int, bot_id: int) -> ChatbotKbMap | None:
    return db.execute(
        select(ChatbotKbMap)
        .where(ChatbotKbMap.user_id == int(user_id), ChatbotKbMap.bot_id == int(bot_id))
        .order_by(ChatbotKbMap.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def get_or_create_map(db: Session, user_id: int, bot_id: int, *, title: str = "") -> ChatbotKbMap:
    _get_user_bot(db, user_id, bot_id)
    row = _get_user_map_for_bot(db, user_id, bot_id)
    if row is not None:
        return row
    row = ChatbotKbMap(
        user_id=int(user_id),
        bot_id=int(bot_id),
        title=(title or "Sơ đồ tri thức").strip()[:160],
        status="draft",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _get_user_node(db: Session, user_id: int, node_id: int) -> ChatbotKbNode:
    row = db.execute(
        select(ChatbotKbNode)
        .join(ChatbotKbMap, ChatbotKbMap.id == ChatbotKbNode.map_id)
        .where(ChatbotKbNode.id == int(node_id), ChatbotKbMap.user_id == int(user_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy node kiến thức.")
    return row


def _node_to_dict(row: ChatbotKbNode) -> dict[str, Any]:
    tags = _parse_tags(row.tags)
    return {
        "id": row.id,
        "map_id": row.map_id,
        "parent_id": row.parent_id,
        "node_type": row.node_type,
        "title": row.title,
        "content": row.content or "",
        "tags": tags,
        "priority": int(row.priority or 0),
        "is_active": bool(row.is_active),
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at or row.created_at),
    }


def _edge_to_dict(row: ChatbotKbEdge) -> dict[str, Any]:
    return {
        "id": row.id,
        "map_id": row.map_id,
        "source_node_id": row.source_node_id,
        "target_node_id": row.target_node_id,
        "relation_type": row.relation_type,
    }


def _map_to_dict(row: ChatbotKbMap, *, nodes: list[dict], edges: list[dict]) -> dict[str, Any]:
    return {
        "id": row.id,
        "bot_id": row.bot_id,
        "title": row.title,
        "status": row.status,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at or row.created_at),
        "nodes": nodes,
        "edges": edges,
        "node_count": len(nodes),
        "active_node_count": sum(1 for n in nodes if n.get("is_active")),
    }


def _sync_meta(
    kb_map: ChatbotKbMap | None,
    nodes: list[dict[str, Any]],
    *,
    bot_id: int,
    error: bool = False,
) -> dict[str, Any]:
    if error:
        status = "error"
    elif not nodes or not any(n.get("is_active") for n in nodes if n.get("node_type") != "group"):
        status = "empty"
    elif kb_map is not None and str(kb_map.status or "").lower() == "disabled":
        status = "empty"
    else:
        status = "synced"
    return {
        "sync_status": status,
        "synced_at": _iso(kb_map.updated_at if kb_map else None),
        "cache_version": get_bot_kb_version(bot_id),
    }


def _touch_kb_cache(bot_id: int) -> None:
    invalidate_bot_kb_cache(int(bot_id))


def get_kb_for_bot(db: Session, user_id: int, bot_id: int) -> dict[str, Any]:
    _get_user_bot(db, user_id, bot_id)
    kb_map = _get_user_map_for_bot(db, user_id, bot_id)
    if kb_map is None:
        meta = _sync_meta(None, [], bot_id=int(bot_id))
        return {
            "map": None,
            "bot_id": int(bot_id),
            "nodes": [],
            "edges": [],
            "node_count": 0,
            "active_node_count": 0,
            **meta,
        }
    nodes = db.execute(
        select(ChatbotKbNode)
        .where(ChatbotKbNode.map_id == kb_map.id)
        .order_by(ChatbotKbNode.priority.desc(), ChatbotKbNode.id.asc())
    ).scalars().all()
    edges = db.execute(
        select(ChatbotKbEdge).where(ChatbotKbEdge.map_id == kb_map.id)
    ).scalars().all()
    node_dicts = [_node_to_dict(n) for n in nodes]
    edge_dicts = [_edge_to_dict(e) for e in edges]
    meta = _sync_meta(kb_map, node_dicts, bot_id=int(bot_id))
    return {
        "map": _map_to_dict(kb_map, nodes=node_dicts, edges=edge_dicts),
        "bot_id": int(bot_id),
        "nodes": node_dicts,
        "edges": edge_dicts,
        "node_count": len(node_dicts),
        "active_node_count": sum(1 for n in node_dicts if n.get("is_active")),
        **meta,
    }


def _ensure_parent_in_map(db: Session, map_id: int, parent_id: int | None) -> None:
    if parent_id is None:
        return
    parent = db.execute(
        select(ChatbotKbNode).where(
            ChatbotKbNode.id == int(parent_id),
            ChatbotKbNode.map_id == int(map_id),
        )
    ).scalar_one_or_none()
    if parent is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Node cha không thuộc sơ đồ này.")


def _sync_parent_edge(db: Session, kb_map: ChatbotKbMap, node: ChatbotKbNode) -> None:
    existing = db.execute(
        select(ChatbotKbEdge).where(
            ChatbotKbEdge.map_id == kb_map.id,
            ChatbotKbEdge.target_node_id == node.id,
            ChatbotKbEdge.relation_type == "child",
        )
    ).scalar_one_or_none()
    if node.parent_id:
        if existing:
            if existing.source_node_id != node.parent_id:
                existing.source_node_id = node.parent_id
        else:
            db.add(
                ChatbotKbEdge(
                    map_id=kb_map.id,
                    source_node_id=int(node.parent_id),
                    target_node_id=node.id,
                    relation_type="child",
                )
            )
    elif existing:
        db.delete(existing)


def _refresh_map_status(db: Session, kb_map: ChatbotKbMap) -> None:
    active_count = db.execute(
        select(ChatbotKbNode).where(
            ChatbotKbNode.map_id == kb_map.id,
            ChatbotKbNode.is_active.is_(True),
            ChatbotKbNode.node_type == "node",
        )
    ).scalars().all()
    if active_count:
        if kb_map.status == "draft":
            kb_map.status = "active"
    else:
        if kb_map.status == "active":
            kb_map.status = "draft"


def create_kb_node(
    db: Session,
    user_id: int,
    bot_id: int,
    *,
    title: str,
    content: str = "",
    node_type: str = "node",
    parent_id: int | None = None,
    tags: list[str] | None = None,
    priority: int = 0,
    is_active: bool = True,
    target_node_id: int | None = None,
    relation_type: str = "child",
) -> dict[str, Any]:
    kb_map = get_or_create_map(db, user_id, bot_id)
    nt = str(node_type or "node").strip().lower()
    if nt not in NODE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="node_type không hợp lệ.")
    title_clean = str(title or "").strip()
    if not title_clean:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tiêu đề node bắt buộc.")
    _ensure_parent_in_map(db, kb_map.id, parent_id)
    tag_list = [t.lower() for t in (tags or []) if str(t).strip()]
    row = ChatbotKbNode(
        map_id=kb_map.id,
        parent_id=int(parent_id) if parent_id else None,
        node_type=nt,
        title=title_clean[:200],
        content=str(content or "").strip()[:100_000] or None,
        tags=_tags_to_storage(tag_list),
        priority=int(priority or 0),
        is_active=bool(is_active),
    )
    db.add(row)
    db.flush()
    _sync_parent_edge(db, kb_map, row)
    if target_node_id and relation_type in RELATION_TYPES:
        target = db.execute(
            select(ChatbotKbNode).where(
                ChatbotKbNode.id == int(target_node_id),
                ChatbotKbNode.map_id == kb_map.id,
            )
        ).scalar_one_or_none()
        if target and target.id != row.id:
            dup = db.execute(
                select(ChatbotKbEdge).where(
                    ChatbotKbEdge.map_id == kb_map.id,
                    ChatbotKbEdge.source_node_id == row.id,
                    ChatbotKbEdge.target_node_id == target.id,
                    ChatbotKbEdge.relation_type == relation_type,
                )
            ).scalar_one_or_none()
            if not dup:
                db.add(
                    ChatbotKbEdge(
                        map_id=kb_map.id,
                        source_node_id=row.id,
                        target_node_id=target.id,
                        relation_type=relation_type,
                    )
                )
    _refresh_map_status(db, kb_map)
    db.commit()
    db.refresh(row)
    _touch_kb_cache(kb_map.bot_id)
    return _node_to_dict(row)


def update_kb_node(
    db: Session,
    user_id: int,
    node_id: int,
    *,
    title: str | None = None,
    content: str | None = None,
    node_type: str | None = None,
    parent_id: int | None = None,
    parent_id_set: bool = False,
    tags: list[str] | None = None,
    priority: int | None = None,
    is_active: bool | None = None,
) -> dict[str, Any]:
    row = _get_user_node(db, user_id, node_id)
    kb_map = db.get(ChatbotKbMap, row.map_id)
    if kb_map is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy sơ đồ tri thức.")
    if title is not None:
        title_clean = str(title).strip()
        if not title_clean:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tiêu đề node bắt buộc.")
        row.title = title_clean[:200]
    if content is not None:
        row.content = str(content).strip()[:100_000] or None
    if node_type is not None:
        nt = str(node_type).strip().lower()
        if nt not in NODE_TYPES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="node_type không hợp lệ.")
        row.node_type = nt
    if parent_id_set:
        if parent_id is not None and int(parent_id) == row.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Node không thể là cha của chính nó.")
        _ensure_parent_in_map(db, kb_map.id, parent_id)
        row.parent_id = int(parent_id) if parent_id else None
        _sync_parent_edge(db, kb_map, row)
    if tags is not None:
        row.tags = _tags_to_storage([t.lower() for t in tags if str(t).strip()])
    if priority is not None:
        row.priority = int(priority)
    if is_active is not None:
        row.is_active = bool(is_active)
    _refresh_map_status(db, kb_map)
    db.commit()
    db.refresh(row)
    _touch_kb_cache(kb_map.bot_id)
    return _node_to_dict(row)


def delete_kb_node(db: Session, user_id: int, node_id: int) -> None:
    row = _get_user_node(db, user_id, node_id)
    kb_map = db.get(ChatbotKbMap, row.map_id)
    children = db.execute(
        select(ChatbotKbNode).where(ChatbotKbNode.parent_id == row.id)
    ).scalars().all()
    for child in children:
        child.parent_id = row.parent_id
        if kb_map:
            _sync_parent_edge(db, kb_map, child)
    db.delete(row)
    if kb_map:
        _refresh_map_status(db, kb_map)
        bot_id = int(kb_map.bot_id)
    else:
        bot_id = 0
    db.commit()
    if bot_id:
        _touch_kb_cache(bot_id)


def toggle_kb_node(db: Session, user_id: int, node_id: int) -> dict[str, Any]:
    row = _get_user_node(db, user_id, node_id)
    kb_map = db.get(ChatbotKbMap, row.map_id)
    row.is_active = not bool(row.is_active)
    if kb_map:
        _refresh_map_status(db, kb_map)
    db.commit()
    db.refresh(row)
    if kb_map:
        _touch_kb_cache(kb_map.bot_id)
    return _node_to_dict(row)


def import_kb_from_sources(
    db: Session,
    user_id: int,
    bot_id: int,
    *,
    source_ids: list[int] | None = None,
) -> dict[str, Any]:
    _get_user_bot(db, user_id, bot_id)
    kb_map = get_or_create_map(db, user_id, bot_id)
    q = select(ChatbotKnowledgeSource).where(
        ChatbotKnowledgeSource.user_id == int(user_id),
        ChatbotKnowledgeSource.bot_id == int(bot_id),
        ChatbotKnowledgeSource.status.in_(("ready", "active")),
    )
    if source_ids:
        q = q.where(ChatbotKnowledgeSource.id.in_([int(x) for x in source_ids]))
    sources = db.execute(q.order_by(ChatbotKnowledgeSource.id.asc())).scalars().all()
    existing_titles = {
        n.title.strip().lower()
        for n in db.execute(
            select(ChatbotKbNode).where(ChatbotKbNode.map_id == kb_map.id)
        ).scalars().all()
    }
    imported = 0
    skipped = 0
    for src in sources:
        content = (src.content or "").strip()
        title_key = (src.title or "").strip().lower()
        if not content:
            skipped += 1
            continue
        if title_key in existing_titles:
            skipped += 1
            continue
        tag = _SOURCE_TAG_MAP.get(str(src.source_type or "").lower(), "faq")
        db.add(
            ChatbotKbNode(
                map_id=kb_map.id,
                parent_id=None,
                node_type="node",
                title=(src.title or "Nguồn dữ liệu")[:200],
                content=content[:100_000],
                tags=_tags_to_storage([tag]),
                priority=0,
                is_active=True,
            )
        )
        existing_titles.add(title_key)
        imported += 1
    _refresh_map_status(db, kb_map)
    db.commit()
    _touch_kb_cache(int(bot_id))
    return {"imported": imported, "skipped": skipped, "map_id": kb_map.id}


def list_import_sources(db: Session, user_id: int, bot_id: int) -> list[dict[str, Any]]:
    _get_user_bot(db, user_id, bot_id)
    kb_map = _get_user_map_for_bot(db, user_id, bot_id)
    existing_titles: set[str] = set()
    if kb_map is not None:
        existing_titles = {
            n.title.strip().lower()
            for n in db.execute(
                select(ChatbotKbNode).where(ChatbotKbNode.map_id == kb_map.id)
            ).scalars().all()
        }
    rows = db.execute(
        select(ChatbotKnowledgeSource)
        .where(
            ChatbotKnowledgeSource.user_id == int(user_id),
            ChatbotKnowledgeSource.bot_id == int(bot_id),
            ChatbotKnowledgeSource.status.in_(("ready", "active")),
        )
        .order_by(ChatbotKnowledgeSource.updated_at.desc(), ChatbotKnowledgeSource.id.desc())
    ).scalars().all()
    out: list[dict[str, Any]] = []
    for row in rows:
        content = (row.content or "").strip()
        title_key = (row.title or "").strip().lower()
        out.append(
            {
                "source_id": row.id,
                "title": row.title,
                "source_type": row.source_type,
                "content_preview": content[:200],
                "has_content": bool(content),
                "already_imported": title_key in existing_titles if title_key else False,
            }
        )
    return out


def _parse_csv_rows(text: str) -> list[dict[str, Any]]:
    import csv
    import io

    raw = str(text or "").strip()
    if not raw:
        return []
    reader = csv.DictReader(io.StringIO(raw))
    items: list[dict[str, Any]] = []
    for row in reader:
        title = str(row.get("title") or row.get("tiêu đề") or row.get("tieu_de") or "").strip()
        content = str(row.get("content") or row.get("nội dung") or row.get("noi_dung") or "").strip()
        tags_raw = str(row.get("tags") or row.get("tag") or "").strip()
        tags = _parse_tags(tags_raw) if tags_raw else []
        if title and content:
            items.append({"title": title, "content": content, "tags": tags})
    return items


def _parse_bulk_text(text: str, *, default_title: str = "") -> list[dict[str, Any]]:
    raw = str(text or "").strip()
    if not raw:
        return []
    blocks = [b.strip() for b in re.split(r"\n-{3,}\n", raw) if b.strip()]
    if len(blocks) <= 1:
        title = str(default_title or "").strip() or "Nội dung import"
        return [{"title": title[:200], "content": raw[:100_000], "tags": []}]
    items: list[dict[str, Any]] = []
    for block in blocks:
        lines = block.splitlines()
        title = lines[0].strip().lstrip("#").strip() if lines else "Node import"
        body = "\n".join(lines[1:]).strip() if len(lines) > 1 else block
        if not body:
            body = block
        items.append({"title": title[:200], "content": body[:100_000], "tags": []})
    return items


def import_kb_items(
    db: Session,
    user_id: int,
    bot_id: int,
    *,
    items: list[dict[str, Any]],
    parent_id: int | None = None,
) -> dict[str, Any]:
    _get_user_bot(db, user_id, bot_id)
    kb_map = get_or_create_map(db, user_id, bot_id)
    if parent_id is not None:
        _ensure_parent_in_map(db, kb_map.id, parent_id)
    existing_titles = {
        n.title.strip().lower()
        for n in db.execute(
            select(ChatbotKbNode).where(ChatbotKbNode.map_id == kb_map.id)
        ).scalars().all()
    }
    imported = 0
    skipped = 0
    for item in items:
        title = str(item.get("title") or "").strip()
        content = str(item.get("content") or "").strip()
        if not title or not content or len(content) < 2:
            skipped += 1
            continue
        title_key = title.lower()
        if title_key in existing_titles:
            skipped += 1
            continue
        tags = item.get("tags") or []
        if isinstance(tags, str):
            tags = _parse_tags(tags)
        node_type = str(item.get("node_type") or "node").strip().lower()
        if node_type not in NODE_TYPES:
            node_type = "node"
        db.add(
            ChatbotKbNode(
                map_id=kb_map.id,
                parent_id=int(parent_id) if parent_id else None,
                node_type=node_type,
                title=title[:200],
                content=content[:100_000],
                tags=_tags_to_storage([str(t).lower() for t in tags if str(t).strip()]),
                priority=int(item.get("priority") or 0),
                is_active=bool(item.get("is_active", True)),
            )
        )
        existing_titles.add(title_key)
        imported += 1
    _refresh_map_status(db, kb_map)
    db.commit()
    _touch_kb_cache(int(bot_id))
    return {"imported": imported, "skipped": skipped, "map_id": kb_map.id}


def import_kb_text(
    db: Session,
    user_id: int,
    bot_id: int,
    *,
    title: str = "",
    content: str = "",
    tags: list[str] | None = None,
    format: str = "plain",
    parent_id: int | None = None,
) -> dict[str, Any]:
    fmt = str(format or "plain").strip().lower()
    text = str(content or "").strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nội dung import trống.")
    if fmt == "csv":
        items = _parse_csv_rows(text)
    elif fmt == "bulk":
        items = _parse_bulk_text(text, default_title=title)
    else:
        title_clean = str(title or "").strip() or "Nội dung import"
        items = [{"title": title_clean, "content": text, "tags": tags or []}]
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không đọc được dữ liệu import.")
    return import_kb_items(db, user_id, bot_id, items=items, parent_id=parent_id)


def _search_kb_nodes_db(
    db: Session,
    *,
    bot_id: int,
    user_id: int,
    query: str,
    limit: int = 5,
) -> list[dict[str, Any]]:
    tokens = _tokenize(query)
    if not tokens:
        return []
    kb_map = db.execute(
        select(ChatbotKbMap)
        .where(
            ChatbotKbMap.bot_id == int(bot_id),
            ChatbotKbMap.user_id == int(user_id),
            ChatbotKbMap.status.in_(("active", "draft")),
        )
        .order_by(ChatbotKbMap.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    if kb_map is None or kb_map.status == "disabled":
        return []
    rows = db.execute(
        select(ChatbotKbNode)
        .where(
            ChatbotKbNode.map_id == kb_map.id,
            ChatbotKbNode.is_active.is_(True),
            ChatbotKbNode.node_type == "node",
        )
        .limit(200)
    ).scalars().all()
    scored: list[tuple[int, ChatbotKbNode]] = []
    for row in rows:
        content = row.content or ""
        if not content.strip():
            continue
        tag_text = " ".join(_parse_tags(row.tags))
        hay = f"{row.title} {content} {tag_text}".lower()
        score = sum(2 if t in (row.title or "").lower() else 1 for t in tokens if t in hay)
        score += int(row.priority or 0)
        if score > 0:
            scored.append((score, row))
    scored.sort(key=lambda x: (-x[0], -len(x[1].content or "")))
    out: list[dict[str, Any]] = []
    for score, row in scored[: max(1, limit)]:
        out.append(
            {
                "node_id": row.id,
                "title": row.title,
                "content": (row.content or "")[:4000],
                "tags": _parse_tags(row.tags),
                "score": score,
                "source": "kb_map",
            }
        )
    return out


def search_kb_nodes(
    db: Session,
    *,
    bot_id: int,
    user_id: int,
    query: str,
    limit: int = 5,
) -> list[dict[str, Any]]:
    bid = int(bot_id)
    key = make_search_key(user_id=int(user_id), query=query, limit=limit)
    cached = get_cached_search(bid, key)
    if cached is not None:
        return cached
    result = _search_kb_nodes_db(db, bot_id=bid, user_id=int(user_id), query=query, limit=limit)
    set_cached_search(bid, key, result)
    return result
