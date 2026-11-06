import type { Claim } from "@guardlink/domain";
export const now = () => new Date().toISOString();
export const json = <T>(value: string) => JSON.parse(value) as T;
export const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const hash = async (value: string | ArrayBuffer) =>
  hex(
    await crypto.subtle.digest(
      "SHA-256",
      typeof value === "string" ? new TextEncoder().encode(value) : value,
    ),
  );
export function base64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function unbase64(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export async function encryptionKey(secret: string) {
  if (!secret) throw new Error("Private evidence storage is not configured.");
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encrypt(bytes: ArrayBuffer, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    bytes,
  );
  return { ciphertext, iv: base64(iv) };
}
export async function decrypt(bytes: ArrayBuffer, iv: string, secret: string) {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unbase64(iv) },
    await encryptionKey(secret),
    bytes,
  );
}
export async function loadClaim(db: D1Database, id: string) {
  const row = await db
    .prepare("SELECT data,revision FROM claims WHERE id=?")
    .bind(id)
    .first<{ data: string; revision: number }>();
  if (!row) throw new Error("Claim not found.");
  return { ...json<Claim>(row.data), storageRevision: row.revision };
}
export function prepareClaimUpdate(
  db: D1Database,
  claim: Claim,
  previousRevision: number,
) {
  const persisted = { ...claim } as Claim & { storageRevision?: number };
  delete persisted.storageRevision;
  return db
    .prepare(
      "UPDATE claims SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
    )
    .bind(JSON.stringify(persisted), now(), claim.id, previousRevision);
}
export async function saveClaim(
  db: D1Database,
  claim: Claim,
  previousRevision: number,
) {
  const result = await prepareClaimUpdate(db, claim, previousRevision).run();
  if (result.meta.changes !== 1)
    throw new Error("This case changed. Refresh before continuing.");
}
export async function event(
  db: D1Database,
  claimId: string | null,
  kind: string,
  data: Record<string, unknown>,
) {
  await db
    .prepare(
      "INSERT INTO events(id,claim_id,kind,public_data,created_at) VALUES(?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), claimId, kind, JSON.stringify(data), now())
    .run();
}
