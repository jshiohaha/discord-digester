import { config } from "dotenv";
config();

import { drizzle } from "drizzle-orm/node-postgres";
import { FastifyBaseLogger } from "fastify";
import { Client } from "pg";
import { EnvConfig, isDevelopment } from "./env";
import { channels } from "./schema/channels";
import {
    textBasedChannelCheckpointer,
    threadBasedChannelCheckpointer,
} from "./schema/checkpointer";
import { messages } from "./schema/messages";

const client = new Client({
    connectionString: EnvConfig.DATABASE_URL,
});

const db = drizzle(client, {
    schema: {
        channels,
        messages,
        textBasedChannelCheckpointer,
        threadBasedChannelCheckpointer,
    },
    logger: isDevelopment(),
});

// Add connection management
let isConnecting = false;
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_INTERVAL = 5000; // 5 seconds

export const connectDB = async (opts?: { logger?: FastifyBaseLogger }) => {
    if (isConnecting) return;

    try {
        isConnecting = true;
        await client.connect();
        retryCount = 0;
        opts?.logger?.info?.("Database connected ✅");

        // Add error handler for the database connection
        client.on("error", async (err) => {
            opts?.logger?.error?.(err, "Database connection error");

            // Try to reconnect if the connection is terminated
            if (!isConnecting && err.message.includes("terminated")) {
                opts?.logger?.info?.("Attempting to reconnect to database...");
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    setTimeout(() => connectDB(opts), RETRY_INTERVAL);
                } else {
                    opts?.logger?.error?.(
                        `Failed to reconnect after ${MAX_RETRIES} attempts`
                    );
                }
            }
        });
    } catch (err) {
        opts?.logger?.error?.(err, "Database connection failed ❌");
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            setTimeout(() => connectDB(opts), RETRY_INTERVAL);
        }
    } finally {
        isConnecting = false;
    }
};

export const disconnectDB = async (opts?: { logger?: FastifyBaseLogger }) => {
    try {
        await client.end();
    } catch (err) {
        opts?.logger?.error(err, "Error disconnecting from database");
    }
};

export { client, db };
