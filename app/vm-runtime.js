(() => {
  console.log("[i18n] translation runtime");
  console.debug("[i18n] by bakaxh");

  const DEBUG = true;
  const show = (str) => str.replace(/\n/g, "\\n");
  const log = (...a) => DEBUG && console.log(...a);
  const verbose = (...a) => DEBUG && console.debug(...a);

  let MAIN_DICT = {};
  let ENUM_DICT = {};

  fetch("./translation/main.json")
    .then((r) => r.json())
    .then((j) => {
      MAIN_DICT = {};
      for (const key of Object.keys(j)) {
        const trimmedKey = key.trim();
        MAIN_DICT[trimmedKey] = j[key];
      }
      window.__MAIN_DICT = MAIN_DICT;
      verbose("[i18n] dict main loaded:", Object.keys(MAIN_DICT).length);
    });

  fetch("./translation/enums.json")
    .then((r) => r.json())
    .then((j) => {
      ENUM_DICT = {};
      for (const key of Object.keys(j)) {
        const trimmedKey = key.trim();
        ENUM_DICT[trimmedKey] = j[key];
      }
      window.__ENUM_DICT = ENUM_DICT;
      verbose("[i18n] dict enum loaded:", Object.keys(ENUM_DICT).length);
    });

  const translationCache = new Map();

  let Patch = [
    "./translation/patch/patch_0.json",
    // "./translation/patch/patch_1.json",
    // "./translation/patch/patch_2.json",
    // "./translation/patch/patch_3.json",
    // "./translation/patch/patch_4.json",
    // "./translation/patch/patch_5.json",
    // "./translation/patch/patch_6.json",
    // "./translation/patch/patch_7.json",
  ];

  if (Patch.length > 0) {
    for (let i = 0; i < Patch.length; i++) {
      fetch(Patch[i])
        .then((r) => r.json())
        .then((j) => {
          for (const key of Object.keys(j)) {
            const trimmedKey = key.trim();
            MAIN_DICT[trimmedKey] = j[key];
          }
          verbose(
            "[i18n] dict patch (" + Patch[i] + ") loaded:",
            Object.keys(MAIN_DICT).length,
          );
        });
    }
  }

  const t = (s) => {
    if (typeof s !== "string") return s;

    // 缓存检查
    if (translationCache.has(s)) return translationCache.get(s);

    // 精确匹配
    if (MAIN_DICT[s] !== undefined) {
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

    if (MAIN_DICT[core] !== undefined) {
      const result = leadingNewlines + MAIN_DICT[core] + trailingNewlines;
      translationCache.set(s, result);
      verbose(`[exact2] "${show(s)}" => "${show(result)}"`);
      return result;
    }

    if (!/[a-zA-Z]/.test(core)) {
      translationCache.set(s, s);
      return s;
    }

    if (core.length > 80 || /[<\[%]/.test(core) || core.trim().length === 0) {
      translationCache.set(s, s);
      log(`[untranslated1] "${show(s)}"`);
      return s;
    }

    // 短语翻译
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
      verbose(`[auto] "${show(s)}" => "${show(result)}"`);
      translationCache.set(s, result);
      return result;
    }

    translationCache.set(s, s);
    log(`[untranslated3] "${show(s)}"`);
    return s;
  };
  setInterval(() => translationCache.clear(), 60000);

  // tags
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
    // if (str != "") log(`[tokenize] raw: "${show(str)}"`);
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

      // HTML 标签：找到第一个 >
      if (c === "<") {
        const end = str.indexOf(">", i);
        if (end !== -1) {
          flush();
          out.push({ type: "html", value: str.slice(i, end + 1) });
          i = end;
          continue;
        }
      }

      // [...] 标签：按深度匹配
      if (c === "[") {
        flush();
        let depth = 1;
        let j = i + 1;
        while (j < str.length && depth > 0) {
          if (str[j] === "[") depth++;
          else if (str[j] === "]") depth--;
          j++;
        }
        const tag = str.slice(i, j); // 包含最外层 []
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

  const waitDict = setInterval(() => {
    if (typeof MAIN_DICT === "object" && Object.keys(MAIN_DICT).length > 0) {
      clearInterval(waitDict);

      // createTextNode hook
      const nativeCreateTextNode = document.createTextNode.bind(document);
      document.createTextNode = function (data) {
        const translated = typeof data === "string" ? process(data) : data;
        return nativeCreateTextNode(translated);
      };
      verbose("[i18n] createTextNode hooked");

      // textContent hook
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
            const translated =
              typeof value === "string" ? process(value) : value;
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

      // innerHTML hook
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
            const translated =
              typeof value === "string" ? process(value) : value;
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

      // nodeValue hook
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

      // (CharacterData.prototype.data) hook
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
    }
  }, 100);

  const waitTextify = setInterval(() => {
    if (window.textify) {
      clearInterval(waitTextify);
      origTextify = window.textify;

      window.textify = function (...args) {
        // console.log("[i18n] textify called with args:", args);

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

      // Parser.parse hook
      window.Parser.parse = function (...args) {
        if (typeof args[0] === "string") {
          args[0] = process(args[0]);
        }
        return origParse(...args);
      };
      verbose("[i18n] Parser.parse hooked");
    }
  }, 50);
})();