import { loadConfig } from "./config";
import { startServer } from "./server";

async function main(): Promise<void> {
  try {
    const config = await loadConfig();
    await startServer(config);
    // eslint-disable-next-line no-console
    console.log(`UCAP bridge listening on port ${config.listenPort}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "启动失败";
    // eslint-disable-next-line no-console
    console.error(message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

export { main };
