export type Profile = "personal" | "brand";

export const API_BASE = process.env.AEKO_SHOP_API_BASE ?? "https://api.aeko.shop";
export const FRONTEND_BASE = process.env.AEKO_SHOP_FRONTEND_BASE ?? "https://aeko.shop";

export const PERSONAL_SCOPES = [
  "catalog:read",
  "community:read",
  "community:write",
  "reactions:write",
  "preferences:write",
  "orders:draft",
  "self:manage",
];

export const BRAND_SCOPES = [
  "brand:featured:write",
  "brand:deals:write",
  "brand:orders:manage",
  "self:manage",
];

export function scopesFor(profile: Profile): string[] {
  return profile === "brand" ? BRAND_SCOPES : PERSONAL_SCOPES;
}
