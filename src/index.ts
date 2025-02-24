import { config } from "dotenv";

config();

import { Client, GatewayIntentBits } from "discord.js";
import Fastify from "fastify";
import {
    hasZodFastifySchemaValidationErrors,
    serializerCompiler,
    validatorCompiler,
} from "fastify-type-provider-zod";
import { z } from "zod";

import { client, connectDB, db, disconnectDB } from "./db";
import { EnvConfig } from "./env";
import { channelRoutes } from "./routes/channels";
import { messagesRoutes } from "./routes/messages";

const ChannelResponseSchema = z.object({
    channel_id: z.string(),
    name: z.string(),
    created_at: z.date(),
    is_public: z.boolean(),
    allowed: z.boolean(),
    type: z.string(),
});

const ChannelsResponseSchema = z.array(ChannelResponseSchema);

export const ApiResponseSchema = <T extends z.ZodType>(schema: T) =>
    z.object({
        status: z.number(),
        data: schema.optional(),
        error: z.string().optional(),
    });

export type ApiResponse<Data = unknown> = z.infer<
    ReturnType<typeof ApiResponseSchema<z.ZodType<Data>>>
>;

export const ErrorResponseSchema = ApiResponseSchema(z.void());

export const ValidationErrorSchema = z.object({
    status: z.literal(400),
    error: z.literal("Validation Error"),
    message: z.string(),
    issues: z.array(
        z.object({
            code: z.string(),
            message: z.string(),
            path: z.array(z.string().or(z.number())),
        })
    ),
});

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

const start = async () => {
    /**
     * note: we can implement a custom logger if we want to,
     * but the initial implementation was causing a lot of errors
     * so we're just using the default logger for now
     */
    const fastify = Fastify({
        logger: {
            level: process.env.LOG_LEVEL || "info",
            transport: {
                target: "pino-pretty",
                options: {
                    translateTime: "HH:MM:ss Z",
                    ignore: "pid,hostname",
                    colorize: true,
                },
            },
        },
        ajv: {
            customOptions: {
                coerceTypes: "array",
            },
        },
    })
        .setValidatorCompiler(validatorCompiler)
        .setSerializerCompiler(serializerCompiler)
        .setErrorHandler((error, request, reply) => {
            if (hasZodFastifySchemaValidationErrors(error)) {
                fastify.log.debug(
                    { validationError: error },
                    "Validation error"
                );
                return reply.status(400).send({
                    status: 400,
                    error: "Validation Error",
                    message: "Invalid request parameters",
                    issues: error.validation,
                });
            }

            fastify.log.error(error);
            reply.status(500).send({
                status: 500,
                error: "Internal Server Error",
            });
        });

    fastify.log.info("Initialized fastify instance...");

    try {
        // note: we can add global authentication for all /api routes like this
        // fastify.addHook("onRequest", async (request, reply) => {
        //     if (request.url.startsWith("/api")) {
        //         // Skip auth for health check endpoint if needed
        //         if (request.url === "/api/v1/health") return;

        //         await validateApiKey(request, reply);
        //     }
        // });

        fastify.get("/health", async () => ({ status: "ok" }));

        try {
            const discordClient = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                ],
            });

            discordClient.on("error", (error) => {
                fastify.log.error(error, "Discord client error");
            });

            await discordClient.login(EnvConfig.DISCORD_BOT_TOKEN).then(() => {
                fastify.log.info("Discord client initialized ✅");
            });

            await connectDB({ logger: fastify.log });

            fastify.decorate("dependencies", {
                db,
                client,
                discordClient,
            });

            /**
             * note: can create a debugging hook like this
             *
             *  fastify.addHook("onRequest", (request, reply, done) => {
             *      fastify.log.info("Request dependencies defined?", {
             *          db: db === undefined,
             *          discordClient: discordClient === undefined,
             *      });
             *
             *      done();
             *  });
             */
        } catch (error) {
            fastify.log.error(error, "Failed to initialize dependencies");
            throw error;
        }

        await fastify.register(channelRoutes, { prefix: "/api/v1" });
        await fastify.register(messagesRoutes, { prefix: "/api/v1" });
        fastify.log.info("Plugins registered successfully");

        fastify.log.info("Serving traffic...");
        await fastify.listen({
            port: EnvConfig.PORT,
            host: "0.0.0.0",
        });

        const shutdown = async (signal: string) => {
            fastify.log.info(`Received ${signal}, closing server...`);

            try {
                await fastify.close();
                await disconnectDB();
                await fastify.dependencies.discordClient?.destroy();
                process.exit(0);
            } catch (err) {
                fastify.log.error(err, "Error during shutdown");
                process.exit(1);
            }
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

        fastify.log.info(`Server listening on ${EnvConfig.PORT}`);
    } catch (err) {
        fastify?.log.error(err);
        process.exit(1);
    }
};

start();

declare module "fastify" {
    interface FastifyInstance {
        dependencies: {
            db: typeof db;
            client: typeof client;
            discordClient?: Client;
        };
    }
}
