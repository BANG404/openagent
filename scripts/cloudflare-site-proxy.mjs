const upstream = "https://bang404.github.io";
const basePath = "/openagent/";

/**
 * @param {Request} request
 * @param {(request: Request, options: RequestInit & {cf: {cacheEverything: boolean, cacheTtlByStatus: Record<string, number>}}) => Promise<Response>} [fetchOrigin]
 */
export async function proxySite(request, fetchOrigin = fetch) {
  const incoming = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  if (incoming.pathname === "/" || incoming.pathname === "/openagent") {
    incoming.pathname = basePath;
    return Response.redirect(incoming.href, 302);
  }
  if (!incoming.pathname.startsWith(basePath)) return new Response("Not found", { status: 404 });

  // Forward only public static reads to this fixed origin, without browser credentials.
  const target = new URL(incoming.pathname + incoming.search, upstream);
  const ttl = target.pathname.endsWith("/downloads.json") ? 60 : 300;
  const response = await fetchOrigin(new Request(target, { method: request.method }), {
    redirect: "manual",
    cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": ttl, "300-599": 0 } },
  });
  const headers = new Headers(response.headers);
  const location = headers.get("location");
  if (location) {
    const destination = new URL(location, target);
    if (destination.origin === upstream) {
      destination.host = incoming.host;
      destination.protocol = incoming.protocol;
      headers.set("location", destination.href);
    }
  }
  headers.delete("set-cookie");
  headers.delete("expires");
  headers.set("cache-control", "no-cache");
  headers.set("x-openagent-site-proxy", "Cloudflare");
  return new Response(response.body, { status: response.status, headers });
}

export default {
  /** @param {Request} request */
  fetch(request) {
    return proxySite(request);
  },
};
