import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { ApprovalTask } from "./types";

export interface TaskStore {
  enqueue(task: Pick<ApprovalTask, "id" | "traceId" | "rawBody" | "input" | "maxAttempts">): void;
  claimNext(now: number): ApprovalTask | undefined;
  complete(id: string): void;
  fail(id: string, error: string, nextRunAt: number): void;
  close(): void;
}

function rowToTask(row: Record<string, unknown>): ApprovalTask {
  return {
    id: String(row.id),
    status: row.status as ApprovalTask["status"],
    traceId: String(row.trace_id),
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

  db.prepare("UPDATE approval_tasks SET status = 'pending', updated_at = ? WHERE status = 'processing'").run(Date.now());

  const insert = db.prepare(`
    INSERT INTO approval_tasks (
      id, status, trace_id, raw_body, input, attempts, max_attempts, next_run_at, created_at, updated_at
    ) VALUES (
      @id, 'pending', @traceId, @rawBody, @input, 0, @maxAttempts, @now, @now, @now
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

  return {
    enqueue(task) {
      insert.run({ ...task, now: Date.now() });
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
    close() {
      db.close();
    },
  };
}
