/**
 * Inject "Chatbot CSKH" nav link for logged-in users.
 */
(function () {
    "use strict";

    function navLinkContainers() {
        var seen = new Set();
        var out = [];
        document.querySelectorAll("#digiseoNavMenu, .digiseo-nav-links, .main-nav.nav").forEach(function (el) {
            if (seen.has(el)) return;
            seen.add(el);
            out.push(el);
        });
        return out;
    }

    function removeLinks() {
        document.querySelectorAll("[data-nav-chatbot-cskh]").forEach(function (el) {
            el.remove();
        });
    }

    function createLink() {
        var a = document.createElement("a");
        a.href = "/chatbot-cskh";
        a.setAttribute("data-nav-chatbot-cskh", "");
        a.setAttribute("data-i18n", "nav.chatbot_cskh");
        a.textContent = "Chatbot CSKH";
        return a;
    }

    function injectLinks() {
        navLinkContainers().forEach(function (container) {
            if (container.querySelector("[data-nav-chatbot-cskh]")) return;
            var link = createLink();
            var settings = container.querySelector('a[href="/settings"]');
            if (settings) container.insertBefore(link, settings);
            else container.appendChild(link);
        });
        if (typeof window.markdigiseoTopNavActive === "function") {
            window.markdigiseoTopNavActive();
        }
    }

    function token() {
        return typeof window.DigiSeoGetAuthToken === "function" ? window.DigiSeoGetAuthToken() : "";
    }

    function run() {
        removeLinks();
        if (!token()) return;
        var fetchMe = window.DigiSeoFetchAuthMe
            ? window.DigiSeoFetchAuthMe()
            : fetch("/auth/me", { credentials: "same-origin", headers: { Authorization: "Bearer " + token() } })
                .then(function (r) { return r.ok ? r.json() : null; });
        fetchMe
            .then(function (u) {
                if (u && u.email) injectLinks();
            })
            .catch(function () {});
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run);
    } else {
        run();
    }

    window.addEventListener("digiseo-auth-change", function (e) {
        if (e.detail && e.detail.loggedIn === false) removeLinks();
        else run();
    });

    window.refreshDigiSeoChatbotCskhNav = run;
})();
