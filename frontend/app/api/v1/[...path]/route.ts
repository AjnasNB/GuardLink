import { getCloudflareContext } from "@opennextjs/cloudflare";
export const dynamic = "force-dynamic";
async function proxy(request: Request) {
  let service: CloudflareEnv["API"] | undefined;
  try {
    service = (await getCloudflareContext({ async: true })).env.API;
  } catch {
    /* Next dev uses the local API process. */
  }
  const url = new URL(request.url);
  const target = new URL(
    url.pathname + url.search,
    process.env.API_URL || "http://localhost:8787",
  );
  if (Number(request.headers.get("content-length") ?? 0) > 5 * 1024 * 1024)
    return Response.json(
      { error: "The upload is too large." },
      { status: 413 },
    );
  try {
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer();
    if (body && body.byteLength > 5 * 1024 * 1024)
      return Response.json(
        { error: "The upload is too large." },
        { status: 413 },
      );
    const init = {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body,
      redirect: "manual" as const,
    };
    const response = service
      ? await service.fetch(target.toString(), init)
      : await fetch(target, init);
    const headers = new Headers();
    response.headers.forEach((value, key) => headers.append(key, value));
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers,
    });
  } catch {
    return Response.json(
      {
        error:
          "The community service is temporarily unavailable. Please try again.",
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
