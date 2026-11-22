/*
 * MATCUB Syntax Highlighter 1.0
 * Automatic syntax highlighting for lesson code blocks.
 * Uses Prism.js 1.30.0 from cdnjs; no editor, linting, or code execution.
 * Supported language grammars are loaded once and reused across the page.
 */
(() => {
  "use strict";

  const VERSION = "1.0.0";
  const PRISM_BASE = "https://cdnjs.cloudflare.com/ajax/libs/prism/1.30.0/";
  const CODE_BLOCK_SELECTOR = ".code-block";
  const loadedScripts = new Map();
  const highlighted = new WeakSet();

  // Load Prism core and its grammars sequentially so dependencies are available.
  const COMPONENTS = [
    "components/prism-clike.min.js",
    "components/prism-markup.min.js",
    "components/prism-css.min.js",
    "components/prism-javascript.min.js",
    "components/prism-python.min.js",
    "components/prism-bash.min.js",
    "components/prism-json.min.js",
    "components/prism-yaml.min.js",
    "components/prism-sql.min.js",
    "components/prism-java.min.js",
    "components/prism-c.min.js",
    "components/prism-cpp.min.js",
    "components/prism-typescript.min.js",
    "components/prism-go.min.js",
    "components/prism-rust.min.js",
    "components/prism-markup-templating.min.js",
    "components/prism-php.min.js",
    "components/prism-docker.min.js",
    "components/prism-hcl.min.js",
    "components/prism-powershell.min.js",
    "components/prism-toml.min.js",
    "components/prism-ini.min.js",
    "components/prism-diff.min.js",
    "components/prism-nginx.min.js",
    "components/prism-graphql.min.js",
    "components/prism-makefile.min.js",
    "components/prism-http.min.js",
    "plugins/line-numbers/prism-line-numbers.min.js"
  ];

  const ALIASES = {
    html: "markup",
    xml: "markup",
    svg: "markup",
    shell: "bash",
    sh: "bash",
    zsh: "bash",
    js: "javascript",
    ts: "typescript",
    py: "python",
    yml: "yaml",
    plaintext: "none",
    text: "none",
    txt: "none",
    h: "c",
    hpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    ps1: "powershell",
    tf: "hcl"
  };

  function loadScript(path) {
    if (loadedScripts.has(path)) return loadedScripts.get(path);

    const promise = new Promise(resolve => {
      const script = document.createElement("script");
      script.src = PRISM_BASE + path;
      script.async = false;
      script.dataset.matcubSyntax = VERSION;
      script.onload = () => resolve(true);
      script.onerror = () => {
        console.warn(`[MATCUB Syntax] Could not load ${path}`);
        resolve(false);
      };
      document.head.appendChild(script);
    });

    loadedScripts.set(path, promise);
    return promise;
  }

  function getLanguage(block, code) {
    const declared = (block.dataset.lang || "").trim().toLowerCase();
    const className = Array.from(code.classList).find(name => name.startsWith("language-"));
    const fromClass = className ? className.slice("language-".length).toLowerCase() : "";
    const raw = declared || fromClass || "plaintext";
    return ALIASES[raw] || raw;
  }

  function prepareCodeBlocks(scope = document) {
    const blocks = [];
    if (scope instanceof Element && scope.matches(CODE_BLOCK_SELECTOR)) blocks.push(scope);
    if (scope.querySelectorAll) blocks.push(...scope.querySelectorAll(CODE_BLOCK_SELECTOR));

    blocks.forEach(block => {
      const pre = block.querySelector("pre");
      const code = pre && pre.querySelector("code");
      if (!pre || !code) return;

      const language = getLanguage(block, code);
      if (language === "none") {
        code.classList.remove(...Array.from(code.classList).filter(name => name.startsWith("language-")));
        pre.classList.remove("line-numbers");
        return;
      }

      code.classList.remove(...Array.from(code.classList).filter(name => name.startsWith("language-")));
      code.classList.add(`language-${language}`);
      pre.classList.add("line-numbers");
      pre.setAttribute("tabindex", "0");
    });
  }

  function highlightCodeBlocks(scope = document) {
    const prism = window.Prism;
    if (!prism || !prism.highlightElement) return;

    const blocks = [];
    if (scope instanceof Element && scope.matches(CODE_BLOCK_SELECTOR)) blocks.push(scope);
    if (scope.querySelectorAll) blocks.push(...scope.querySelectorAll(CODE_BLOCK_SELECTOR));

    blocks.forEach(block => {
      const code = block.querySelector("pre > code");
      if (!code || highlighted.has(code)) return;

      const languageClass = Array.from(code.classList).find(name => name.startsWith("language-"));
      const language = languageClass ? languageClass.slice(9) : "";
      if (!language || !prism.languages[language]) return;

      prism.highlightElement(code);
      highlighted.add(code);
    });
  }

  async function initialize() {
    prepareCodeBlocks(document);

    // Prevent Prism from highlighting before all required grammars are ready.
    window.Prism = window.Prism || {};
    window.Prism.manual = true;

    const coreLoaded = await loadScript("prism.min.js");
    if (!coreLoaded || !window.Prism) {
      console.error("[MATCUB Syntax] Prism.js could not be initialized. Code remains readable without highlighting.");
      return;
    }

    window.Prism.manual = true;
    for (const component of COMPONENTS) {
      await loadScript(component);
    }

    // Re-apply aliases for common file extensions and language labels.
    if (window.Prism.languages.bash) {
      window.Prism.languages.shell = window.Prism.languages.bash;
      window.Prism.languages.sh = window.Prism.languages.bash;
    }
    if (window.Prism.languages.markup) {
      window.Prism.languages.html = window.Prism.languages.markup;
      window.Prism.languages.xml = window.Prism.languages.markup;
    }

    prepareCodeBlocks(document);
    highlightCodeBlocks(document);

    // Support lesson content inserted later (tabs, accordions, dynamically loaded examples).
    const observer = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          prepareCodeBlocks(node);
          highlightCodeBlocks(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.documentElement.dataset.syntaxHighlighter = VERSION;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
