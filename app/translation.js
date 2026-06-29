(function () {
  "use strict";

  window.addEventListener("beforeunload", function () {
    if (observer) {
      observer.disconnect();
    }
    if (timer) {
      cancelAnimationFrame(timer);
      timer = null;
    }
    queue = [];
  });

  function showToast(message, duration) {
    if (!document.body) return;
    var toast = document.createElement("div");
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "20px",
      left: "0px",
      background: "rgba(36, 19, 11, 0.75)",
      color: "#fff",
      padding: "10px 20px",
      zIndex: 9999,
      fontSize: "14px",
      fontFamily: "sans-serif",
      opacity: "1",
      transition: "opacity 0.5s ease",
      pointerEvents: "none",
    });
    document.body.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = "0";
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 5000);
    }, duration);
  }

  function loadJSON(path) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", path, false);
    xhr.send();
    if (xhr.status === 200 || xhr.status === 0) {
      return JSON.parse(xhr.responseText);
    }
    throw new Error("加载失败: " + path);
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

  var uiMap, storyMap, attrsMap;
  try {
    uiMap = loadJSON("./translation/ui.json");
  } catch (e) {
    console.error(e);
    return;
  }
  try {
    storyMap = loadJSON("./translation/story.json");
  } catch (e) {
    console.error(e);
    return;
  }
  try {
    attrsMap = loadJSON("./translation/attrs.json");
  } catch (e) {
    console.error(e);
    return;
  }
  var transMap = Object.assign({}, uiMap, storyMap, attrsMap);

  var normalizedMap = {};
  for (var key in transMap) {
    normalizedMap[normalize(key)] = transMap[key];
  }

  var templateRules = [];
  var enumMap = {};

  try {
    var templatesData = loadJSON("./translation/templates.json");
    if (typeof templatesData === 'object' && templatesData !== null && !Array.isArray(templatesData)) {
      for (var matchStr in templatesData) {
        if (templatesData.hasOwnProperty(matchStr)) {
          var transStr = templatesData[matchStr];
          if (!matchStr || !transStr) continue;
          var normalizedMatch = normalize(matchStr);
          var escaped = normalizedMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          var slots = [];
          var pattern = escaped.replace(/%(d|s)/g, function (_, type) {
            slots.push(type);
            return type === "d" ? "(\\d+)" : "(.+?)";
          });
          try {
            var regex = new RegExp("^" + pattern + "$", "i");
            templateRules.push({ regex: regex, trans: transStr, slots: slots });
          } catch (e) {
            console.warn("模板正则构建失败:", matchStr, e);
          }
        }
      }
    }
  } catch (e) {
    console.warn("templates.json 加载失败，将跳过模板翻译", e);
  }

  try {
    var enumsData = loadJSON("./translation/enums.json");
    enumMap = enumsData || {};
  } catch (e) {
    console.warn("enums.json 加载失败，将跳过枚举翻译", e);
  }

  function translateEnumFragment(rawFragment) {
    var parts = rawFragment.split(";");
    var translatedParts = parts.map(function (part) {
      var trimmed = part.trim();
      return enumMap[trimmed] || trimmed;
    });
    return translatedParts.join(";");
  }

  var skipTextTags = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "TEXTAREA",
    "INPUT",
    "CANVAS",
    "SVG",
  ]);
  function shouldSkip(node) {
    var p = node.parentElement;
    if (!p) return true;
    if (p.closest(".luna-embedded-translation")) return true;
    if (skipTextTags.has(p.tagName)) return true;
    if (p.closest("script,style,noscript,template,textarea,svg,canvas"))
      return true;
    return false;
  }
  function visible(el) {
    if (!el || !el.ownerDocument) return false;
    var s = window.getComputedStyle(el);
    var r = el.getBoundingClientRect();
    return (
      s.display !== "none" &&
      s.visibility !== "hidden" &&
      r.width > 0 &&
      r.height > 0
    );
  }
  function visibleOrTooltip(el) {
    if (visible(el)) return true;
    var n = el;
    while (n && n.nodeType === 1) {
      var cls =
        typeof n.className === "string"
          ? n.className
          : n.getAttribute("class") || "";
      if (/tooltip/i.test(cls)) return true;
      n = n.parentElement;
    }
    if (el.tagName === "OPTION") {
      var sel = el.closest("select");
      return !!sel && visible(sel);
    }
    return false;
  }

function localTranslate(source) {
  console.log("T:", source);
  if (!source) return "";
  var nSource = normalize(source);

  if (normalizedMap[nSource]) {
    console.log("精确匹配命中:\n", nSource, "\n->\n", normalizedMap[nSource]);
    return normalizedMap[nSource];
  }

  for (var i = 0; i < templateRules.length; i++) {
    var rule = templateRules[i];
    var m = nSource.match(rule.regex);
    if (!m) continue;

    console.log(
      "\n模板匹配 #" + i,
      "\n正则:", rule.regex.toString(),
      "\n译文模板:", rule.trans,
      "\n捕获组:", m.slice(1)
    );

    var values = [];
    for (var j = 0; j < rule.slots.length; j++) {
      var captured = m[j + 1];
      if (rule.slots[j] === "s") {
        values.push(translateEnumFragment(captured));
      } else {
        values.push(captured);
      }
    }

    var result = rule.trans;
    var valueIndex = 0;
    result = result.replace(/%(d|s)/g, function () {
      return values[valueIndex++] || "";
    });
    return result;
  }

  var r = source;
  r = r
    .replace(/(\d+)\s*d\b/gi, "$1天")
    .replace(/(\d+)\s*h\b/gi, "$1小时")
    .replace(/(\d+)\s*m\b/gi, "$1分钟");
  return r !== source ? r : "";
}
  var queue = [],
    timer = null;
  function processQueue() {
    var start = Date.now();
    while (queue.length && Date.now() - start < 10) {
      var node = queue.shift();
      if (
        !node.parentElement ||
        shouldSkip(node) ||
        !visibleOrTooltip(node.parentElement)
      ) continue;
      if (node._translated) continue;
      var src = node.data;
      if (!src || !/[A-Za-z]/.test(src)) continue;
      var trans = localTranslate(src);
      if (trans) {
        node.data = trans;
        node._translated = true;
      }
    }
    if (queue.length) timer = requestAnimationFrame(processQueue);
    else timer = null;
  }
  function enqueue(node) {
    queue.push(node);
    if (!timer) timer = requestAnimationFrame(processQueue);
  }
  function scan(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) enqueue(n);
  }

  var observer = new MutationObserver(function (ms) {
    ms.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType === 1) scan(n);
        else if (n.nodeType === 3) enqueue(n);
      });
      if (m.type === "characterData" && m.target.nodeType === 3)
        enqueue(m.target);
    });
  });

  function start() {
    if (document.body) {
      var total = Object.keys(transMap).length;
      showToast("翻译模组加载完成，已载入 " + total + " 条");

      scan(document.body);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    } else {
      document.addEventListener("DOMContentLoaded", start);
    }
  }
  start();
  console.log(
    "cocTranslation Loaded " + Object.keys(transMap).length + " texts",
  );
})();