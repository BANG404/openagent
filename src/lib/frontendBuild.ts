/**
 * Build identity of the frontend bundle that is executing.
 *
 * `vite.config.js` replaces `__OPENAGENT_FRONTEND_BUILD__` with the frontend
 * product version and the abbreviated revision of the checkout the bundle was
 * built from, so an embedded frontend, an installed frontend resource, and a
 * development bundle each identify the code that is actually executing instead
 * of the desktop shell version they happen to ship with. No product surface
 * presents this identity: the About view shows only the product release.
 *
 * The revision is fixed when the Vite server starts, so a long-running
 * development server keeps reporting the revision it was started from.
 */
declare const __OPENAGENT_FRONTEND_BUILD__: string | undefined;

/** Empty when the bundle was not stamped, which only a broken build produces. */
export const frontendBuildLabel: string =
  typeof __OPENAGENT_FRONTEND_BUILD__ === "string" ? __OPENAGENT_FRONTEND_BUILD__ : "";
