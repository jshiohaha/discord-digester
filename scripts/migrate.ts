import { config } from "dotenv";
config();

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
// @ts-ignore
import pg from "pg";
const { Pool } = pg;

const runMigrations = async () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    const db = drizzle(pool);

    console.log("⏳ Running migrations...");

    await migrate(db, { migrationsFolder: "./drizzle" });

    console.log("✅ Migrations completed!");

    await pool.end();
};

runMigrations().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
});
