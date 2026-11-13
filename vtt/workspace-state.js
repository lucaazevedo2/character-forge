/* Preserve actual layout state across model renders, including cloud acknowledgements. */
(() => {
  "use strict";
  function details(root) {
    return [...root.querySelectorAll("details")].map((node, index) => ({
      node,
      key:
        (node.closest("[data-sidebar-view]")?.dataset.sidebarView || "root") +
        ":" +
        (node.className ||
          node.querySelector(":scope > summary")?.textContent ||
          index),
    }));
  }
  function capture(root, key) {
    if (!root || (root.dataset.vttViewKey && root.dataset.vttViewKey !== key))
      return null;
    const active = root.ownerDocument.activeElement;
    return {
      key,
      scroll: [
        ...root.querySelectorAll(
          ".vtt-viewport,[data-sidebar-view]:not([hidden]),.vtt-inspector,.vtt-scenes",
        ),
      ].map((n) => ({
        selector: n.dataset.sidebarView
          ? '[data-sidebar-view="' + n.dataset.sidebarView + '"]'
          : "." + n.className.split(" ")[0],
        top: n.scrollTop,
        left: n.scrollLeft,
      })),
      details: details(root).map(({ node, key }) => ({ key, open: node.open })),
      drawer: root
        .querySelector(".vtt-workspace")
        ?.classList.contains("inspector-open"),
      focus:
        active &&
        root.contains(active) &&
        /^(INPUT|TEXTAREA)$/.test(active.tagName)
          ? {
              panel: active.closest("[data-sidebar-view]")?.dataset.sidebarView,
              token: active.closest("[data-token-editor]")?.dataset.editing,
              index: [...root.querySelectorAll("input,textarea")].indexOf(
                active,
              ),
              value: active.value,
              start: active.selectionStart,
              end: active.selectionEnd,
            }
          : null,
    };
  }
  function restore(root, state) {
    if (!state) return;
    const list = details(root);
    for (const old of state.details) {
      const match = list.find((n) => n.key === old.key);
      if (match) match.node.open = old.open;
    }
    if (state.drawer)
      root.querySelector(".vtt-workspace")?.classList.add("inspector-open");
    for (const s of state.scroll) {
      const n = root.querySelector(s.selector);
      if (n) {
        n.scrollTop = s.top;
        n.scrollLeft = s.left;
      }
    }
    if (state.focus) {
      const f = state.focus,
        n = [...root.querySelectorAll("input,textarea")][f.index];
      if (
        n &&
        n.closest("[data-sidebar-view]")?.dataset.sidebarView === f.panel &&
        n.closest("[data-token-editor]")?.dataset.editing === f.token
      ) {
        if (n.type !== "file" && n.type !== "checkbox" && n.type !== "radio")
          n.value = f.value;
        n.focus({ preventScroll: true });
        if (typeof f.start === "number")
          try {
            n.setSelectionRange(f.start, f.end);
          } catch {}
      }
    }
  }
  window.ForgeVTTWorkspace = { capture, restore };
})();
