import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { ApprovalTask, TaskStatus, TaskSummary } from "./types";

export interface TaskStore {
  enqueue(task: Pick<ApprovalTask, "id" | "traceId" | "botId" | "signSecret" | "rawBody" | "input" | "maxAttempts">): void;
  claimNext(now: number): ApprovalTask | undefined;
  complete(id: string): void;
  fail(id: string, error: string, nextRunAt: number): void;
  summary(now: number): TaskSummary;
  findByTraceId(traceId: string): ApprovalTask | undefined;
  close(): void;
}

function rowToTask(row: Record<string, unknown>): ApprovalTask {
  return {
    id: String(row.id),
    status: row.status as ApprovalTask["status"],
    traceId: String(row.trace_id),
    botId: typeof row.bot_id === "string" && row.bot_id.length > 0 ? row.bot_id : undefined,
    signSecret: String(row.sign_secret),
    rawBody: String(row.raw_body),
    input: String(row.input),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    nextRunAt: Number(row.next_run_at),
    lastError: typeof row.last_error === "string" ? row.last_error : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function createTaskStore(dbPath: string): TaskStore {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      bot_id TEXT,
      sign_secret TEXT NOT NULL DEFAULT '',
      raw_body TEXT NOT NULL,
      input TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      max_attempts INTEGER NOT NULL,
      next_run_at INTEGER NOT NULL,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_approval_tasks_status_next_run_at
      ON approval_tasks(status, next_run_at);
  `);
  const columns = db.prepare("PRAGMA table_info(approval_tasks)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "sign_secret")) {
    db.prepare("ALTER TABLE approval_tasks ADD COLUMN sign_secret TEXT NOT NULL DEFAULT ''").run();
    db.prepare("UPDATE approval_tasks SET sign_secret = '' WHERE sign_secret IS NULL").run();
  }
  if (!columns.some((column) => column.name === "bot_id")) {
    db.prepare("ALTER TABLE approval_tasks ADD COLUMN bot_id TEXT").run();
  }

  db.prepare("UPDATE approval_tasks SET status = 'pending', updated_at = ? WHERE status = 'processing'").run(Date.now());

  const insert = db.prepare(`
    INSERT INTO approval_tasks (
      id, status, trace_id, bot_id, sign_secret, raw_body, input, attempts, max_attempts, next_run_at, created_at, updated_at
    ) VALUES (
      @id, 'pending', @traceId, @botId, @signSecret, @rawBody, @input, 0, @maxAttempts, @now, @now, @now
    )
  `);
  const selectNext = db.prepare(`
    SELECT * FROM approval_tasks
    WHERE status = 'pending' AND next_run_at <= ?
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const claim = db.prepare(`
    UPDATE approval_tasks
    SET status = 'processing', attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `);
  const complete = db.prepare(`
    UPDATE approval_tasks
    SET status = 'completed', updated_at = ?
    WHERE id = ?
  `);
  const fail = db.prepare(`
    UPDATE approval_tasks
    SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
        last_error = ?,
        next_run_at = ?,
        updated_at = ?
    WHERE id = ?
  `);
  const countByStatus = db.prepare("SELECT status, COUNT(*) as count FROM approval_tasks GROUP BY status");
  const oldestPending = db.prepare(`
    SELECT created_at FROM approval_tasks
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const recentFailures = db.prepare(`
    SELECT * FROM approval_tasks
    WHERE status = 'failed' OR last_error IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 10
  `);
  const findByTraceId = db.prepare("SELECT * FROM approval_tasks WHERE trace_id = ? ORDER BY created_at DESC LIMIT 1");

  return {
    enqueue(task) {
      insert.run({ ...task, botId: task.botId ?? null, now: Date.now() });
    },
    claimNext(now) {
      const row = selectNext.get(now) as Record<string, unknown> | undefined;
      if (!row) {
        return undefined;
      }

      const result = claim.run(now, String(row.id));
      if (result.changes !== 1) {
        return undefined;
      }

      return rowToTask({
        ...row,
        status: "processing",
        attempts: Number(row.attempts) + 1,
        updated_at: now,
      });
    },
    complete(id) {
      complete.run(Date.now(), id);
    },
    fail(id, error, nextRunAt) {
      fail.run(error, nextRunAt, Date.now(), id);
    },
    summary(now) {
      const counts: Record<TaskStatus, number> = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      };
      for (const row of countByStatus.all() as Array<{ status: TaskStatus; count: number }>) {
        counts[row.status] = Number(row.count);
      }

      const oldest = oldestPending.get() as { created_at: number } | undefined;
      const failures = (recentFailures.all() as Array<Record<string, unknown>>).map((row) => {
        const task = rowToTask(row);
        return {
          id: task.id,
          traceId: task.traceId,
          status: task.status,
          attempts: task.attempts,
          maxAttempts: task.maxAttempts,
          lastError: task.lastError,
          updatedAt: task.updatedAt,
        };
      });

      return {
        counts,
        oldestPendingAgeMs: oldest ? Math.max(0, now - Number(oldest.created_at)) : null,
        recentFailures: failures,
      };
    },
    findByTraceId(traceId) {
      const row = findByTraceId.get(traceId) as Record<string, unknown> | undefined;
      return row ? rowToTask(row) : undefined;
    },
    close() {
      db.close();
    },
  };
}
