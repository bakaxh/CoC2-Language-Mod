(function () {
    "use strict";

    const settingsKey = "lunaAdapterEnabled";
    const endpointKey = "lunaAdapterEndpoint";
    const translatorKey = "lunaAdapterTranslatorId";
    const defaultEndpoint = "http://127.0.0.1:2333";
    const maxConcurrent = 6;
    const cache = new Map();
    const inflight = new Map();
    const textState = new WeakMap();
    const attrState = new WeakMap();
    const queue = [];
    let running = 0;
    let pendingScan = null;

    const skipTextTags = new Set([
        "SCRIPT",
        "STYLE",
        "NOSCRIPT",
        "TEMPLATE",
        "TEXTAREA",
        "INPUT",
        "CANVAS",
        "SVG"
    ]);
    const translatedAttrs = ["placeholder", "title", "aria-label", "alt"];
    const valueInputTypes = new Set(["button", "submit", "reset"]);

    function isEnabled() {
        return localStorage.getItem(settingsKey) !== "0";
    }

    function endpoint() {
        return (localStorage.getItem(endpointKey) || defaultEndpoint).replace(/\/+$/, "");
    }

    function translatorId() {
        return localStorage.getItem(translatorKey) || "";
    }

    function normalize(text) {
        return (text || "")
            .replace(/\u00a0/g, " ")
            .replace(/\r/g, "")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n[ \t]+/g, "\n")
            .replace(/[ \t]{2,}/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    function classText(element) {
        if (!element) return "";
        if (typeof element.className === "string") return element.className;
        return element.getAttribute ? element.getAttribute("class") || "" : "";
    }

    function closestClass(element, pattern) {
        for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
            if (pattern.test(classText(node))) return node;
        }
        return null;
    }

    function visible(element) {
        if (!element || !element.ownerDocument || !element.ownerDocument.documentElement.contains(element)) {
            return false;
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0;
    }

    function visibleOrTooltip(element) {
        if (visible(element)) return true;
        if (closestClass(element, /tooltip/i)) return true;
        if (element.tagName === "OPTION") {
            const select = element.closest("select");
            return !!select && visible(select);
        }
        return false;
    }

    function hasMostlyCjk(text) {
        const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
        const latin = (text.match(/[A-Za-z]/g) || []).length;
        return cjk >= 2 && cjk > latin;
    }

    function looksTranslatable(text) {
        const source = normalize(text);
        return source.length >= 2 &&
            source.length <= 12000 &&
            /[A-Za-z]/.test(source) &&
            !/^[\W\d_]+$/.test(source) &&
            !hasMostlyCjk(source);
    }

    function shouldSkipTextNode(node) {
        const parent = node.parentElement;
        if (!parent) return true;
        if (parent.closest(".luna-embedded-translation")) return true;
        if (skipTextTags.has(parent.tagName)) return true;
        if (parent.closest("script,style,noscript,template,textarea,svg,canvas")) return true;
        if (!visibleOrTooltip(parent)) return true;
        return false;
    }

    function readTextSource(node) {
        const current = normalize(node.data);
        const state = textState.get(node);
        if (!state) return current;

        if (current === normalize(state.translation) || current === normalize(state.source)) {
            return normalize(state.source);
        }

        textState.delete(node);
        return current;
    }

    function textIsTranslated(node) {
        const state = textState.get(node);
        return !!state && normalize(node.data) === normalize(state.translation);
    }

    function textIsPending(node, source) {
        const state = textState.get(node);
        return !!state && state.pending === source;
    }

    function setTextPending(node, source) {
        const state = textState.get(node) || {};
        state.pending = source;
        textState.set(node, state);
    }

    function clearTextPending(node, source) {
        const state = textState.get(node);
        if (!state || state.pending !== source) return;
        delete state.pending;
        if (!state.source && !state.translation) textState.delete(node);
        else textState.set(node, state);
    }

    function preserveEdgeWhitespace(raw, replacement) {
        const leading = (raw.match(/^\s*/) || [""])[0];
        const trailing = (raw.match(/\s*$/) || [""])[0];
        return leading + replacement + trailing;
    }

    function writeTextTranslation(node, source, translation) {
        if (readTextSource(node) !== source) return;
        node.data = preserveEdgeWhitespace(node.data, translation);
        textState.set(node, { source, translation });
    }

    function attrMap(element) {
        let map = attrState.get(element);
        if (!map) {
            map = new Map();
            attrState.set(element, map);
        }
        return map;
    }

    function readAttrSource(element, attr) {
        const current = normalize(element.getAttribute(attr) || "");
        const state = attrMap(element).get(attr);
        if (!state) return current;

        if (current === normalize(state.translation) || current === normalize(state.source)) {
            return normalize(state.source);
        }

        attrMap(element).delete(attr);
        return current;
    }

    function attrIsTranslated(element, attr) {
        const state = attrMap(element).get(attr);
        return !!state && normalize(element.getAttribute(attr) || "") === normalize(state.translation);
    }

    function attrIsPending(element, attr, source) {
        const state = attrMap(element).get(attr);
        return !!state && state.pending === source;
    }

    function setAttrPending(element, attr, source) {
        const state = attrMap(element).get(attr) || {};
        state.pending = source;
        attrMap(element).set(attr, state);
    }

    function clearAttrPending(element, attr, source) {
        const map = attrMap(element);
        const state = map.get(attr);
        if (!state || state.pending !== source) return;
        delete state.pending;
        if (!state.source && !state.translation) map.delete(attr);
        else map.set(attr, state);
    }

    function writeAttrTranslation(element, attr, source, translation) {
        if (readAttrSource(element, attr) !== source) return;
        element.setAttribute(attr, translation);
        attrMap(element).set(attr, { source, translation });
    }

    async function translate(source) {
        const key = JSON.stringify([endpoint(), translatorId(), source]);
        if (cache.has(key)) return cache.get(key);
        if (inflight.has(key)) return inflight.get(key);

        const request = (async () => {
            const url = new URL("/api/translate", endpoint());
            url.searchParams.set("text", source);
            if (translatorId()) url.searchParams.set("id", translatorId());

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 45000);
            try {
                const response = await fetch(url.toString(), { signal: controller.signal });
                const json = await response.json();
                if (!json || json.error || !json.result) return "";
                cache.set(key, json.result);
                return json.result;
            } catch (_error) {
                return "";
            } finally {
                clearTimeout(timer);
                inflight.delete(key);
            }
        })();

        inflight.set(key, request);
        return request;
    }

    function textTarget(node, includeTranslated) {
        if (shouldSkipTextNode(node)) return null;
        const source = readTextSource(node);
        if (!looksTranslatable(source)) return null;
        if (!includeTranslated && textIsTranslated(node)) return null;

        return {
            kind: "text",
            source,
            isPending: () => textIsPending(node, source),
            markPending: () => setTextPending(node, source),
            clearPending: () => clearTextPending(node, source),
            write: (translation) => writeTextTranslation(node, source, translation)
        };
    }

    function attrTarget(element, attr, includeTranslated) {
        if (!element.hasAttribute(attr)) return null;
        if (element.closest(".luna-embedded-translation")) return null;
        if (!visibleOrTooltip(element)) return null;

        const source = readAttrSource(element, attr);
        if (!looksTranslatable(source)) return null;
        if (!includeTranslated && attrIsTranslated(element, attr)) return null;

        return {
            kind: "attr:" + attr,
            source,
            isPending: () => attrIsPending(element, attr, source),
            markPending: () => setAttrPending(element, attr, source),
            clearPending: () => clearAttrPending(element, attr, source),
            write: (translation) => writeAttrTranslation(element, attr, source, translation)
        };
    }

    function valueTarget(element, includeTranslated) {
        if (element.tagName !== "INPUT") return null;
        if (!valueInputTypes.has((element.getAttribute("type") || "").toLowerCase())) return null;
        return attrTarget(element, "value", includeTranslated);
    }

    function collectTargets(includeTranslated) {
        const targets = [];
        if (!document.body) return targets;

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const target = textTarget(node, includeTranslated);
            if (target) targets.push(target);
        }

        document.body.querySelectorAll("[placeholder], [title], [aria-label], [alt], input[value]").forEach((element) => {
            translatedAttrs.forEach((attr) => {
                const target = attrTarget(element, attr, includeTranslated);
                if (target) targets.push(target);
            });

            const target = valueTarget(element, includeTranslated);
            if (target) targets.push(target);
        });

        return targets;
    }

    async function runTarget(target) {
        const translation = await translate(target.source);
        target.clearPending();
        if (translation) target.write(translation);
    }

    function pumpQueue() {
        while (running < maxConcurrent && queue.length) {
            const target = queue.shift();
            running += 1;
            runTarget(target).finally(() => {
                running -= 1;
                pumpQueue();
            });
        }
    }

    function enqueueTarget(target) {
        if (target.isPending()) return;
        target.markPending();
        queue.push(target);
        pumpQueue();
    }

    function embedVisibleText() {
        if (!isEnabled()) return;
        collectTargets(false).forEach(enqueueTarget);
    }

    function sourceTextSnapshot() {
        return collectTargets(true)
            .filter((target) => target.kind === "text")
            .map((target) => target.source)
            .filter(Boolean)
            .join("\n");
    }

    function copyCurrentText() {
        const text = sourceTextSnapshot();
        if (!text || !window.electronAPI || typeof window.electronAPI.lunaCopyText !== "function") return;
        window.electronAPI.lunaCopyText(text);
    }

    function scanSoon() {
        clearTimeout(pendingScan);
        pendingScan = setTimeout(embedVisibleText, 180);
    }

    window.lunaAdapter = {
        copy: copyCurrentText,
        enabled: isEnabled,
        embed: embedVisibleText,
        getText: sourceTextSnapshot,
        scan: scanSoon,
        setEnabled: (enabled) => {
            localStorage.setItem(settingsKey, enabled ? "1" : "0");
            scanSoon();
        },
        setEndpoint: (url) => {
            localStorage.setItem(endpointKey, url);
            scanSoon();
        },
        setMode: () => {
            scanSoon();
        },
        setTranslator: (id) => {
            localStorage.setItem(translatorKey, id || "");
            scanSoon();
        },
        targets: () => collectTargets(true).map((target) => ({
            kind: target.kind,
            text: target.source
        }))
    };

    new MutationObserver(scanSoon).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: translatedAttrs.concat(["value"])
    });
    window.addEventListener("load", scanSoon);
    window.addEventListener("focus", scanSoon);
})();
