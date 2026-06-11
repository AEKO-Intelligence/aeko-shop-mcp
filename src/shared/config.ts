export type Profile = "personal" | "brand";

export const API_BASE = process.env.AEKO_SHOP_API_BASE ?? "https://api.aeko.shop";
export const FRONTEND_BASE = process.env.AEKO_SHOP_FRONTEND_BASE ?? "https://aeko.shop";

// Keep in sync with SHOPPER_AGENT_SCOPES / BRAND_AGENT_SCOPES in
// aeko-shop-backend/app/schemas.py — the consent endpoint rejects any scope
// outside those sets, so requesting a retired/unshipped scope breaks install.
export const PERSONAL_SCOPES = [
  "catalog:read",
  "community:read",
  "community:write",
  "preferences:write",
  "orders:draft",
  "self:manage",
];

export const BRAND_SCOPES = [
  "brand:profile:write",
  "brand:orders:manage",
  "community:read",
  "community:write",
  "self:manage",
];

export function scopesFor(profile: Profile): string[] {
  return profile === "brand" ? BRAND_SCOPES : PERSONAL_SCOPES;
}
