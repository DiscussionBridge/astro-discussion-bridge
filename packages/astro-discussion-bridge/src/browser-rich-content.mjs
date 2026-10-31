import mermaid from "mermaid";
import katex from "katex";
import "katex/dist/katex.min.css";

const markerSelector = "[data-discussionbridge-rich]";
const diagramSelector = "pre > code.language-mermaid, pre > code.lang-mermaid";
const mathSelector = "pre > code.language-math, pre > code.lang-math";
const maximumDiagramText = 65536;

function unavailable(kind) {
  document.dispatchEvent(new CustomEvent("discussionbridge:rich-content-error", { detail: { kind } }));
}

export async function renderSelected(documentRoot = document) {
  const roots = new Set();
  for (const marker of documentRoot.querySelectorAll(markerSelector)) {
    const selector = marker.dataset.root || "article";
    try { for (const root of documentRoot.querySelectorAll(selector)) roots.add(root); }
    catch { unavailable("selector"); }
  }
  if (!roots.size) return;
  let initialized = false;
  for (const root of roots) {
    for (const code of root.querySelectorAll(diagramSelector)) {
      if (!code.parentElement?.isConnected) continue;
      // Mermaid resolves a limit-placeholder SVG instead of rejecting oversized
      // input. Keep the original visible before replacing any reader DOM.
      const text = code.textContent ?? "";
      if (text.length > maximumDiagramText) { unavailable("mermaid"); continue; }
      if (!initialized) {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, maxTextSize: maximumDiagramText });
        initialized = true;
      }
      const original = code.parentElement;
      const container = document.createElement("div");
      container.className = "mermaid discussionbridge-rich-diagram";
      container.textContent = text;
      original.replaceWith(container);
      try { await mermaid.run({ nodes: [container], suppressErrors: false }); }
      catch { if (container.isConnected) container.replaceWith(original); unavailable("mermaid"); }
    }
    for (const code of root.querySelectorAll(mathSelector)) {
      if (!code.parentElement?.isConnected) continue;
      const original = code.parentElement;
      const container = document.createElement("div");
      container.className = "discussionbridge-rich-math";
      try {
        katex.render(code.textContent ?? "", container, { displayMode: true, throwOnError: true, trust: false, strict: "error", maxExpand: 1000, maxSize: 10, output: "htmlAndMathml" });
        original.replaceWith(container);
      } catch { unavailable("math"); }
    }
  }
}

const key = Symbol.for("discussionbridge.astro.rich-content");
if (globalThis[key]) globalThis[key].start();
else {
  const start = () => renderSelected().catch(() => unavailable("render"));
  globalThis[key] = { start };
  document.addEventListener("astro:page-load", start);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
