/**
 * Minimal structural types for a serverless handler.
 *
 * Deliberately not importing @vercel/node: these shapes are satisfied both by
 * Vercel's runtime and by the local Vite dev middleware in vite-plugin-api.ts,
 * so the same handler code runs in both places with no adapter.
 */

export interface ApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  /** Raw body, for endpoints that serve text rather than JSON. */
  send(body: string): void;
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => unknown | Promise<unknown>;

/** Read a query param that may arrive as string | string[]. */
export function q(req: ApiRequest, key: string): string | undefined {
  const v = req.query?.[key];
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}
