import fs from "node:fs";
import path from "node:path";
import { envString } from "./env";

export type TargetKind = "ga4" | "gtm" | "meta" | "segment" | "site";

/**
 * Storage. Locally (and on Render) this is a SQLite file through better-sqlite3. When DATABASE_URL is set
 * (libsql://… or https://…, e.g. Turso's free tier) the same schema lives in a hosted libSQL database, which is what
 * makes history and alerts survive on Vercel, where /tmp is wiped between instances. Both speak SQLite SQL, so every
 * query below runs unchanged on either; the API is async so the remote driver fits.
 */

type Value = string | number | null;
interface Driver {
  all<T>(sql: string, args?: Value[]): Promise<T[]>;
  run(sql: string, args?: Value[]): Promise<{ changes: number; lastId: number }>;
  exec(sql: string): Promise<void>;
}

async function sqliteDriver(): Promise<Driver> {
  const { default: Database } = await import("better-sqlite3");
  // Installs created before the TagLens → TagSpy rename keep using their existing database file.
  const legacyPath = path.resolve(/* turbopackIgnore: true */ "./data/taglens.db");
  const defaultPath = path.resolve(/* turbopackIgnore: true */ "./data/tagspy.db");
  const configuredPath = envString("DATABASE_PATH");
  // Vercel functions run from a read-only /var/task; /tmp is the only writable (and per-instance, ephemeral) location.
  const dbPath = process.env.VERCEL ? "/tmp/tagspy.db"
    : configuredPath ? path.resolve(/* turbopackIgnore: true */ configuredPath)
    : !fs.existsSync(defaultPath) && fs.existsSync(legacyPath) ? legacyPath : defaultPath;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return {
    all: async <T>(sql: string, args: Value[] = []) => db.prepare(sql).all(...args) as T[],
    run: async (sql, args = []) => { const result = db.prepare(sql).run(...args); return { changes: result.changes, lastId: Number(result.lastInsertRowid) }; },
    exec: async (sql) => { db.exec(sql); },
  };
}

async function libsqlDriver(url: string): Promise<Driver> {
  // The web client talks HTTP to the database, so no native binary has to ship with the function.
  const { createClient } = await import("@libsql/client/web");
  const client = createClient({ url: url.replace(/^libsql:\/\//, "https://"), authToken: envString("DATABASE_AUTH_TOKEN") });
  return {
    all: async <T>(sql: string, args: Value[] = []) => (await client.execute({ sql, args })).rows.map((row) => ({ ...row })) as T[],
    run: async (sql, args = []) => { const result = await client.execute({ sql, args }); return { changes: result.rowsAffected, lastId: Number(result.lastInsertRowid ?? 0) }; },
    exec: async (sql) => { await client.executeMultiple(sql); },
  };
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    version TEXT,
    hash TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    data TEXT NOT NULL,
    UNIQUE (kind, target, hash)
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_target ON snapshots(kind, target, id);
  CREATE TABLE IF NOT EXISTS changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    from_snapshot INTEGER NOT NULL,
    to_snapshot INTEGER NOT NULL,
    from_version TEXT,
    to_version TEXT,
    detected_at TEXT NOT NULL,
    summary TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_changes_target ON changes(kind, target, id);
  CREATE TABLE IF NOT EXISTS watches (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    email TEXT NOT NULL,
    webhook TEXT,
    created_at TEXT NOT NULL,
    last_checked_at TEXT,
    last_status TEXT,
    last_error TEXT,
    UNIQUE (kind, target, email)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    watch_id TEXT NOT NULL,
    change_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT NOT NULL,
    window TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (key, window)
  );
`;

/**
 * Scan data may only exist for followed targets. Run at start-up, this removes anything left from before that rule
 * (or from a follow that was removed while the server was down).
 */
const PURGE_UNFOLLOWED = `
  DELETE FROM snapshots WHERE NOT EXISTS (SELECT 1 FROM watches w WHERE w.kind = snapshots.kind AND w.target = snapshots.target);
  DELETE FROM changes WHERE NOT EXISTS (SELECT 1 FROM watches w WHERE w.kind = changes.kind AND w.target = changes.target);
  DELETE FROM notifications WHERE watch_id NOT IN (SELECT id FROM watches);
`;

const globalForDb = globalThis as unknown as { __tagspyDriver?: Promise<Driver> };

function driver(): Promise<Driver> {
  globalForDb.__tagspyDriver ??= (async () => {
    const url = envString("DATABASE_URL");
    const instance = url ? await libsqlDriver(url) : await sqliteDriver();
    await instance.exec(SCHEMA);
    await instance.exec(PURGE_UNFOLLOWED);
    return instance;
  })().catch((error) => { globalForDb.__tagspyDriver = undefined; throw error; });
  return globalForDb.__tagspyDriver;
}

/** "sqlite" (a local file; per-instance on Vercel) or "libsql" (hosted and shared). */
export const storageKind = () => (envString("DATABASE_URL") ? "libsql" : "sqlite");

const all = async <T>(sql: string, args: Value[] = []) => (await driver()).all<T>(sql, args);
const one = async <T>(sql: string, args: Value[] = []) => (await all<T>(sql, args))[0] as T | undefined;
const run = async (sql: string, args: Value[] = []) => (await driver()).run(sql, args);

export interface SnapshotRow { id: number; kind: TargetKind; target: string; version: string | null; hash: string; fetched_at: string; last_seen_at: string }
export interface ChangeRow { id: number; kind: TargetKind; target: string; from_snapshot: number; to_snapshot: number; from_version: string | null; to_version: string | null; detected_at: string; summary: string }
export interface WatchRow { id: string; kind: TargetKind; target: string; email: string; webhook: string | null; created_at: string; last_checked_at: string | null; last_status: string | null; last_error: string | null }
export interface NotificationRow { id: number; watch_id: string; change_id: number; channel: string; status: string; error: string | null; created_at: string }

const now = () => new Date().toISOString();
const SNAPSHOT_COLUMNS = "id,kind,target,version,hash,fetched_at,last_seen_at";

export function latestSnapshot(kind: TargetKind, target: string): Promise<SnapshotRow | undefined> {
  return one<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM snapshots WHERE kind=? AND target=? ORDER BY last_seen_at DESC, id DESC LIMIT 1`, [kind, target]);
}

export function listSnapshots(kind: TargetKind, target: string): Promise<SnapshotRow[]> {
  return all<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM snapshots WHERE kind=? AND target=? ORDER BY id DESC LIMIT 200`, [kind, target]);
}

export async function snapshotData<T>(id: number): Promise<(SnapshotRow & { data: T }) | undefined> {
  const row = await one<SnapshotRow & { data: string }>("SELECT * FROM snapshots WHERE id=?", [id]);
  return row ? { ...row, data: JSON.parse(row.data) as T } : undefined;
}

/**
 * Stores a snapshot when its content hash is new. Returns the previous snapshot when the content changed,
 * so callers can compute and record a diff. Written without a transaction (INSERT OR IGNORE on the unique hash),
 * so it works the same over the remote driver; two concurrent reads of the same content can only race to a no-op.
 */
export async function upsertSnapshot(kind: TargetKind, target: string, version: string | undefined, hash: string, fetchedAt: string, data: unknown): Promise<{ snapshot: SnapshotRow; previous?: SnapshotRow; isNew: boolean }> {
  const previous = await latestSnapshot(kind, target);
  const inserted = await run("INSERT OR IGNORE INTO snapshots (kind,target,version,hash,fetched_at,last_seen_at,data) VALUES (?,?,?,?,?,?,?)", [kind, target, version ?? null, hash, fetchedAt, now(), JSON.stringify(data)]);
  if (!inserted.changes) await run("UPDATE snapshots SET last_seen_at=? WHERE kind=? AND target=? AND hash=?", [now(), kind, target, hash]);
  const snapshot = (await one<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM snapshots WHERE kind=? AND target=? AND hash=?`, [kind, target, hash]))!;
  const changed = previous && previous.hash !== hash ? previous : undefined;
  return { snapshot, previous: inserted.changes ? previous : changed, isNew: inserted.changes > 0 };
}

export async function insertChange(kind: TargetKind, target: string, from: SnapshotRow, to: SnapshotRow, summary: unknown): Promise<ChangeRow> {
  const result = await run("INSERT INTO changes (kind,target,from_snapshot,to_snapshot,from_version,to_version,detected_at,summary) VALUES (?,?,?,?,?,?,?,?)",
    [kind, target, from.id, to.id, from.version, to.version, now(), JSON.stringify(summary)]);
  return (await one<ChangeRow>("SELECT * FROM changes WHERE id=?", [result.lastId]))!;
}

export function listChanges(filter: { kind?: TargetKind; target?: string; limit?: number } = {}): Promise<ChangeRow[]> {
  const where: string[] = [];
  const args: Value[] = [];
  if (filter.kind) { where.push("kind=?"); args.push(filter.kind); }
  if (filter.target) { where.push("target=?"); args.push(filter.target); }
  return all<ChangeRow>(`SELECT * FROM changes ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`, [...args, Math.min(filter.limit ?? 100, 500)]);
}

export async function createWatch(data: { id: string; kind: TargetKind; target: string; email: string; webhook: string | null }): Promise<WatchRow> {
  await run(`INSERT INTO watches (id,kind,target,email,webhook,created_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(kind,target,email) DO UPDATE SET webhook=excluded.webhook`, [data.id, data.kind, data.target, data.email, data.webhook, now()]);
  return (await one<WatchRow>("SELECT * FROM watches WHERE kind=? AND target=? AND email=?", [data.kind, data.target, data.email]))!;
}

export function listWatches(filter: { kind?: TargetKind; target?: string; email?: string } = {}): Promise<WatchRow[]> {
  const where: string[] = [];
  const args: Value[] = [];
  for (const [key, value] of Object.entries(filter)) if (value) { where.push(`${key}=?`); args.push(value); }
  return all<WatchRow>(`SELECT * FROM watches ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`, args);
}

export function getWatch(id: string): Promise<WatchRow | undefined> {
  return one<WatchRow>("SELECT * FROM watches WHERE id=?", [id]);
}

/** Removes a follow; when nobody follows the target any more, its stored versions and changes are deleted too. */
export async function deleteWatch(id: string): Promise<boolean> {
  const watch = await getWatch(id);
  if (!watch) return false;
  await run("DELETE FROM watches WHERE id=?", [id]);
  await run("DELETE FROM notifications WHERE watch_id=?", [id]);
  const remaining = await one<{ n: number }>("SELECT COUNT(*) AS n FROM watches WHERE kind=? AND target=?", [watch.kind, watch.target]);
  if (!Number(remaining?.n)) {
    await run("DELETE FROM snapshots WHERE kind=? AND target=?", [watch.kind, watch.target]);
    await run("DELETE FROM changes WHERE kind=? AND target=?", [watch.kind, watch.target]);
  }
  return true;
}

export async function markWatchChecked(kind: TargetKind, target: string, status: "ok" | "changed" | "error", error?: string): Promise<void> {
  await run("UPDATE watches SET last_checked_at=?, last_status=?, last_error=? WHERE kind=? AND target=?", [now(), status, error ?? null, kind, target]);
}

/** Watched targets not checked since `olderThanIso`, least recently checked first (so a time-boxed run rotates through all). */
export function dueTargets(olderThanIso: string): Promise<{ kind: TargetKind; target: string }[]> {
  return all<{ kind: TargetKind; target: string }>("SELECT kind, target, MIN(COALESCE(last_checked_at, '')) AS checked FROM watches WHERE last_checked_at IS NULL OR last_checked_at < ? GROUP BY kind, target ORDER BY checked", [olderThanIso]);
}

export async function recordNotification(watchId: string, changeId: number, channel: string, status: "sent" | "failed" | "skipped", error?: string): Promise<void> {
  await run("INSERT INTO notifications (watch_id,change_id,channel,status,error,created_at) VALUES (?,?,?,?,?,?)", [watchId, changeId, channel, status, error ?? null, now()]);
}

export function listNotifications(watchId: string): Promise<NotificationRow[]> {
  return all<NotificationRow>("SELECT * FROM notifications WHERE watch_id=? ORDER BY id DESC LIMIT 50", [watchId]);
}

/** Counts a request in this hour's window; false when the key already used its `maximum`. One atomic upsert, no transaction. */
export async function checkRateLimit(key: string, maximum: number): Promise<boolean> {
  const window = new Date().toISOString().slice(0, 13);
  const row = await one<{ count: number }>("INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key,window) DO UPDATE SET count=count+1 RETURNING count", [key, window]);
  if (Math.random() < 0.02) await run("DELETE FROM rate_limits WHERE window < ?", [new Date(Date.now() - 48 * 3600_000).toISOString().slice(0, 13)]);
  return Number(row?.count ?? 1) <= maximum;
}

/**
 * Per-visit quotas (e.g. deep scans): a counter keyed by an opaque visit ID, grouped by day so old rows are cleaned up
 * with the rate limits. `consume` counts one use and returns false when the quota was already used up.
 */
const today = () => new Date().toISOString().slice(0, 10);
export async function quotaUsed(key: string): Promise<number> {
  return Number((await one<{ count: number }>("SELECT count FROM rate_limits WHERE key=? AND window=?", [key, today()]))?.count ?? 0);
}
export async function consumeQuota(key: string, maximum: number): Promise<boolean> {
  const row = await one<{ count: number }>("INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key,window) DO UPDATE SET count=count+1 RETURNING count", [key, today()]);
  if (Number(row?.count ?? 1) <= maximum) return true;
  await refundQuota(key);
  return false;
}
/** Gives a use back, for scans that failed on our side (no browser, server busy). */
export async function refundQuota(key: string): Promise<void> {
  await run("UPDATE rate_limits SET count=MAX(0, count-1) WHERE key=? AND window=?", [key, today()]);
}

export async function resetDatabaseForTests(): Promise<void> {
  if (process.env.NODE_ENV !== "test") throw new Error("Test-only database reset refused.");
  await (await driver()).exec("DELETE FROM snapshots; DELETE FROM changes; DELETE FROM watches; DELETE FROM notifications; DELETE FROM rate_limits;");
}
