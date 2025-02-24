import { config } from "dotenv";
config();

import { drizzle } from "drizzle-orm/node-postgres";
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
        // todo: add archiver table
    },
    logger: isDevelopment(),
});

export { client, db };
