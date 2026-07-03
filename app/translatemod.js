(() => {
  console.log("[i18n] translation runtime");
  console.debug("[i18n] by bakaxh");

  const DEBUG = true;
  const show = (str) => str.replace(/\n/g, "\\n");
  const log = (...a) => DEBUG && console.log(...a);
  const verbose = (...a) => DEBUG && console.debug(...a);

  function getCurrentLanguage() {
    const stored = localStorage.getItem("i18n_lang");
    return stored || "zh-CN";
  }

  const LANG = getCurrentLanguage();
  console.log(`[i18n] current language: ${LANG}`);

  function createLanguageSwitcher() {
    if (document.getElementById("i18n-lang-toggle")) return;

    const style = document.createElement("style");
    style.textContent = `
      #i18n-lang-toggle {
        position: fixed;
        left: -20px;
        bottom: 40px;
        z-index: 99999;
        transition: left 0.3s ease;
      }
      #i18n-lang-toggle:hover {
        left: 0;
      }
      #i18n-lang-btn {
        width: 40px;
        height: 40px;
        background: rgba(0,0,0,0.8);
        color: #fff;
        border: none;
        border-radius: 0 6px 6px 0;
        cursor: pointer;
        font-size: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 2px 0 8px rgba(0,0,0,0.3);
        outline: none;
        position: relative;
      }
      #i18n-lang-panel {
        display: none;
        position: absolute;
        left: 0;
        bottom: 44px;
        background: rgba(0,0,0,0.8);
        padding: 12px;
        border-radius: 0 8px 8px 0;
        min-width: 140px;
        box-shadow: 2px 0 8px rgba(0,0,0,0.3);
      }
      #i18n-lang-panel select {
        width: 100%;
        padding: 4px 8px;
        background: #fff;
        color: #000;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        margin-bottom: 8px;
      }
      #i18n-lang-hide-btn {
        width: 100%;
        padding: 4px 8px;
        background: #555;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      #i18n-lang-toggle.panel-open #i18n-lang-panel {
        display: block;
      }
    #i18n-lang-change-msg {
        display: block;
        font-size: 12px;
        color: #ccc;
        margin-top: 8px;
    }
    `;
    document.head.appendChild(style);

    const container = document.createElement("div");
    container.id = "i18n-lang-toggle";
    container.innerHTML = `
      <button id="i18n-lang-btn" title="Language">⚙</button>
      <div id="i18n-lang-panel">
        <select id="i18n-lang-select">
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
        <button id="i18n-lang-hide-btn">hide ui</button>
        <span id="i18n-lang-change-msg">Restart the game to apply language changes.</span>
      </div>
    `;
    document.body.appendChild(container);

    const select = document.getElementById("i18n-lang-select");
    select.value = LANG;

    const toggleBtn = document.getElementById("i18n-lang-btn");
    const hideBtn = document.getElementById("i18n-lang-hide-btn");
    let panelOpen = false;

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panelOpen = !panelOpen;
      container.classList.toggle("panel-open", panelOpen);
    });

    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        panelOpen = false;
        container.classList.remove("panel-open");
      }
    });

    select.addEventListener("change", (e) => {
      const newLang = e.target.value;
      localStorage.setItem("i18n_lang", newLang);
      panelOpen = !panelOpen;
      container.classList.toggle("panel-open", panelOpen);
    });

    hideBtn.addEventListener("click", () => {
      container.remove();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createLanguageSwitcher);
  } else {
    createLanguageSwitcher();
  }

  let MAIN_DICT = {};
  let ENUM_DICT = {};

  const MAIN_JSON = `./translation/${LANG}/main.json`;
  const ENUMS_JSON = `./translation/${LANG}/enums.json`;

  async function loadDictionaries() {
    try {
      const mainResp = await fetch(MAIN_JSON);
      const mainData = await mainResp.json();
      for (const key of Object.keys(mainData)) {
        MAIN_DICT[key.trim()] = mainData[key];
      }
      verbose(`[i18n] dict main loaded: ${Object.keys(MAIN_DICT).length}`);

      const enumResp = await fetch(ENUMS_JSON);
      const enumData = await enumResp.json();
      for (const key of Object.keys(enumData)) {
        ENUM_DICT[key.trim()] = enumData[key];
      }
      window.__ENUM_DICT = ENUM_DICT;
      verbose(`[i18n] dict enum loaded: ${Object.keys(ENUM_DICT).length}`);

      let patchIndex = 0;
      while (true) {
        const patchUrl = `./translation/${LANG}/patch/patch_${patchIndex}.json`;
        try {
          const resp = await fetch(patchUrl);
          if (!resp.ok) break;
          const patchData = await resp.json();
          for (const key of Object.keys(patchData)) {
            MAIN_DICT[key.trim()] = patchData[key];
          }
          verbose(
            `[i18n] dict patch (${patchUrl}) loaded: ${Object.keys(MAIN_DICT).length}`,
          );
          patchIndex++;
        } catch (e) {
          break;
        }
      }

      initHooks();
    } catch (err) {
      console.error("[i18n] Failed to load dictionaries:", err);
    }
  }

  const translationCache = new Map();

  const t = (s) => {
    if (typeof s !== "string") return s;
    s = s.replace(/&nbsp;/g, " ");

    if (translationCache.has(s)) return translationCache.get(s);

    if (MAIN_DICT[s] !== undefined && MAIN_DICT[s] !== "") {
      translationCache.set(s, MAIN_DICT[s]);
      verbose(`[exact] "${show(s)}" => "${show(MAIN_DICT[s])}"`);
      return MAIN_DICT[s];
    }

    const leadingNewlines = s.match(/^\n*/)[0];
    const trailingNewlines = s.match(/\n*$/)[0];
    let core = s.slice(
      leadingNewlines.length,
      s.length - trailingNewlines.length,
    );
    core = core.trim();

    if (MAIN_DICT[core] !== undefined && MAIN_DICT[core] !== "") {
      const result = leadingNewlines + MAIN_DICT[core] + trailingNewlines;
      translationCache.set(s, result);
      verbose(`[exact2] "${show(s)}" => "${show(result)}"`);
      return result;
    }

    if (!/[a-zA-Z]/.test(core)) {
      translationCache.set(s, s);
      return s;
    }

    const words = core.split(/\s+/);
    if (words.length > 5) {
      translationCache.set(s, s);
      log(`[untranslated2] "${show(s)}"`);
      return s;
    }

    const translatedCore = words
      .map((word) => {
        const clean = word.replace(/[.,!?;:]+$/, "");
        const suffix = word.slice(clean.length);
        return ENUM_DICT[clean] !== undefined
          ? ENUM_DICT[clean] + suffix
          : word;
      })
      .join(" ");

    const result = leadingNewlines + translatedCore + trailingNewlines;

    if (result !== s) {
      console.warn(`[auto] "${show(s)}" => "${show(result)}"`);
      translationCache.set(s, result);
      return result;
    }

    translationCache.set(s, s);
    log(`[untranslated3] "${show(s)}"`);
    return s;
  };

  setInterval(() => translationCache.clear(), 60000);

  const CONTROL = new Set([
    "slider",
    "dropdown",
    "textBox",
    "textbox",
    "JSXContent",
    "jsxcontent",
    "input",
    "button",
    "[slider]",
    "[dropdown]",
    "[textBox]",
    "[JSXContent]",
  ]);

  function isControlToken(str) {
    if (!str) return false;
    const clean = str.replace(/[\[\]]/g, "").trim();
    return CONTROL.has(clean);
  }

  let origParse = null;
  let origTextify = null;

  function resolveTag(tag) {
    if (origParse) {
      try {
        return origParse(tag);
      } catch (e) {
        return tag;
      }
    }
    return tag;
  }

  function tokenize(str) {
    const out = [];
    let buf = "";

    const flush = () => {
      if (buf) {
        out.push({ type: "text", value: buf });
        buf = "";
      }
    };

    for (let i = 0; i < str.length; i++) {
      const c = str[i];

      if (c === "<") {
        const end = str.indexOf(">", i);
        if (end !== -1) {
          flush();
          out.push({ type: "html", value: str.slice(i, end + 1) });
          i = end;
          continue;
        }
      }

      if (c === "[") {
        flush();
        let depth = 1;
        let j = i + 1;
        while (j < str.length && depth > 0) {
          if (str[j] === "[") depth++;
          else if (str[j] === "]") depth--;
          j++;
        }
        const tag = str.slice(i, j);
        if (isControlToken(tag)) {
          out.push({ type: "control", value: tag });
        } else {
          out.push({ type: "tag", value: tag });
        }
        i = j - 1;
        continue;
      }

      buf += c;
    }

    flush();
    return out;
  }

  function transform(ast) {
    let out = "";
    for (const node of ast) {
      if (node.type === "text") {
        out += t(node.value);
      } else if (node.type === "tag") {
        const resolved = resolveTag(node.value);
        out += t(resolved);
      } else {
        out += node.value;
      }
    }
    return out;
  }

  function process(str) {
    if (typeof str !== "string") return str;
    const ast = tokenize(str);
    return transform(ast);
  }

  function initHooks() {
    const nativeCreateTextNode = document.createTextNode.bind(document);
    document.createTextNode = function (data) {
      const translated = typeof data === "string" ? process(data) : data;
      return nativeCreateTextNode(translated);
    };
    verbose("[i18n] createTextNode hooked");

    const nativeTextContentDescriptor = Object.getOwnPropertyDescriptor(
      Node.prototype,
      "textContent",
    );
    const nativeTextSet = nativeTextContentDescriptor.set;
    const nativeTextGet = nativeTextContentDescriptor.get;
    let textTranslating = false;

    Object.defineProperty(Node.prototype, "textContent", {
      set(value) {
        if (textTranslating) return nativeTextSet.call(this, value);
        textTranslating = true;
        try {
          const translated = typeof value === "string" ? process(value) : value;
          nativeTextSet.call(this, translated);
        } finally {
          textTranslating = false;
        }
      },
      get() {
        return nativeTextGet.call(this);
      },
      configurable: true,
    });
    verbose("[i18n] textContent setter hooked");

    const innerHTMLDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "innerHTML",
    );
    const nativeInnerSet = innerHTMLDescriptor.set;
    const nativeInnerGet = innerHTMLDescriptor.get;
    let innerTranslating = false;

    Object.defineProperty(Element.prototype, "innerHTML", {
      set(value) {
        if (innerTranslating) return nativeInnerSet.call(this, value);
        innerTranslating = true;
        try {
          const translated = typeof value === "string" ? process(value) : value;
          nativeInnerSet.call(this, translated);
        } finally {
          innerTranslating = false;
        }
      },
      get() {
        return nativeInnerGet.call(this);
      },
      configurable: true,
    });
    verbose("[i18n] innerHTML setter hooked");

    const nodeValueDescriptor = Object.getOwnPropertyDescriptor(
      Node.prototype,
      "nodeValue",
    );
    if (nodeValueDescriptor && nodeValueDescriptor.set) {
      const nativeNodeSet = nodeValueDescriptor.set;
      const nativeNodeGet = nodeValueDescriptor.get;
      let nodeTranslating = false;

      Object.defineProperty(Node.prototype, "nodeValue", {
        set(value) {
          if (nodeTranslating) return nativeNodeSet.call(this, value);
          nodeTranslating = true;
          try {
            const translated =
              typeof value === "string" ? process(value) : value;
            nativeNodeSet.call(this, translated);
          } finally {
            nodeTranslating = false;
          }
        },
        get() {
          return nativeNodeGet.call(this);
        },
        configurable: true,
      });
      verbose("[i18n] nodeValue setter hooked");
    } else {
      console.warn("[i18n] nodeValue hook failed (no descriptor)");
    }

    const dataDescriptor = Object.getOwnPropertyDescriptor(
      CharacterData.prototype,
      "data",
    );
    if (dataDescriptor && dataDescriptor.set) {
      const nativeDataSet = dataDescriptor.set;
      const nativeDataGet = dataDescriptor.get;
      let dataTranslating = false;

      Object.defineProperty(CharacterData.prototype, "data", {
        set(value) {
          if (dataTranslating) return nativeDataSet.call(this, value);
          dataTranslating = true;
          try {
            const translated =
              typeof value === "string" ? process(value) : value;
            nativeDataSet.call(this, translated);
          } finally {
            dataTranslating = false;
          }
        },
        get() {
          return nativeDataGet.call(this);
        },
        configurable: true,
      });
      verbose("[i18n] data setter hooked");
    } else {
      console.warn("[i18n] data hook failed (no descriptor)");
    }

    const waitTextify = setInterval(() => {
      if (window.textify) {
        clearInterval(waitTextify);
        origTextify = window.textify;

        window.textify = function (...args) {
          let templateStr = null;

          if (typeof args[0] === "string") {
            templateStr = args[0];
          } else if (
            Array.isArray(args[0]) &&
            args[0].length === 1 &&
            typeof args[0][0] === "string"
          ) {
            templateStr = args[0][0];
          }

          if (templateStr) {
            const translated = process(templateStr);

            if (typeof args[0] === "string") {
              args[0] = translated;
            } else if (
              Array.isArray(args[0]) &&
              args[0].length === 1 &&
              typeof args[0][0] === "string"
            ) {
              args[0] = [translated];
            }
          }

          return origTextify.apply(this, args);
        };

        verbose("[i18n] textify hooked");
      }
    }, 50);

    const waitParser = setInterval(() => {
      if (window.Parser?.parse) {
        clearInterval(waitParser);
        origParse = window.Parser.parse.bind(window.Parser);

        window.Parser.parse = function (...args) {
          if (typeof args[0] === "string") {
            args[0] = process(args[0]);
          }
          return origParse(...args);
        };

        if (window.Parser.tempParser) {
          const origTempParser = window.Parser.tempParser.bind(window.Parser);
          window.Parser.tempParser = function (...args) {
            const parserInstance = origTempParser(...args);
            const origInstanceParse = parserInstance.parse.bind(parserInstance);
            parserInstance.parse = function (str, ...rest) {
              if (typeof str === "string") {
                str = process(str);
              }
              return origInstanceParse(str, ...rest);
            };
            return parserInstance;
          };
          verbose("[i18n] Parser hooked");
        }
      }
    }, 50);
  }

  loadDictionaries();
})();
