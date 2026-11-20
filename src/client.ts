/**
 * Minimal client for the PostalKit REST API (https://postalkit.mx/docs).
 */

export const DEFAULT_BASE_URL = "https://api.postalkit.mx";
export const VERSION = "0.1.1";

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface PostalKitClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** An error response from the API, or a failure to reach it (status 0). */
export class PostalKitError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PostalKitError";
  }
}

export class PostalKitClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PostalKitClientOptions) {
    if (!options.apiKey?.trim()) {
      throw new Error("A PostalKit API key is required. Get a free one at https://postalkit.mx/register.");
    }

    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /** Send an authenticated GET and return the decoded JSON body. Undefined/null query values are dropped. */
  async get(path: string, query: Query = {}): Promise<unknown> {
    const url = new URL(this.baseUrl + "/" + path.replace(/^\/+/, ""));

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "User-Agent": `postalkit-mcp/${VERSION}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new PostalKitError(`Could not reach the PostalKit API: ${(error as Error).message}`, 0);
    }

    const text = await response.text();
    let body: unknown = {};

    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }

    if (response.ok) {
      return body;
    }

    const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const message =
      (typeof record.message === "string" && record.message) ||
      (typeof record.error === "string" && record.error) ||
      `PostalKit API returned HTTP ${response.status}.`;

    throw new PostalKitError(message, response.status, record);
  }
}

/** Encode one path segment, trimming whitespace that users paste in with postal codes. */
export function segment(value: string | number): string {
  return encodeURIComponent(String(value).trim());
}
