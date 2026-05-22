import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Profile } from "./config.js";

export interface TokenRecord {
  client_id: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  pkce_verifier?: string;
}

type StoreShape = Partial<Record<Profile, TokenRecord>>;

const dir = join(homedir(), ".aeko-shop-mcp");
const file = join(dir, "tokens.json");

async function readStore(): Promise<StoreShape> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as StoreShape;
  } catch {
    return {};
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export async function getToken(profile: Profile): Promise<TokenRecord | undefined> {
  const store = await readStore();
  return store[profile];
}

export async function setToken(profile: Profile, record: TokenRecord): Promise<void> {
  const store = await readStore();
  store[profile] = record;
  await writeStore(store);
}

export async function clearToken(profile: Profile): Promise<void> {
  const store = await readStore();
  delete store[profile];
  await writeStore(store);
}
