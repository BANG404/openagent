const SCROLLBAR_ACTIVE_ATTRIBUTE = "data-scrollbar-active";
const SCROLLBAR_IDLE_DELAY_MS = 800;
const SCROLLABLE_OVERFLOW = /^(auto|scroll|overlay)$/;

function isScrollable(element: Element): boolean {
  const style = window.getComputedStyle(element);
  const scrollsHorizontally =
    element.scrollWidth > element.clientWidth && SCROLLABLE_OVERFLOW.test(style.overflowX);
  const scrollsVertically =
    element.scrollHeight > element.clientHeight && SCROLLABLE_OVERFLOW.test(style.overflowY);

  return scrollsHorizontally || scrollsVertically;
}

function findScrollableAncestor(target: EventTarget | null): Element | null {
  let element = target instanceof Element ? target : null;

  while (element) {
    if (isScrollable(element)) return element;
    element = element.parentElement;
  }

  return null;
}

export function installScrollbarActivity(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const hideTimers = new Map<Element, number>();
  let pointerFrame = 0;
  let pendingPointerTarget: EventTarget | null = null;

  const showTemporarily = (element: Element) => {
    const existingTimer = hideTimers.get(element);
    if (existingTimer !== undefined) window.clearTimeout(existingTimer);

    element.setAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE, "true");
    hideTimers.set(
      element,
      window.setTimeout(() => {
        element.removeAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE);
        hideTimers.delete(element);
      }, SCROLLBAR_IDLE_DELAY_MS),
    );
  };

  const handleScroll = (event: Event) => {
    if (event.target instanceof Element) showTemporarily(event.target);
  };

  const handlePointerMove = (event: PointerEvent) => {
    pendingPointerTarget = event.target;
    if (pointerFrame) return;

    pointerFrame = window.requestAnimationFrame(() => {
      pointerFrame = 0;
      const scrollable = findScrollableAncestor(pendingPointerTarget);
      pendingPointerTarget = null;
      if (scrollable) showTemporarily(scrollable);
    });
  };

  document.addEventListener("scroll", handleScroll, true);
  document.addEventListener("pointermove", handlePointerMove, { capture: true, passive: true });

  return () => {
    document.removeEventListener("scroll", handleScroll, true);
    document.removeEventListener("pointermove", handlePointerMove, true);
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    for (const [element, timer] of hideTimers) {
      window.clearTimeout(timer);
      element.removeAttribute(SCROLLBAR_ACTIVE_ATTRIBUTE);
    }
    hideTimers.clear();
  };
}
