// Clean punk URLs. A request for /1812 (a single numeric path segment) serves
// the app shell (/index.html); the client reads the path and renders that punk.
// Anything non-numeric — /about, /favicon.ico, any real file or route — falls
// straight through to normal static-asset handling via next().
export async function onRequest(context) {
  const { params, request, next, env } = context;
  if (/^\d+$/.test(params.punk)) {
    // Serve the app shell at "/" (not "/index.html", which Pages 308-redirects
    // to "/", dropping the punk path). The browser URL stays /1812.
    const url = new URL(request.url);
    url.pathname = "/";
    return env.ASSETS.fetch(new Request(url, request));
  }
  return next();
}
