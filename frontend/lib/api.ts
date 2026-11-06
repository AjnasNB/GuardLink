export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = new URL(`/api/v1${path}`, "https://guardlink.invalid");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  const response = await fetch(url.pathname + url.search, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "Something went wrong. Please try again.",
    );
  return data as T;
}
export type Member = {
  id: string;
  wallet: string | null;
  name: string;
  role: string;
  verified: number;
  demo: number;
  community_id: string;
  community_name?: string | null;
};
export type CommunityProfile = {
  id: string;
  name: string;
  location: string;
  description: string;
  joiningCriteria: string;
  canEdit: boolean;
  membership: "verified" | "requested" | "eligible_to_apply";
};
export type Config = {
  testnet: boolean;
  chainId: number;
  poolAddress: string;
  privyAppId: string;
  features: Record<string, boolean>;
};
export const short = (s: string | null | undefined) =>
  s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "Not connected";
export const money = (n: string | number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
        Number(n),
      );
