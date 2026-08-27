#!/usr/bin/env python3
"""SMTP send + IMAP fetch for ops alerts and encrypted backups. Never prints secrets."""
from __future__ import annotations

import imaplib
import os
import re
import smtplib
import ssl
import sys
from datetime import datetime, timedelta, timezone
from email import encoders
from email.header import decode_header
from email.message import EmailMessage
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parsedate_to_datetime


def redact(s: str) -> str:
    s = re.sub(r"postgres(?:ql)?://[^@\s'\"]+@", "postgresql://***@", s, flags=re.I)
    s = re.sub(r"redis://[^@\s'\"]+@", "redis://***@", s, flags=re.I)
    s = re.sub(r"(password|secret|token|authorization|api[_-]?key)=[^\s&]+", r"\1=***", s, flags=re.I)
    s = re.sub(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b", "[redacted-email]", s)
    return s


def smtp_conf():
    host = os.environ.get("SMTP_HOST") or ""
    port = int(os.environ.get("SMTP_PORT") or "587")
    user = os.environ.get("SMTP_USER") or ""
    password = os.environ.get("SMTP_PASS") or ""
    raw_from = os.environ.get("SMTP_FROM") or user
    return host, port, user, password, raw_from


def alert_to() -> str:
    return (
        os.environ.get("ALERT_EMAIL_TO")
        or os.environ.get("PLATFORM_SUPER_ADMIN_EMAIL")
        or os.environ.get("SMTP_USER")
        or ""
    ).strip()


def send_smtp(msg) -> None:
    host, port, user, password, _from = smtp_conf()
    if not host or not user or not password:
        raise RuntimeError("smtp_not_configured")
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=30) as s:
            s.login(user, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=30) as s:
            s.starttls(context=ctx)
            s.login(user, password)
            s.send_message(msg)


def cmd_send_alert() -> int:
    to = alert_to()
    if not to:
        print("email_skip=no_recipient", file=sys.stderr)
        return 3
    level = os.environ.get("ALERT_LEVEL") or "INFO"
    code = os.environ.get("ALERT_CODE") or "OPS"
    detail = redact(os.environ.get("ALERT_DETAIL") or "")
    msg = EmailMessage()
    _, _, _, _, raw_from = smtp_conf()
    msg["From"] = raw_from
    msg["To"] = to
    msg["Subject"] = f"[Marketing Auto AZ] {level} {code}"
    msg.set_content(
        "Marketing Auto AZ ops alert\n"
        f"level={level}\n"
        f"code={code}\n"
        f"detail={detail}\n"
        f"time={datetime.now(timezone.utc).isoformat()}\n"
        "No tokens, passwords, or customer records are included.\n"
    )
    send_smtp(msg)
    print("email_sent=1")
    return 0


def cmd_send_backup() -> int:
    path = os.environ.get("BACKUP_ATTACH_PATH") or ""
    filename = os.environ.get("BACKUP_ATTACH_NAME") or os.path.basename(path)
    to = os.environ.get("BACKUP_OFFSITE_EMAIL") or (os.environ.get("SMTP_USER") or "").strip() or alert_to()
    if not path or not os.path.isfile(path):
        raise RuntimeError("backup_attach_missing")
    if not to:
        raise RuntimeError("backup_email_no_recipient")
    size = os.path.getsize(path)
    # Gmail hard limit ~25MB; keep margin
    if size > 20 * 1024 * 1024:
        raise RuntimeError("backup_attach_too_large_for_smtp")
    _, _, _, _, raw_from = smtp_conf()
    msg = MIMEMultipart()
    msg["From"] = raw_from
    msg["To"] = to
    msg["Subject"] = f"MAAZ-BACKUP {filename}"
    msg.attach(
        MIMEText(
            "Encrypted PostgreSQL backup (AES-256-GCM). Private; no plaintext dump.\n"
            f"file={filename}\nsize={size}\n",
            "plain",
            "utf-8",
        )
    )
    part = MIMEBase("application", "octet-stream")
    with open(path, "rb") as f:
        part.set_payload(f.read())
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(part)
    send_smtp(msg)
    print(f"backup_email_sent=1 bytes={size}")
    return 0


def _decode_subj(raw: str) -> str:
    parts = decode_header(raw or "")
    out = []
    for text, enc in parts:
        if isinstance(text, bytes):
            out.append(text.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(text)
    return "".join(out)


def imap_login():
    host = os.environ.get("BACKUP_IMAP_HOST") or "imap.gmail.com"
    user = os.environ.get("SMTP_USER") or ""
    password = (os.environ.get("SMTP_PASS") or "").replace(" ", "")
    if not user or not password:
        raise RuntimeError("imap_not_configured")
    M = imaplib.IMAP4_SSL(host, 993, timeout=45)
    M.login(user, password)
    return M


def cmd_fetch_backup() -> int:
    dest = os.environ.get("BACKUP_FETCH_DEST") or ""
    want = os.environ.get("BACKUP_FETCH_NAME") or ""
    if not dest:
        raise RuntimeError("BACKUP_FETCH_DEST missing")
    M = imap_login()
    try:
        M.select("INBOX")
        typ, data = M.search(None, "SUBJECT", "MAAZ-BACKUP")
        if typ != "OK":
            raise RuntimeError("imap_search_failed")
        ids = (data[0] or b"").split()
        if not ids:
            raise RuntimeError("imap_no_backup_mail")
        chosen = None
        chosen_name = ""
        for uid in reversed(ids):
            typ, fetched = M.fetch(uid, "(RFC822)")
            if typ != "OK" or not fetched or not fetched[0]:
                continue
            raw = fetched[0][1]
            em = __import__("email").message_from_bytes(raw)
            subj = _decode_subj(em.get("Subject") or "")
            for part in em.walk():
                fname = part.get_filename()
                if not fname:
                    continue
                if want and want not in fname and want not in subj:
                    continue
                if not fname.endswith(".enc") and "MAAZ-BACKUP" not in subj:
                    continue
                payload = part.get_payload(decode=True)
                if not payload:
                    continue
                chosen = payload
                chosen_name = fname
                break
            if chosen:
                break
        if not chosen:
            raise RuntimeError("imap_no_attachment")
        os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
        with open(dest, "wb") as f:
            f.write(chosen)
        print(f"fetched={os.path.basename(dest)} name={chosen_name} bytes={len(chosen)}")
        return 0
    finally:
        try:
            M.logout()
        except Exception:
            pass


def cmd_purge() -> int:
    days = int(os.environ.get("BACKUP_RETENTION_DAYS") or "21")
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    M = imap_login()
    deleted = 0
    try:
        M.select("INBOX")
        typ, data = M.search(None, "SUBJECT", "MAAZ-BACKUP")
        if typ != "OK":
            return 0
        for uid in (data[0] or b"").split():
            typ, fetched = M.fetch(uid, "(BODY.PEEK[HEADER.FIELDS (DATE SUBJECT)])")
            if typ != "OK" or not fetched or not fetched[0]:
                continue
            raw = fetched[0][1].decode("utf-8", errors="replace")
            date_line = ""
            for line in raw.splitlines():
                if line.lower().startswith("date:"):
                    date_line = line[5:].strip()
            try:
                dt = parsedate_to_datetime(date_line)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except Exception:
                continue
            if dt < cutoff:
                M.store(uid, "+FLAGS", "\\Deleted")
                deleted += 1
        if deleted:
            M.expunge()
        print(f"purged={deleted}")
        return 0
    finally:
        try:
            M.logout()
        except Exception:
            pass


def main() -> int:
    cmd = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
    try:
        if cmd == "send-alert":
            return cmd_send_alert()
        if cmd == "send-backup":
            return cmd_send_backup()
        if cmd == "fetch-backup":
            return cmd_fetch_backup()
        if cmd == "purge":
            return cmd_purge()
        print("Usage: ops-mail.py send-alert|send-backup|fetch-backup|purge", file=sys.stderr)
        return 2
    except Exception as e:
        print(redact(str(e)), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
