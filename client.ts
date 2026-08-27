import type { WebParameters } from "./schema.ts";

const DEFAULT_BASE_URL = "https://chatgpt.com/backend-api";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

type SearchOptions = {
  token: string;
  baseUrl?: string;
  id: string;
  model: string;
  commands: WebParameters;
  signal?: AbortSignal;
};

export type SearchImage = {
  data: string;
  mimeType: string;
};

type SearchResponse = {
  output: string;
  results?: unknown[];
  images: SearchImage[];
};

const DATA_URI = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/is;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MIME_KEYS = ["mimeType", "mime_type", "media_type", "content_type"];

function fromDataUri(value: string): SearchImage | undefined {
  const match = DATA_URI.exec(value.trim());
  if (!match) return;
  const data = match[2].replace(/\s/g, "");
  if (!BASE64.test(data)) return;
  return { mimeType: match[1], data };
}

function mimeOf(record: Record<string, unknown>): string | undefined {
  for (const key of MIME_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.startsWith("image/")) return value;
  }
}

export function imagesFromResults(results: unknown[] | undefined): SearchImage[] {
  if (!results) return [];
  const images: SearchImage[] = [];
  const seen = new Set<string>();
  const visiting = new Set<object>();
  const add = (image: SearchImage) => {
    const key = `${image.mimeType}:${image.data}`;
    if (seen.has(key)) return;
    seen.add(key);
    images.push(image);
  };
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      const image = fromDataUri(value);
      if (image) add(image);
      return;
    }
    if (!value || typeof value !== "object" || visiting.has(value)) return;
    visiting.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    const record = value as Record<string, unknown>;
    const mimeType = mimeOf(record);
    if (mimeType && typeof record.data === "string" && record.data) {
      const data = fromDataUri(record.data)?.data ?? record.data.replace(/\s/g, "");
      if (BASE64.test(data)) add({ mimeType, data });
    }
    for (const [key, nested] of Object.entries(record)) {
      if (key !== "data" || !mimeType || typeof nested !== "string") walk(nested);
    }
  };
  for (const result of results) walk(result);
  return images;
}

export function resolveSearchUrl(baseUrl?: string): string {
  const base = (baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (base.endsWith("/codex/alpha/search")) return base;
  if (base.endsWith("/codex")) return `${base}/alpha/search`;
  return `${base}/codex/alpha/search`;
}

function extractAccountId(token: string): string {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    const encodedPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload: unknown = JSON.parse(
      atob(encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=")),
    );
    if (!payload || typeof payload !== "object") throw new Error();
    const auth = (payload as Record<string, unknown>)[JWT_CLAIM_PATH];
    if (!auth || typeof auth !== "object") throw new Error();
    const accountId = (auth as Record<string, unknown>).chatgpt_account_id;
    if (typeof accountId !== "string" || !accountId) throw new Error();
    return accountId;
  } catch {
    throw new Error("Search token must be a JWT with a chatgpt_account_id claim");
  }
}

function redact(value: string, token: string): string {
  return value.split(token).join("[REDACTED]");
}

export async function search(options: SearchOptions): Promise<SearchResponse> {
  const response = await fetch(resolveSearchUrl(options.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.token}`,
      "chatgpt-account-id": extractAccountId(options.token),
      originator: "codex_cli_rs",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: options.id,
      model: options.model,
      commands: Object.fromEntries(
        Object.entries(options.commands).filter(
          ([, value]) => !Array.isArray(value) || value.length > 0,
        ),
      ),
      settings: { allowed_callers: ["direct"], external_web_access: true },
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const excerpt = redact(await response.text(), options.token)
      .slice(0, 200)
      .trim();
    throw new Error(
      `Search request failed with status ${response.status}${excerpt ? `: ${excerpt}` : ""}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Search response is not valid JSON");
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).output !== "string"
  ) {
    throw new Error("Search response is missing output");
  }

  const { output, results } = body as { output: string; results?: unknown };
  const list = Array.isArray(results) ? results : undefined;
  return { output, ...(list ? { results: list } : {}), images: imagesFromResults(list) };
}
