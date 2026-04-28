import "dotenv/config";
import app from "./app";
import { pool } from "./db";
import logger from "./logger";

const PORT = Number(process.env.PORT ?? 3000);

async function start() {
  // Verify database connectivity before accepting traffic.
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    logger.info("Database connection verified");
  } catch (err) {
    logger.error({ err }, "Failed to connect to database — exiting");
    process.exit(1);
  }

  app.listen(PORT, () => {
    logger.info(
      { port: PORT, env: process.env.NODE_ENV },
      "ATHENA API started",
    );
  });
}

start();
