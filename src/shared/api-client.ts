import { API_BASE, type Profile } from "./config.js";
import { ApiError, AuthRequiredError } from "./errors.js";
import { refreshAccessToken, requireAccessToken } from "./oauth.js";

export class AekoApiClient {
  constructor(private readonly profile: Profile) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let token = await requireAccessToken(this.profile);
    let response = await this.fetchWithToken(path, token, init);
    if (response.status === 401) {
      const refreshed = await refreshAccessToken(this.profile);
      if (!refreshed) throw new AuthRequiredError("Run OAuth authorization again from the AEKO Shop install page.");
      token = refreshed;
      response = await this.fetchWithToken(path, token, init);
    }
    return this.parse<T>(response);
  }

  /** Anonymous read against the public API — no OAuth required, so catalog
   * browsing works before (or without) an authorized install. */
  async requestPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
    headers.set("X-AEKO-Agent-Source", this.profile === "brand" ? "aeko_shop_brand_mcp" : "aeko_shop_personal_mcp");
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
    return this.parse<T>(response);
  }

  private async parse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(response.status, text || response.statusText, response.headers.get("retry-after"));
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private fetchWithToken(path: string, token: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
    headers.set("X-AEKO-Agent-Source", this.profile === "brand" ? "aeko_shop_brand_mcp" : "aeko_shop_personal_mcp");
    return fetch(`${API_BASE}${path}`, { ...init, headers });
  }
}
