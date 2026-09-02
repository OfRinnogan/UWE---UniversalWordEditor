// Typed fetch layer over the FastAPI backend. Base is the relative "/api" prefix so the
// same code works in dev (Vite proxies /api → :8001) and behind a single origin in prod.
import { getStoredToken, clearStoredToken } from "@/lib/tokenStorage";

const BASE = "/api";

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // FastAPI reports request-validation failures as 422 with a {detail: [...]} body.
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    if (res.status === 401) {
      // Session expired or token invalid — clear it and bounce to the login
      // screen. A hard redirect (not react-router) keeps this working from
      // anywhere, including outside any router context.
      clearStoredToken();
      if (!location.pathname.startsWith("/login")) {
        location.href = "/login";
      }
    }
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// For FormData bodies (file uploads) — deliberately does NOT set Content-Type itself;
// the browser must set it (with the correct multipart boundary) when it sees the body
// is a FormData instance, which only happens if no Content-Type is set manually here.
async function requestUpload<T>(method: string, path: string, form: FormData): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { method, headers, body: form });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    if (res.status === 401) {
      clearStoredToken();
      if (!location.pathname.startsWith("/login")) {
        location.href = "/login";
      }
    }
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// The response type is yours to declare: nothing infers across the Python boundary, so a
// TS interface here mirrors the endpoint's Pydantic model by hand — keep the two in sync.
export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
export const apiUpload = <T>(path: string, form: FormData) => requestUpload<T>("POST", path, form);
