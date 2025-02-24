import { config } from "dotenv";
config();

import type { Config } from "drizzle-kit";

export default {
    schema: ["./src/schema/*.ts"],
    out: "./drizzle",
    driver: "pg",
    dbCredentials: {
        connectionString: process.env.DATABASE_URL!,
    },
    verbose: process.env.NODE_ENV === "development",
    strict: true,
} satisfies Config;
