import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
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
type SaveToken = (record?: TokenRecord) => Promise<void>;

const lockfile = createRequire(import.meta.url)("proper-lockfile") as {
  lock(path: string, options: {
    lockfilePath: string;
    stale: number;
    update: number;
    retries: { retries: number; minTimeout: number; maxTimeout: number; factor: number };
    onCompromised: (error: Error) => void;
  }): Promise<() => Promise<void>>;
};

const dir = join(homedir(), ".aeko-shop-mcp");
const file = join(dir, "tokens.json");

async function readStore(): Promise<StoreShape> {
  let json: string;
  try {
    json = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  try {
    const store: unknown = JSON.parse(json);
    if (store && typeof store === "object" && !Array.isArray(store)) return store as StoreShape;
  } catch {
    // JSON parser errors may contain part of the credential file.
  }
  throw new Error("The local AEKO Shop token store is invalid.");
}

async function writeStore(store: StoreShape): Promise<void> {
  const temporary = join(dir, `tokens-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(store, null, 2), { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function withTokenStore<T>(
  profile: Profile,
  action: (record: TokenRecord | undefined, save: SaveToken) => Promise<T>,
): Promise<T> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  let compromised: Error | undefined;
  const release = await lockfile.lock(dir, {
    lockfilePath: join(dir, "tokens.lock"),
    stale: 120_000,
    update: 10_000,
    retries: { retries: 85, minTimeout: 25, maxTimeout: 500, factor: 1.4 },
    onCompromised: error => { compromised = error; },
  });
  try {
    // The lock covers the whole file and stays held through OAuth requests
    // that rotate credentials. An atomic rename alone only protects readers.
    const store = await readStore();
    const result = await action(store[profile], async record => {
      if (compromised) throw compromised;
      if (record) store[profile] = record;
      else delete store[profile];
      await writeStore(store);
    });
    if (compromised) throw compromised;
    return result;
  } finally {
    if (!compromised) await release();
  }
}

export async function getToken(profile: Profile): Promise<TokenRecord | undefined> {
  const store = await readStore();
  return store[profile];
}

export async function setToken(profile: Profile, record: TokenRecord): Promise<void> {
  await withTokenStore(profile, (_current, save) => save(record));
}

export async function clearToken(profile: Profile): Promise<void> {
  await withTokenStore(profile, (_current, save) => save());
}
