import { config } from "dotenv";
import { z } from "zod";

config();

const EnvConfigSchema = z
    .object({
        DISCORD_BOT_TOKEN: z.string().trim(),
        NODE_ENV: z.enum(["local", "development", "production"]),
        TELEGRAM_ALERT_CHAT_ID: z.string().trim().optional(),
        TELEGRAM_BOT_TOKEN: z.string().trim().optional(),
        LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]),
        PORT: z.string().trim().optional().default("3000"),
        DATABASE_URL: z.string().trim(),
    })
    .transform((env) => ({
        ...env,
        NODE_ENV: env.NODE_ENV.toLowerCase().trim(),
        PORT: parseInt(env.PORT, 10),
    }));

export const EnvConfig = EnvConfigSchema.parse(process.env);

export const isDevelopment = () =>
    ["development", "local"].includes(EnvConfig.NODE_ENV);
