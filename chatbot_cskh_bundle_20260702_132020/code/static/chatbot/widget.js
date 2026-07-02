/**
 * SEOAuto Chatbot CSKH — embeddable website widget
 * <script src="https://seoauto.vn/chatbot/widget.js" data-bot-id="123"></script>
 */
(function () {
    "use strict";

    var script = document.currentScript;
    if (!script) return;

    var botId = String(script.getAttribute("data-bot-id") || "").trim();
    if (!botId) return;

    var apiOrigin;
    try {
        apiOrigin = new URL(script.src).origin;
    } catch (_e) {
        apiOrigin = "https://seoauto.vn";
    }

    var API = apiOrigin + "/api/chatbot/public";
    var LAUNCHER_IMG = apiOrigin + "/static/chatbot/cskh-launcher.png?v=1";
    var STORAGE_KEY = "seoauto_cskh_sid_" + botId;
    var sessionId = "";
    try {
        sessionId = localStorage.getItem(STORAGE_KEY) || "";
    } catch (_e2) {}

    var state = {
        open: false,
        blocked: false,
        blockedMsg: "",
        botName: "Chatbot",
        greeting: "",
        avatarUrl: LAUNCHER_IMG,
        hotline: "",
        messages: [],
        showLead: false,
        leadSubmitted: false,
        loading: false,
        lastSendAt: 0,
    };

    var MIN_SEND_MS = 2000;

    var root = document.createElement("div");
    root.id = "seoauto-cskh-widget";
    root.setAttribute("data-bot-id", botId);
    document.body.appendChild(root);

    var style = document.createElement("style");
    style.textContent = [
        "#seoauto-cskh-widget{--sa-primary:#4f46e5;--sa-bg:#fff;--sa-text:#0f172a;--sa-muted:#64748b;--sa-border:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.45;z-index:2147483000;position:fixed;right:16px;bottom:16px}",
        "#seoauto-cskh-widget *{box-sizing:border-box}",
        ".sa-cskh-launcher{width:64px;height:64px;border-radius:50%;border:none;background:transparent;padding:0;cursor:pointer;box-shadow:0 8px 28px rgba(79,70,229,.28);display:flex;align-items:center;justify-content:center;transition:transform .15s,box-shadow .15s;overflow:hidden}",
        ".sa-cskh-launcher:hover{transform:scale(1.05);box-shadow:0 10px 32px rgba(79,70,229,.35)}",
        ".sa-cskh-launcher img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}",
        ".sa-cskh-panel{display:none;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 96px));background:var(--sa-bg);border-radius:16px;box-shadow:0 16px 48px rgba(15,23,42,.18);overflow:hidden;flex-direction:column;border:1px solid var(--sa-border)}",
        ".sa-cskh-panel.is-open{display:flex}",
        ".sa-cskh-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff}",
        ".sa-cskh-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;background:#fff}",
        ".sa-cskh-head-text{flex:1;min-width:0}",
        ".sa-cskh-head-text strong{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".sa-cskh-head-text span{font-size:12px;opacity:.9}",
        ".sa-cskh-close{background:rgba(255,255,255,.2);border:none;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px;line-height:1}",
        ".sa-cskh-body{flex:1;overflow:auto;padding:12px;background:#f8fafc}",
        ".sa-cskh-msg{max-width:88%;margin:0 0 10px;padding:10px 12px;border-radius:12px;word-break:break-word}",
        ".sa-cskh-msg--bot{background:#fff;border:1px solid var(--sa-border);color:var(--sa-text)}",
        ".sa-cskh-msg--user{margin-left:auto;background:var(--sa-primary);color:#fff}",
        ".sa-cskh-msg--sys{background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:13px}",
        ".sa-cskh-msg--typing{background:#fff;border:1px solid var(--sa-border);color:var(--sa-muted);font-style:italic;font-size:13px}",
        ".sa-cskh-lead{margin-top:8px;padding:12px;background:#fff;border:1px solid var(--sa-border);border-radius:12px}",
        ".sa-cskh-lead label{display:block;font-size:12px;color:var(--sa-muted);margin:0 0 4px}",
        ".sa-cskh-lead input,.sa-cskh-lead textarea{width:100%;border:1px solid var(--sa-border);border-radius:8px;padding:8px 10px;margin:0 0 8px;font:inherit}",
        ".sa-cskh-lead textarea{min-height:64px;resize:vertical}",
        ".sa-cskh-lead button{width:100%;border:none;border-radius:8px;padding:10px;background:var(--sa-primary);color:#fff;font-weight:600;cursor:pointer}",
        ".sa-cskh-foot{padding:10px;border-top:1px solid var(--sa-border);background:#fff;display:flex;gap:8px}",
        ".sa-cskh-foot input{flex:1;border:1px solid var(--sa-border);border-radius:10px;padding:10px 12px;font:inherit}",
        ".sa-cskh-foot button{border:none;border-radius:10px;padding:0 14px;background:var(--sa-primary);color:#fff;font-weight:600;cursor:pointer}",
        ".sa-cskh-foot button:disabled{opacity:.55;cursor:not-allowed}",
        "@media(max-width:480px){#seoauto-cskh-widget{right:10px;bottom:10px}.sa-cskh-panel{width:calc(100vw - 20px);height:calc(100vh - 80px)}}",
    ].join("");
    document.head.appendChild(style);

    function esc(s) {
        return String(s || "").replace(/[&<>"']/g, function (c) {
            return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
        });
    }

    function fmtReply(text) {
        return esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    }

    function pageUrl() {
        try {
            return window.location.href || "";
        } catch (_e) {
            return "";
        }
    }

    function extractReply(data) {
        if (!data || typeof data !== "object") return "";
        return String(data.reply || data.message || "").trim();
    }

    async function apiPost(path, body) {
        var r = await fetch(API + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            mode: "cors",
            credentials: "omit",
        });
        var data = {};
        try {
            data = await r.json();
        } catch (_e) {}
        return { ok: r.ok, status: r.status, data: data };
    }

    async function apiGet(path) {
        var r = await fetch(API + path, { method: "GET", mode: "cors", credentials: "omit" });
        var data = {};
        try {
            data = await r.json();
        } catch (_e) {}
        return { ok: r.ok, status: r.status, data: data };
    }

    function saveSession(sid) {
        if (!sid) return;
        sessionId = sid;
        try {
            localStorage.setItem(STORAGE_KEY, sid);
        } catch (_e) {}
    }

    function setComposerEnabled(enabled) {
        var footInput = root.querySelector(".sa-cskh-input");
        var footBtn = root.querySelector(".sa-cskh-send");
        if (footInput) footInput.disabled = !enabled || state.blocked;
        if (footBtn) footBtn.disabled = !enabled || state.blocked;
    }

    function renderMessages() {
        var body = root.querySelector(".sa-cskh-body");
        if (!body) return;
        var html = "";
        state.messages.forEach(function (m) {
            var cls = m.role === "user" ? "sa-cskh-msg--user" : m.role === "sys" ? "sa-cskh-msg--sys" : m.role === "typing" ? "sa-cskh-msg--typing" : "sa-cskh-msg--bot";
            html += '<div class="sa-cskh-msg ' + cls + '">' + (m.role === "bot" ? fmtReply(m.text) : esc(m.text)) + "</div>";
        });
        if (state.loading) {
            html += '<div class="sa-cskh-msg sa-cskh-msg--typing">Đang trả lời…</div>';
        }
        if (state.showLead && !state.leadSubmitted) {
            html += '<div class="sa-cskh-lead">' +
                '<label>Họ tên</label><input type="text" class="sa-lead-name" placeholder="Tên của bạn">' +
                '<label>Số điện thoại *</label><input type="tel" class="sa-lead-phone" placeholder="09xxxxxxxx">' +
                '<label>Nhu cầu</label><textarea class="sa-lead-need" placeholder="Bạn cần tư vấn gì?"></textarea>' +
                '<button type="button" class="sa-lead-submit">Gửi thông tin</button></div>';
        }
        body.innerHTML = html;
        body.scrollTop = body.scrollHeight;
        var btn = body.querySelector(".sa-lead-submit");
        if (btn) btn.addEventListener("click", submitLead);
    }

    function renderShell() {
        root.innerHTML =
            '<div class="sa-cskh-panel' + (state.open ? " is-open" : "") + '">' +
            '<div class="sa-cskh-head">' +
            '<img class="sa-cskh-avatar" src="' + esc(state.avatarUrl) + '" alt="">' +
            '<div class="sa-cskh-head-text"><strong>' + esc(state.botName) + "</strong>" +
            "<span>Trợ lý ảo</span></div>" +
            '<button type="button" class="sa-cskh-close" aria-label="Đóng">×</button></div>' +
            '<div class="sa-cskh-body"></div>' +
            '<div class="sa-cskh-foot">' +
            '<input type="text" class="sa-cskh-input" placeholder="Nhập tin nhắn…" maxlength="2000"' +
            (state.blocked ? " disabled" : "") + ">" +
            '<button type="button" class="sa-cskh-send"' + (state.blocked ? " disabled" : "") + ">Gửi</button></div></div>" +
            '<button type="button" class="sa-cskh-launcher" aria-label="Mở chat">' +
            '<img src="' + esc(state.avatarUrl || LAUNCHER_IMG) + '" alt="Chatbot CSKH" width="64" height="64" loading="lazy" decoding="async"></button>';

        root.querySelector(".sa-cskh-launcher").addEventListener("click", toggleOpen);
        root.querySelector(".sa-cskh-close").addEventListener("click", function () {
            state.open = false;
            renderShell();
            renderMessages();
        });
        var sendBtn = root.querySelector(".sa-cskh-send");
        var input = root.querySelector(".sa-cskh-input");
        if (sendBtn) sendBtn.addEventListener("click", sendMessage);
        if (input) {
            input.addEventListener("keydown", function (e) {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }
        renderMessages();
    }

    function toggleOpen() {
        state.open = !state.open;
        var panel = root.querySelector(".sa-cskh-panel");
        var launcher = root.querySelector(".sa-cskh-launcher");
        if (panel) panel.classList.toggle("is-open", state.open);
        if (launcher) launcher.style.display = state.open ? "none" : "flex";
        if (state.open) {
            var body = root.querySelector(".sa-cskh-body");
            if (body) body.scrollTop = body.scrollHeight;
        }
    }

    async function sendMessage() {
        if (state.blocked || state.loading) return;
        var now = Date.now();
        if (state.lastSendAt && now - state.lastSendAt < MIN_SEND_MS) {
            state.messages.push({ role: "sys", text: "Vui lòng đợi vài giây trước khi gửi tiếp." });
            renderMessages();
            return;
        }
        var input = root.querySelector(".sa-cskh-input");
        var text = input ? String(input.value || "").trim() : "";
        if (!text) return;
        state.loading = true;
        state.lastSendAt = now;
        state.messages.push({ role: "user", text: text });
        if (input) input.value = "";
        setComposerEnabled(false);
        renderMessages();
        try {
            var res = await apiPost("/message", {
                bot_id: Number(botId),
                message: text,
                session_id: sessionId || null,
                page_url: pageUrl(),
            });
            var data = res.data || {};
            if (data.session_id) saveSession(data.session_id);
            var replyText = extractReply(data);
            if (!res.ok && !replyText) {
                replyText = "Không gửi được tin nhắn (mã " + res.status + "). Vui lòng thử lại.";
            }
            if (data.code === "rate_limited" || (data.blocked && data.code === "rate_limited")) {
                state.messages.push({ role: "sys", text: replyText || "Bạn gửi quá nhanh. Vui lòng đợi vài giây." });
            } else if (data.blocked) {
                state.blocked = true;
                state.blockedMsg = replyText || "Chatbot tạm ngưng.";
                state.messages.push({ role: "sys", text: state.blockedMsg });
            } else if (replyText) {
                state.messages.push({ role: "bot", text: replyText });
                if (data.show_lead_form) state.showLead = true;
            } else {
                state.messages.push({
                    role: "sys",
                    text: "Không nhận được phản hồi từ server. Vui lòng thử lại sau.",
                });
            }
        } catch (_err) {
            state.messages.push({
                role: "sys",
                text: "Mất kết nối tới server chatbot. Kiểm tra mạng và thử lại.",
            });
        } finally {
            state.loading = false;
            setComposerEnabled(!state.blocked);
            renderMessages();
        }
    }

    async function submitLead() {
        var body = root.querySelector(".sa-cskh-body");
        if (!body) return;
        var name = (body.querySelector(".sa-lead-name") || {}).value || "";
        var phone = String((body.querySelector(".sa-lead-phone") || {}).value || "").trim();
        var need = (body.querySelector(".sa-lead-need") || {}).value || "";
        if (phone.length < 6) {
            state.messages.push({ role: "sys", text: "Vui lòng nhập số điện thoại hợp lệ." });
            renderMessages();
            return;
        }
        var leadRes = await apiPost("/lead", {
            bot_id: Number(botId),
            session_id: sessionId || null,
            name: name.trim(),
            phone: phone,
            need: need.trim(),
            page_url: pageUrl(),
        });
        var data = leadRes.data || {};
        if (data.session_id) saveSession(data.session_id);
        state.leadSubmitted = true;
        state.showLead = false;
        state.messages.push({ role: "bot", text: data.message || "Cảm ơn bạn! Chúng tôi sẽ liên hệ sớm." });
        renderMessages();
    }

    async function init() {
        renderShell();
        var cfgRes = await apiGet(
            "/config?bot_id=" + encodeURIComponent(botId) +
            "&page_url=" + encodeURIComponent(pageUrl())
        );
        var cfg = cfgRes.data || {};
        if (cfg.bot_name) state.botName = cfg.bot_name;
        if (cfg.avatar_url) state.avatarUrl = cfg.avatar_url;
        else state.avatarUrl = LAUNCHER_IMG;
        if (cfg.hotline) state.hotline = cfg.hotline;
        if (cfg.blocked) {
            state.blocked = true;
            state.blockedMsg = extractReply(cfg) || "Chatbot tạm ngưng.";
            state.messages.push({ role: "sys", text: state.blockedMsg });
        } else {
            var greet = cfg.greeting || "Xin chào! Tôi có thể hỗ trợ gì cho bạn?";
            state.greeting = greet;
            if (!state.messages.length) {
                state.messages.push({ role: "bot", text: greet });
            }
        }
        renderShell();
        renderMessages();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
