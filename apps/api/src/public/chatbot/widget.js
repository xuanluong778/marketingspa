/**
 * MarketingSpa Chatbot CSKH — embeddable website widget
 * <script src="https://api-domain.com/chatbot/widget.js?v=2" data-bot-id="UUID" data-api-url="https://api-domain.com"></script>
 */
(function () {
  'use strict';

  var WIDGET_VERSION = '3';

  function resolveScript() {
    var current = document.currentScript;
    if (current && current.getAttribute('data-bot-id')) return current;
    var scripts = document.querySelectorAll('script[data-bot-id]');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = String(scripts[i].src || '');
      if (src.indexOf('widget.js') !== -1) return scripts[i];
    }
    return scripts.length ? scripts[scripts.length - 1] : null;
  }

  function whenDomReady(fn) {
    if (document.body) {
      fn();
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
      return;
    }
    var tries = 0;
    var timer = window.setInterval(function () {
      tries += 1;
      if (document.body || tries > 80) {
        window.clearInterval(timer);
        if (document.body) fn();
        else console.warn('[MarketingSpa Chatbot] Không tìm thấy document.body.');
      }
    }, 50);
  }

  var script = resolveScript();
  if (!script) {
    console.warn('[MarketingSpa Chatbot] Thiếu thẻ <script data-bot-id="...">.');
    return;
  }

  var botId = String(script.getAttribute('data-bot-id') || '').trim();
  if (!botId) {
    console.warn('[MarketingSpa Chatbot] Thiếu data-bot-id.');
    return;
  }

  var apiBase = String(script.getAttribute('data-api-url') || '').trim();
  if (!apiBase) {
    try {
      apiBase = new URL(script.src).origin;
    } catch (_e) {
      apiBase = 'http://localhost:4000';
    }
  }
  apiBase = apiBase.replace(/\/$/, '');

  whenDomReady(function () {
    bootWidget(botId, apiBase);
  });

  function bootWidget(botId, apiBase) {
    var API = apiBase + '/api/v1/chatbot-cskh/public';
    var STORAGE_KEY = 'mspa_cskh_sid_' + botId;
    var sessionId = '';
    try {
      sessionId = localStorage.getItem(STORAGE_KEY) || '';
    } catch (_e2) {}

    var state = {
      open: false,
      blocked: false,
      blockedMsg: '',
      botName: 'Chatbot',
      greeting: '',
      hotline: '',
      messages: [],
      showLead: false,
      leadSubmitted: false,
      loading: false,
      lastSendAt: 0,
    };

    var MIN_SEND_MS = 2000;

    if (document.getElementById('mspa-cskh-widget')) return;

    var root = document.createElement('div');
    root.id = 'mspa-cskh-widget';
    root.setAttribute('data-bot-id', botId);
    root.style.cssText =
      'position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important;pointer-events:auto!important;font-family:system-ui,sans-serif;';
    document.body.appendChild(root);

    var style = document.createElement('style');
    style.textContent = [
      '#mspa-cskh-widget{--ms-primary:#0B2115;--ms-accent:#22c55e;--ms-bg:#fff;--ms-text:#0f172a;--ms-muted:#64748b;--ms-border:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.45;z-index:2147483000;position:fixed;right:16px;bottom:16px}',
      '#mspa-cskh-widget *{box-sizing:border-box}',
      '.ms-cskh-launcher{width:60px;height:60px;border-radius:50%;border:none;background:var(--ms-primary);color:#fff;padding:0;cursor:pointer;box-shadow:0 8px 28px rgba(11,33,21,.35);display:flex;align-items:center;justify-content:center;font-size:26px}',
      '.ms-cskh-panel{display:none;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 96px));background:var(--ms-bg);border-radius:16px;box-shadow:0 16px 48px rgba(15,23,42,.18);overflow:hidden;flex-direction:column;border:1px solid var(--ms-border)}',
      '.ms-cskh-panel.is-open{display:flex}',
      '.ms-cskh-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--ms-primary);color:#fff}',
      '.ms-cskh-head-text{flex:1;min-width:0}',
      '.ms-cskh-head-text strong{display:block;font-size:15px}',
      '.ms-cskh-head-text span{font-size:12px;opacity:.85}',
      '.ms-cskh-close{background:rgba(255,255,255,.15);border:none;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px}',
      '.ms-cskh-body{flex:1;overflow:auto;padding:12px;background:#f8fafc}',
      '.ms-cskh-msg{max-width:88%;margin:0 0 10px;padding:10px 12px;border-radius:12px;word-break:break-word}',
      '.ms-cskh-msg--bot{background:#fff;border:1px solid var(--ms-border)}',
      '.ms-cskh-msg--user{margin-left:auto;background:var(--ms-primary);color:#fff}',
      '.ms-cskh-msg--sys{background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:13px}',
      '.ms-cskh-foot{padding:10px;border-top:1px solid var(--ms-border);display:flex;gap:8px;background:#fff}',
      '.ms-cskh-foot input{flex:1;border:1px solid var(--ms-border);border-radius:10px;padding:10px 12px;font:inherit}',
      '.ms-cskh-foot button{border:none;border-radius:10px;padding:0 14px;background:var(--ms-accent);color:#fff;font-weight:600;cursor:pointer}',
      '.ms-cskh-lead{margin-top:8px;padding:12px;background:#fff;border:1px solid var(--ms-border);border-radius:12px}',
      '.ms-cskh-lead input,.ms-cskh-lead textarea{width:100%;border:1px solid var(--ms-border);border-radius:8px;padding:8px;margin:0 0 8px;font:inherit}',
      '.ms-cskh-lead button{width:100%;border:none;border-radius:8px;padding:10px;background:var(--ms-accent);color:#fff;font-weight:600;cursor:pointer}',
    ].join('');
    (document.head || document.documentElement).appendChild(style);

    function esc(s) {
      return String(s || '').replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function pageUrl() {
      try {
        return window.location.href || '';
      } catch (_e) {
        return '';
      }
    }

    async function apiPost(path, body) {
      var r = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        mode: 'cors',
        credentials: 'omit',
      });
      var data = {};
      try {
        data = await r.json();
      } catch (_e) {}
      return { ok: r.ok, status: r.status, data: data };
    }

    async function apiGet(path) {
      var r = await fetch(API + path, { method: 'GET', mode: 'cors', credentials: 'omit' });
      var data = {};
      try {
        data = await r.json();
      } catch (_e) {}
      return { ok: r.ok, data: data };
    }

    function saveSession(sid) {
      if (!sid) return;
      sessionId = sid;
      try {
        localStorage.setItem(STORAGE_KEY, sid);
      } catch (_e) {}
    }

    function renderMessages() {
      var body = root.querySelector('.ms-cskh-body');
      if (!body) return;
      var html = '';
      state.messages.forEach(function (m) {
        var cls =
          m.role === 'user'
            ? 'ms-cskh-msg--user'
            : m.role === 'sys'
              ? 'ms-cskh-msg--sys'
              : 'ms-cskh-msg--bot';
        html += '<div class="ms-cskh-msg ' + cls + '">' + esc(m.text) + '</div>';
      });
      if (state.loading) {
        html +=
          '<div class="ms-cskh-msg ms-cskh-msg--bot" style="font-style:italic;color:#64748b">Đang trả lời…</div>';
      }
      if (state.showLead && !state.leadSubmitted) {
        html +=
          '<div class="ms-cskh-lead">' +
          '<input type="text" class="ms-lead-name" placeholder="Họ tên">' +
          '<input type="tel" class="ms-lead-phone" placeholder="Số điện thoại *">' +
          '<textarea class="ms-lead-need" placeholder="Nhu cầu tư vấn"></textarea>' +
          '<button type="button" class="ms-lead-submit">Gửi thông tin</button></div>';
      }
      body.innerHTML = html;
      body.scrollTop = body.scrollHeight;
      var btn = body.querySelector('.ms-lead-submit');
      if (btn) btn.addEventListener('click', submitLead);
    }

    function renderShell() {
      root.innerHTML =
        '<div class="ms-cskh-panel' +
        (state.open ? ' is-open' : '') +
        '">' +
        '<div class="ms-cskh-head"><div class="ms-cskh-head-text"><strong>' +
        esc(state.botName) +
        '</strong><span>Trợ lý CSKH</span></div>' +
        '<button type="button" class="ms-cskh-close">×</button></div>' +
        '<div class="ms-cskh-body"></div>' +
        '<div class="ms-cskh-foot"><input class="ms-cskh-input" placeholder="Nhập tin nhắn…"' +
        (state.blocked ? ' disabled' : '') +
        '><button class="ms-cskh-send"' +
        (state.blocked ? ' disabled' : '') +
        '>Gửi</button></div></div>' +
        '<button type="button" class="ms-cskh-launcher" aria-label="Chat" style="width:60px;height:60px;border-radius:50%;border:none;background:#0B2115;color:#fff;cursor:pointer;box-shadow:0 8px 28px rgba(11,33,21,.35);display:flex;align-items:center;justify-content:center;font-size:26px;">💬</button>';

      root.querySelector('.ms-cskh-launcher').addEventListener('click', function () {
        state.open = !state.open;
        root.querySelector('.ms-cskh-panel').classList.toggle('is-open', state.open);
        root.querySelector('.ms-cskh-launcher').style.display = state.open ? 'none' : 'flex';
      });
      root.querySelector('.ms-cskh-close').addEventListener('click', function () {
        state.open = false;
        renderShell();
        renderMessages();
      });
      root.querySelector('.ms-cskh-send').addEventListener('click', sendMessage);
      root.querySelector('.ms-cskh-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendMessage();
        }
      });
      renderMessages();
    }

    async function sendMessage() {
      if (state.blocked || state.loading) return;
      var now = Date.now();
      if (state.lastSendAt && now - state.lastSendAt < MIN_SEND_MS) return;
      var input = root.querySelector('.ms-cskh-input');
      var text = input ? String(input.value || '').trim() : '';
      if (!text) return;
      state.loading = true;
      state.lastSendAt = now;
      state.messages.push({ role: 'user', text: text });
      if (input) input.value = '';
      renderMessages();
      try {
        var res = await apiPost('/message', {
          botId: botId,
          message: text,
          sessionId: sessionId || undefined,
          pageUrl: pageUrl(),
        });
        var data = res.data || {};
        if (data.session_id) saveSession(data.session_id);
        var replyText = String(data.reply || data.message || '').trim();
        if (data.blocked || data.code === 'rate_limited') {
          state.messages.push({ role: 'sys', text: replyText || 'Không thể gửi tin nhắn.' });
          if (data.blocked) state.blocked = true;
        } else if (replyText) {
          state.messages.push({ role: 'bot', text: replyText });
          if (data.show_lead) state.showLead = true;
        }
      } catch (_err) {
        state.messages.push({ role: 'sys', text: 'Mất kết nối. Vui lòng thử lại.' });
      } finally {
        state.loading = false;
        renderMessages();
      }
    }

    async function submitLead() {
      var body = root.querySelector('.ms-cskh-body');
      if (!body) return;
      var phone = String((body.querySelector('.ms-lead-phone') || {}).value || '').trim();
      if (phone.length < 6) return;
      var res = await apiPost('/lead', {
        botId: botId,
        sessionId: sessionId || undefined,
        name: String((body.querySelector('.ms-lead-name') || {}).value || '').trim(),
        phone: phone,
        need: String((body.querySelector('.ms-lead-need') || {}).value || '').trim(),
        pageUrl: pageUrl(),
      });
      var data = res.data || {};
      if (data.session_id) saveSession(data.session_id);
      state.leadSubmitted = true;
      state.showLead = false;
      state.messages.push({ role: 'bot', text: data.message || 'Cảm ơn bạn!' });
      renderMessages();
    }

    async function init() {
      renderShell();
      try {
        var cfgRes = await apiGet(
          '/config?botId=' + encodeURIComponent(botId) + '&pageUrl=' + encodeURIComponent(pageUrl()),
        );
        var cfg = cfgRes.data || {};
        if (cfg.bot_name) state.botName = cfg.bot_name;
        if (cfg.hotline) state.hotline = cfg.hotline;
        if (cfg.blocked) {
          state.blocked = true;
          state.messages.push({ role: 'sys', text: cfg.message || 'Chatbot tạm ngưng.' });
        } else if (cfgRes.ok) {
          var greet = cfg.greeting || 'Xin chào! Tôi có thể hỗ trợ gì cho bạn?';
          state.messages.push({ role: 'bot', text: greet });
        } else {
          state.messages.push({
            role: 'sys',
            text: 'Không kết nối được API (' + apiBase + '). Kiểm tra server và mã nhúng.',
          });
        }
      } catch (err) {
        console.error('[MarketingSpa Chatbot] Lỗi tải cấu hình:', err);
        state.messages.push({
          role: 'sys',
          text: 'Không kết nối được API. Đảm bảo data-api-url trỏ tới server MarketingSpa.',
        });
      }
      renderShell();
      renderMessages();
    }

    init();
    console.info('[MarketingSpa Chatbot] Widget v' + WIDGET_VERSION + ' đã khởi động.');
  }
})();
