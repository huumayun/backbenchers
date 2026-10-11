const CACHE_NAME = "ebook-app-shell-v2";
const PRECACHE_ROUTES = ["/", "/read", "/flipbook", "/dashboard", "/login"];

async function warmRouteAndScripts(cache, routePath) {
  try {
    const res = await fetch(routePath, { cache: "no-cache" });
    if (!res || res.status !== 200) return;
    await cache.put(new Request(self.location.origin + routePath), res.clone());

    const html = await res.text();
    const assetMatches = html.match(/\/_next\/static\/[^"'\s)>]+/g) || [];
    const uniqueAssets = Array.from(new Set(assetMatches));
    await Promise.all(
      uniqueAssets.map(async (assetPath) => {
        try {
          const fullUrl = self.location.origin + assetPath;
          const existing = await cache.match(fullUrl);
          if (!existing) {
            const assetRes = await fetch(fullUrl);
            if (assetRes && assetRes.status === 200) {
              await cache.put(fullUrl, assetRes);
            }
          }
        } catch {
          // ignore individual asset error
        }
      })
    );
  } catch {
    // ignore offline error
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        PRECACHE_ROUTES.map((route) => warmRouteAndScripts(cache, route))
      );
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "WARM_OFFLINE_CACHE") return;
  const extraUrls = Array.isArray(event.data.urls) ? event.data.urls : [];

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        extraUrls.map(async (u) => {
          try {
            const existing = await cache.match(u);
            if (!existing) {
              const r = await fetch(u);
              if (r && r.status === 200) {
                await cache.put(u, r);
              }
            }
          } catch {
            // ignore
          }
        })
      );
      await Promise.all(
        PRECACHE_ROUTES.map((route) => warmRouteAndScripts(cache, route))
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache dynamic API routes in SW; IndexedDB handles offline book data
  if (url.pathname.startsWith("/api/")) return;

  // 1. Static Next.js chunks, CSS, icons, fonts -> Cache-First, fallback to Network & store in Cache
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".json")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached =
          (await cache.match(request)) ||
          (await cache.match(url.origin + url.pathname));
        if (cached) return cached;
        const netRes = await fetch(request);
        if (netRes && netRes.status === 200) {
          cache.put(request, netRes.clone());
          cache.put(url.origin + url.pathname, netRes.clone());
        }
        return netRes;
      })
    );
    return;
  }

  // 2. Next.js RSC requests (?_rsc=...) -> Network-First, fallback to cached RSC for same pathname
  const isRsc =
    url.searchParams.has("_rsc") || request.headers.get("RSC") === "1";
  if (isRsc) {
    const cleanRscKey = url.origin + url.pathname + "?__rsc_cache=1";
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy.clone());
              cache.put(cleanRscKey, copy);
            });
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const exact = await cache.match(request);
          if (exact) return exact;
          const byPathname = await cache.match(cleanRscKey);
          if (byPathname) return byPathname;
          return Response.error();
        })
    );
    return;
  }

  // 3. Page navigations & HTML routes -> Network-First, fallback to Cache (matching pathname ignoring query params like ?ch=0&page=1)
  if (
    request.mode === "navigate" ||
    PRECACHE_ROUTES.includes(url.pathname)
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy.clone());
              cache.put(new Request(url.origin + url.pathname), copy);
            });
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const exactMatch = await cache.match(request);
          if (exactMatch) return exactMatch;
          const cleanMatch = await cache.match(url.origin + url.pathname);
          if (cleanMatch) return cleanMatch;
          const rootMatch = await cache.match(url.origin + "/");
          if (rootMatch) return rootMatch;
          return Response.error();
        })
    );
  }
});
