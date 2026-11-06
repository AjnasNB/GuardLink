export async function uploadCiphertext(
  url: string,
  batch: string,
  bytes: ArrayBuffer,
) {
  if (!url || !batch) return null;
  const endpoint = new URL("/bytes", url);
  if (endpoint.protocol !== "https:")
    throw new Error("Evidence service requires HTTPS.");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "swarm-postage-batch-id": batch,
      "Content-Type": "application/octet-stream",
      "swarm-deferred-upload": "false",
    },
    body: bytes,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Evidence storage unavailable (${res.status}).`);
  const result = (await res.json()) as { reference: string };
  if (!/^[0-9a-f]{64}$/i.test(result.reference))
    throw new Error("Invalid ciphertext reference.");
  return result.reference;
}
export async function downloadCiphertext(url: string, reference: string, timeoutMs = 30000) {
  if (!/^[0-9a-f]{64}$/i.test(reference))
    throw new Error("Invalid evidence reference.");
  const response = await fetch(new URL(`/bytes/${reference}`, url), {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error("Evidence retrieval unavailable.");
  return response.arrayBuffer();
}
