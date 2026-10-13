// DOM-only probe appended to the temporary native-test package copy.
(() => {
  /** @type {{scope: string; conversation_id: string; branch_id: string} | undefined} */
  let context;
  /** @type {number | undefined} */
  let frame;
  function report() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const canvas = document.getElementById("canvas");
      if (!context || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nodes = [...document.querySelectorAll(".node")].map((element) => {
        const node = /** @type {HTMLElement} */ (element);
        const bounds = node.getBoundingClientRect();
        return {
          id: node.dataset.id,
          completed: node.classList.contains("completed"),
          status: node.querySelector(".status")?.textContent,
          text: node.textContent,
          x: bounds.left + bounds.width / 2 - rect.left,
          top: bounds.top - rect.top,
          bottom: bounds.bottom - rect.top,
        };
      });
      parent.postMessage(
        {
          type: "fixture:graph-diagram",
          scope: context.scope,
          conversationId: context.conversation_id,
          branchId: context.branch_id,
          locale: document.documentElement.lang,
          dark: document.documentElement.classList.contains("dark"),
          objective: document.getElementById("objective")?.textContent,
          progress: document.getElementById("progress")?.textContent,
          error: !document.getElementById("error")?.hidden,
          nodes,
          edges: [...document.querySelectorAll(".edge")].map((element) => ({
            from: /** @type {SVGPathElement} */ (element).dataset.from,
            to: /** @type {SVGPathElement} */ (element).dataset.to,
            path: element.getAttribute("d"),
            arrow: element.getAttribute("marker-end"),
            stroke: getComputedStyle(element).stroke,
            arrowFill: getComputedStyle(document.querySelector("#arrow-completed path") ?? element)
              .fill,
          })),
        },
        "*",
      );
    });
  }
  window.addEventListener("message", (event) => {
    if (event.source === parent && event.data?.type === "openagent:sidebar-context") {
      context = event.data;
      report();
    }
  });
  new MutationObserver(report).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  new ResizeObserver(report).observe(document.body);
})();
