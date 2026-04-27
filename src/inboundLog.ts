import fs from "node:fs/promises";
import path from "node:path";

export interface InboundLogEntry {
  timestamp: string;
  traceId: string;
  botId?: string;
  rawBody: string;
}

export async function appendInboundLog(logPath: string, entry: InboundLogEntry): Promise<void> {
  const resolvedPath = path.resolve(process.cwd(), logPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.appendFile(resolvedPath, `${JSON.stringify(entry)}\n`, "utf8");
}
