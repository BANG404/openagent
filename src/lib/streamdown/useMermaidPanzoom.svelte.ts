import { onDestroy, untrack } from "svelte";
import {
  clearContainingMessageExpanded,
  portalContainingMermaid,
  setContainingMessageExpanded,
  type MermaidFullscreenPortal,
} from "./mermaidFullscreen";

type PanzoomOptions = {
  initialX?: number;
  initialY?: number;
  initialScale?: number;
  minZoom?: number;
  maxZoom?: number;
  zoomSpeed?: number;
  doubleClickScale?: number;
  activateMouseWheel?: boolean;
};

export function useMermaidPanzoom(opts: PanzoomOptions = {}) {
  let x = opts.initialX ?? 0;
  let y = opts.initialY ?? 0;
  let scale = opts.initialScale ?? 1;
  const minZoom = opts.minZoom ?? 0.1;
  const maxZoom = opts.maxZoom ?? Number.POSITIVE_INFINITY;
  const zoomSpeed = opts.zoomSpeed ?? 1;
  const doubleClickScale = opts.doubleClickScale ?? 1.75;

  let node: HTMLElement | SVGSVGElement | null = null;
  let eventTarget: HTMLElement | SVGElement | null = null;
  const listeners = new Set<() => void>();
  let dragging = false;
  let lastClientX = 0;
  let lastClientY = 0;
  let isExpanded = $state(false);
  let expandedMessageRecord: HTMLElement | null = null;
  let fullscreenPortal: MermaidFullscreenPortal | null = null;

  const clampScale = (value: number) => Math.min(maxZoom, Math.max(minZoom, value));
  const round = (value: number) => Math.round(value * 1000) / 1000;

  function apply() {
    if (!node) return;
    x = round(x);
    y = round(y);
    scale = round(clampScale(scale));
    node.style.transformOrigin = "0 0";
    node.style.transformBox = "fill-box";
    node.style.willChange = "transform";
    node.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }

  function contentElement(): SVGGraphicsElement | SVGSVGElement | null {
    if (!node) return null;
    const renderedSvg = node.querySelector(":scope > svg") as SVGSVGElement | null;
    if (!renderedSvg) return node instanceof SVGSVGElement ? node : null;
    return (renderedSvg.querySelector("g") as SVGGraphicsElement | null) ?? renderedSvg;
  }

  function contentClientRect(): DOMRect | null {
    const el = contentElement();
    if (!el) return null;
    try {
      const bbox = el.getBBox();
      const ctm = el.getScreenCTM();
      const owner = el.ownerSVGElement ?? (el instanceof SVGSVGElement ? el : null);
      if (bbox.width > 0 && bbox.height > 0 && ctm && owner) {
        const point = owner.createSVGPoint();
        const corners = [
          [bbox.x, bbox.y],
          [bbox.x + bbox.width, bbox.y],
          [bbox.x + bbox.width, bbox.y + bbox.height],
          [bbox.x, bbox.y + bbox.height],
        ].map(([px, py]) => {
          point.x = px;
          point.y = py;
          return point.matrixTransform(ctm);
        });
        const left = Math.min(...corners.map((p) => p.x));
        const right = Math.max(...corners.map((p) => p.x));
        const top = Math.min(...corners.map((p) => p.y));
        const bottom = Math.max(...corners.map((p) => p.y));
        return new DOMRect(left, top, right - left, bottom - top);
      }
    } catch {
      // Some SVG nodes cannot produce a bbox while rendering; fall back below.
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function contentBounds() {
    if (!node) return null;
    const renderedSvg = node.querySelector(":scope > svg") as SVGSVGElement | null;
    if (renderedSvg) {
      const viewBox = renderedSvg.viewBox?.baseVal;
      if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        return { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height };
      }

      const width = Number.parseFloat(renderedSvg.getAttribute("width") || "");
      const height = Number.parseFloat(renderedSvg.getAttribute("height") || "");
      if (width > 0 && height > 0) {
        return { x: 0, y: 0, width, height };
      }
    }

    const el = contentElement();
    if (!el) return null;
    try {
      const bbox = el.getBBox();
      if (bbox.width > 0 && bbox.height > 0) {
        return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
      }
    } catch {
      // Some SVG nodes cannot produce a bbox while rendering.
    }
    return null;
  }

  function contentCenter() {
    const rect = contentClientRect();
    const owner = eventTarget ?? node;
    const ownerRect = owner?.getBoundingClientRect();
    if (rect) {
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    if (ownerRect) {
      return { x: ownerRect.left + ownerRect.width / 2, y: ownerRect.top + ownerRect.height / 2 };
    }
    return null;
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    if (!node || !Number.isFinite(factor) || factor === 1) return;
    const nextScale = clampScale(scale * factor);
    const ratio = nextScale / scale;
    if (ratio === 1) return;
    const owner = eventTarget ?? node.parentElement ?? node;
    const ownerRect = owner.getBoundingClientRect();
    const ox = clientX - ownerRect.left;
    const oy = clientY - ownerRect.top;
    x = ratio * x + (1 - ratio) * ox;
    y = ratio * y + (1 - ratio) * oy;
    scale = nextScale;
    apply();
  }

  function zoomBy(factor: number) {
    const center = contentCenter();
    if (!center) return;
    zoomAt(center.x, center.y, factor);
  }

  function zoomToFit(padding = 0.05) {
    if (!node) return;
    const parent = node.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const natural = contentBounds();
    if (
      !natural ||
      natural.width <= 0 ||
      natural.height <= 0 ||
      parentRect.width <= 0 ||
      parentRect.height <= 0
    )
      return;
    scale = clampScale(
      Math.min(
        (parentRect.width * (1 - 2 * padding)) / natural.width,
        (parentRect.height * (1 - 2 * padding)) / natural.height,
      ),
    );
    x = (parentRect.width - natural.width * scale) / 2 - natural.x * scale;
    y = (parentRect.height - natural.height * scale) / 2 - natural.y * scale;
    apply();
  }

  function onWheel(e: WheelEvent) {
    if (!opts.activateMouseWheel || !node) return;
    e.preventDefault();
    e.stopPropagation();
    const sign = Math.sign(e.deltaY);
    const step = Math.min(0.25, Math.abs((zoomSpeed * e.deltaY * (e.deltaMode ? 100 : 1)) / 128));
    zoomAt(e.clientX, e.clientY, 1 - sign * step);
  }

  function onDblClick(e: MouseEvent) {
    const target = e.target as Element | null;
    if (target?.closest("[data-panzoom-ignore]")) return;
    e.preventDefault();
    zoomBy(doubleClickScale);
  }

  function startDrag(e: MouseEvent) {
    const target = e.target as Element | null;
    if (e.button !== 0 || target?.closest("[data-panzoom-ignore]")) return;
    dragging = true;
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    e.preventDefault();
    node?.style.setProperty("cursor", "grabbing");
  }

  function onPointerMove(e: MouseEvent) {
    if (!dragging) return;
    x += e.clientX - lastClientX;
    y += e.clientY - lastClientY;
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    apply();
  }

  function endDrag() {
    dragging = false;
    node?.style.setProperty("cursor", "grab");
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && isExpanded) expand(false);
  }

  function add(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, handler, options);
    const off = () => target.removeEventListener(type, handler, options);
    listeners.add(off);
  }

  function destroy() {
    fullscreenPortal?.restore();
    fullscreenPortal = null;
    clearContainingMessageExpanded(expandedMessageRecord);
    expandedMessageRecord = null;
    for (const off of listeners) off();
    listeners.clear();
  }

  function attach(target: HTMLElement | SVGSVGElement) {
    return untrack(() => {
      node = target;
      eventTarget = target.parentElement ?? target;
      apply();
      add(eventTarget, "mousedown", startDrag as EventListener, { passive: false });
      add(eventTarget, "wheel", onWheel as EventListener, { passive: false, capture: true });
      add(eventTarget, "dblclick", onDblClick as EventListener, { passive: false });
      add(window, "mousemove", onPointerMove as EventListener, { passive: false });
      add(window, "mouseup", endDrag as EventListener, { passive: true });
      add(window, "keydown", onKeyDown as EventListener, { passive: true });
      eventTarget.style.userSelect = "none";
      eventTarget.style.touchAction = "none";
      eventTarget.style.cursor = "grab";
      eventTarget.style.overscrollBehavior = "contain";
      return destroy;
    });
  }

  function expand(next: boolean) {
    if (!eventTarget) return;
    isExpanded = next;
    clearContainingMessageExpanded(expandedMessageRecord);
    expandedMessageRecord = next ? setContainingMessageExpanded(eventTarget, true) : null;
    fullscreenPortal?.restore();
    fullscreenPortal = next ? portalContainingMermaid(eventTarget) : null;
    if (!fullscreenPortal) {
      eventTarget.setAttribute("data-expanded", String(next));
    } else {
      eventTarget.setAttribute("data-expanded", "false");
    }
    requestAnimationFrame(() => zoomToFit());
  }

  onDestroy(destroy);

  return {
    attach,
    zoomToFit,
    zoomBy,
    zoomIn: (factor = 1.25) => zoomBy(factor),
    zoomOut: (factor = 1.25) => zoomBy(1 / factor),
    moveBy: (dx: number, dy: number) => {
      x += dx;
      y += dy;
      apply();
    },
    setTransform: (nx: number, ny: number, ns: number) => {
      x = nx;
      y = ny;
      scale = clampScale(ns);
      apply();
    },
    toggleExpand: () => expand(!isExpanded),
    get expanded() {
      return isExpanded;
    },
  };
}
