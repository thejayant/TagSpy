import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { envString } from "./env";

export type TargetKind = "ga4" | "gtm" | "meta" | "segment";

// Installs created before the TagLens → TagSpy rename keep using their existing database file.
const legacyPath = path.resolve(/* turbopackIgnore: true */ "./data/taglens.db");
const defaultPath = path.resolve(/* turbopackIgnore: true */ "./data/tagspy.db");
const configuredPath = envString("DATABASE_PATH");
// Vercel functions run from a read-only /var/task; /tmp is the only writable (and per-instance, ephemeral) location.
const dbPath = process.env.VERCEL ? "/tmp/tagspy.db"
  : configuredPath ? path.resolve(/* turbopackIgnore: true */ configuredPath)
  : !fs.existsSync(defaultPath) && fs.existsSync(legacyPath) ? legacyPath : defaultPath;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalForDb = globalThis as unknown as { __tagspyDb?: Database.Database };
const db = globalForDb.__tagspyDb ?? new Database(dbPath);
globalForDb.__tagspyDb = db;
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec(`
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
`);

export interface SnapshotRow { id: number; kind: TargetKind; target: string; version: string | null; hash: string; fetched_at: string; last_seen_at: string }
export interface ChangeRow { id: number; kind: TargetKind; target: string; from_snapshot: number; to_snapshot: number; from_version: string | null; to_version: string | null; detected_at: string; summary: string }
export interface WatchRow { id: string; kind: TargetKind; target: string; email: string; webhook: string | null; created_at: string; last_checked_at: string | null; last_status: string | null; last_error: string | null }
export interface NotificationRow { id: number; watch_id: string; change_id: number; channel: string; status: string; error: string | null; created_at: string }

const now = () => new Date().toISOString();

export function latestSnapshot(kind: TargetKind, target: string): SnapshotRow | undefined {
  return db.prepare("SELECT id,kind,target,version,hash,fetched_at,last_seen_at FROM snapshots WHERE kind=? AND target=? ORDER BY last_seen_at DESC, id DESC LIMIT 1").get(kind, target) as SnapshotRow | undefined;
}

export function listSnapshots(kind: TargetKind, target: string): SnapshotRow[] {
  return db.prepare("SELECT id,kind,target,version,hash,fetched_at,last_seen_at FROM snapshots WHERE kind=? AND target=? ORDER BY id DESC LIMIT 200").all(kind, target) as SnapshotRow[];
}

export function snapshotData<T>(id: number): (SnapshotRow & { data: T }) | undefined {
  const row = db.prepare("SELECT * FROM snapshots WHERE id=?").get(id) as (SnapshotRow & { data: string }) | undefined;
  return row ? { ...row, data: JSON.parse(row.data) as T } : undefined;
}

/**
 * Stores a snapshot when its content hash is new. Returns the previous snapshot when the content changed,
 * so callers can compute and record a diff.
 */
export function upsertSnapshot(kind: TargetKind, target: string, version: string | undefined, hash: string, fetchedAt: string, data: unknown): { snapshot: SnapshotRow; previous?: SnapshotRow; isNew: boolean } {
  return db.transaction(() => {
    const previous = latestSnapshot(kind, target);
    const existing = db.prepare("SELECT id FROM snapshots WHERE kind=? AND target=? AND hash=?").get(kind, target, hash) as { id: number } | undefined;
    if (existing) {
      db.prepare("UPDATE snapshots SET last_seen_at=? WHERE id=?").run(now(), existing.id);
      const snapshot = db.prepare("SELECT id,kind,target,version,hash,fetched_at,last_seen_at FROM snapshots WHERE id=?").get(existing.id) as SnapshotRow;
      return { snapshot, previous: previous && previous.hash !== hash ? previous : undefined, isNew: false };
    }
    const result = db.prepare("INSERT INTO snapshots (kind,target,version,hash,fetched_at,last_seen_at,data) VALUES (?,?,?,?,?,?,?)")
      .run(kind, target, version ?? null, hash, fetchedAt, now(), JSON.stringify(data));
    const snapshot = db.prepare("SELECT id,kind,target,version,hash,fetched_at,last_seen_at FROM snapshots WHERE id=?").get(result.lastInsertRowid) as SnapshotRow;
    return { snapshot, previous, isNew: true };
  })();
}

export function insertChange(kind: TargetKind, target: string, from: SnapshotRow, to: SnapshotRow, summary: unknown): ChangeRow {
  const result = db.prepare("INSERT INTO changes (kind,target,from_snapshot,to_snapshot,from_version,to_version,detected_at,summary) VALUES (?,?,?,?,?,?,?,?)")
    .run(kind, target, from.id, to.id, from.version, to.version, now(), JSON.stringify(summary));
  return db.prepare("SELECT * FROM changes WHERE id=?").get(result.lastInsertRowid) as ChangeRow;
}

export function listChanges(filter: { kind?: TargetKind; target?: string; limit?: number } = {}): ChangeRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.kind) { where.push("kind=?"); args.push(filter.kind); }
  if (filter.target) { where.push("target=?"); args.push(filter.target); }
  return db.prepare(`SELECT * FROM changes ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT ?`).all(...args, Math.min(filter.limit ?? 100, 500)) as ChangeRow[];
}

export function createWatch(data: { id: string; kind: TargetKind; target: string; email: string; webhook: string | null }): WatchRow {
  db.prepare(`INSERT INTO watches (id,kind,target,email,webhook,created_at) VALUES (@id,@kind,@target,@email,@webhook,@created)
    ON CONFLICT(kind,target,email) DO UPDATE SET webhook=excluded.webhook`).run({ ...data, created: now() });
  return db.prepare("SELECT * FROM watches WHERE kind=? AND target=? AND email=?").get(data.kind, data.target, data.email) as WatchRow;
}

export function listWatches(filter: { kind?: TargetKind; target?: string; email?: string } = {}): WatchRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  for (const [key, value] of Object.entries(filter)) if (value) { where.push(`${key}=?`); args.push(value); }
  return db.prepare(`SELECT * FROM watches ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`).all(...args) as WatchRow[];
}

export function getWatch(id: string): WatchRow | undefined {
  return db.prepare("SELECT * FROM watches WHERE id=?").get(id) as WatchRow | undefined;
}

export function deleteWatch(id: string): boolean {
  return db.prepare("DELETE FROM watches WHERE id=?").run(id).changes > 0;
}

export function markWatchChecked(kind: TargetKind, target: string, status: "ok" | "changed" | "error", error?: string): void {
  db.prepare("UPDATE watches SET last_checked_at=?, last_status=?, last_error=? WHERE kind=? AND target=?").run(now(), status, error ?? null, kind, target);
}

export function dueTargets(olderThanIso: string): { kind: TargetKind; target: string }[] {
  return db.prepare("SELECT DISTINCT kind, target FROM watches WHERE last_checked_at IS NULL OR last_checked_at < ?").all(olderThanIso) as { kind: TargetKind; target: string }[];
}

export function recordNotification(watchId: string, changeId: number, channel: string, status: "sent" | "failed" | "skipped", error?: string): void {
  db.prepare("INSERT INTO notifications (watch_id,change_id,channel,status,error,created_at) VALUES (?,?,?,?,?,?)").run(watchId, changeId, channel, status, error ?? null, now());
}

export function listNotifications(watchId: string): NotificationRow[] {
  return db.prepare("SELECT * FROM notifications WHERE watch_id=? ORDER BY id DESC LIMIT 50").all(watchId) as NotificationRow[];
}

export function checkRateLimit(key: string, maximum: number): boolean {
  const window = new Date().toISOString().slice(0, 13);
  return db.transaction(() => {
    const row = db.prepare("SELECT count FROM rate_limits WHERE key=? AND window=?").get(key, window) as { count: number } | undefined;
    if ((row?.count ?? 0) >= maximum) return false;
    db.prepare("INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key,window) DO UPDATE SET count=count+1").run(key, window);
    db.prepare("DELETE FROM rate_limits WHERE window < ?").run(new Date(Date.now() - 48 * 3600_000).toISOString().slice(0, 13));
    return true;
  })();
}

export function resetDatabaseForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Test-only database reset refused.");
  db.exec("DELETE FROM snapshots; DELETE FROM changes; DELETE FROM watches; DELETE FROM notifications; DELETE FROM rate_limits;");
}
