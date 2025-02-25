import {
    AnyThreadChannel,
    ChannelType,
    ForumChannel,
    GuildBasedChannel,
    TextBasedChannel,
} from "discord.js";
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import {
    FastifyBaseLogger,
    FastifyInstance,
    FastifyPluginAsync,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import { DateTime } from "luxon";
import pRetry from "p-retry";
import { z } from "zod";

import { fetchHistoricalMessages } from "../lib/discord/historical/text-channel";
import { fetchHistoricalThreadBasedMessages } from "../lib/discord/historical/thread-channel";
import { validateApiKey } from "../middleware/auth";
import { channels as channelsSchema } from "../schema/channels";
import {
    textBasedChannelCheckpointer as textBasedChannelCheckpointerSchema,
    threadBasedChannelCheckpointer as threadBasedChannelCheckpointerSchema,
} from "../schema/checkpointer";
import { messages as messagesSchema } from "../schema/messages";
import { ApiResponse, ApiResponseSchema } from "../types/api";
import { wrappedHandler, wrappedParse } from "./utils";

const GetMessagesRequestParamsSchema = z.object({
    channelId: z.string().min(1, "Channel ID is required"),
});

const GetMessagesRequestQuerySchema = z.object({
    before: z.coerce
        .number()
        .optional()
        .describe("Epoch timestamp for filtering messages before"),
    after: z.coerce
        .number()
        .optional()
        .describe("Epoch timestamp for filtering messages after"),
    limit: z.coerce
        .number()
        .int()
        .positive()
        .default(100)
        .describe("Maximum number of messages to return"),
    sort: z
        .enum(["asc", "desc"])
        .default("desc")
        .describe("Sort direction for messages (ascending or descending)"),
});

const DbMessageSchema = z.custom<typeof messagesSchema.$inferSelect>();
const MessagesResponseSchema = z.object({
    messages: z.array(DbMessageSchema),
});

/**
 * - fetch historical messages from a text channel
 * - fetch historical threads from a channel
 * - fetch historical messages from a thread
 */
const BackfillMessagesRequestSchema = z.object({
    channelId: z.string().describe("Channel ID to backfill messages from"),
    threadId: z
        .string()
        .optional()
        .describe("Thread ID to backfill messages from"),
    threads: z
        .array(z.enum(["active", "archived"]))
        .default(["active", "archived"])
        .describe("Type of threads to backfill messages from"),
    maxRetries: z
        .number()
        .int()
        .nonnegative()
        .default(3)
        .describe("Maximum number of retries when enabled"),
    before: z.string().optional().describe("Message ID to get messages before"),
});

const createMessagesHandlers = (fastify: FastifyInstance) => ({
    // setupMessageListener: async () => {
    //     const { discordClient, db } = fastify.dependencies;

    //     discordClient?.on("messageCreate", async (message: Message) => {
    //         if (message.author.bot || !message.inGuild()) return;

    //         const allowedChannel = await db.query.channels.findFirst({
    //             where: eq(channelsSchema.channel_id, message.channelId),
    //         });

    //         if (!allowedChannel) return;

    //         try {
    //             fastify.log.info({
    //                 msg: "Processing message",
    //                 messageId: message.id,
    //                 channelId: message.channelId,
    //             });

    //             await db
    //                 .insert(messagesSchema)
    //                 .values({
    //                     messageId: message.id,
    //                     channelId: message.channelId,
    //                     content: message.content,
    //                     createdAt: DateTime.now().toJSDate(),
    //                     replyTo: message.reference?.messageId,
    //                     // thread
    //                     threadId: message.thread?.id,
    //                     threadParentChannelId: message.thread?.parentId,
    //                     threadName: message.thread?.name,
    //                     // author
    //                     authorId: message.author.id,
    //                     authorUsername: message.author.username,
    //                     authorAvatarUrl: message.author.displayAvatarURL(),
    //                     authorIsBot: message.author.bot,
    //                     authorIsSystem: message.author.system,
    //                 })
    //                 .returning();
    //         } catch (error) {
    //             fastify.log.error({
    //                 msg: "Failed to process message",
    //                 messageId: message.id,
    //                 error:
    //                     error instanceof Error ? error.message : String(error),
    //             });
    //         }
    //     });
    // },

    backfillMessages: async (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<ApiResponse<{ processed: number }>> => {
        const { discordClient, db } = fastify.dependencies;
        const { channelId, threadId, threads, before, maxRetries } =
            wrappedParse(
                BackfillMessagesRequestSchema,
                request.body,
                "backfill_messages::body"
            );

        const channel = await discordClient?.channels.fetch(channelId);
        if (!channel) {
            throw new Error(`Channel ${channelId} not found`);
        }

        const dbChannel = await db.query.channels.findFirst({
            where: eq(channelsSchema.channelId, channel.id),
        });

        if (!dbChannel) {
            throw new Error(`Channel ${channelId} not registered`);
        }

        if (channel.isTextBased()) {
            await db
                .update(textBasedChannelCheckpointerSchema)
                .set({
                    status: "in_progress",
                })
                .where(
                    and(
                        eq(
                            textBasedChannelCheckpointerSchema.channelId,
                            channelId
                        ),
                        eq(textBasedChannelCheckpointerSchema.status, "pending")
                    )
                );

            await fetchHistoricalMessages({
                channel: channel as GuildBasedChannel & TextBasedChannel,
                before,
                maxRetries,
                logger: fastify.log,
            });
        } else if (channel.type === ChannelType.GuildForum) {
            const processableThreads: AnyThreadChannel[] = [];
            // if thread is provided, use it. else, fetch all threads in a channel.
            if (threadId) {
                const thread = await channel.threads.fetch(threadId);
                if (thread) {
                    processableThreads.push(thread);
                } else {
                    throw new Error(
                        `Channel ${channel.id} does not have thread that matches the provided ID ${threadId}`
                    );
                }
            } else {
                const allThreads: AnyThreadChannel[] = [];
                if (threads.includes("active")) {
                    const activeThreads = await channel.threads.fetchActive();
                    allThreads.push(...Object.values(activeThreads.threads));
                }

                if (threads.includes("archived")) {
                    const archivedThreads = await fetchArchivedThreadsWithRetry(
                        channel,
                        {
                            maxRetries: 3,
                            logger: fastify.log,
                        }
                    );
                    allThreads.push(...archivedThreads);
                }

                const threadIds = allThreads.map((x) => x.id);
                const completedThreads = await db
                    .select({
                        threadId: threadBasedChannelCheckpointerSchema.threadId,
                    })
                    .from(threadBasedChannelCheckpointerSchema)
                    .where(
                        and(
                            inArray(
                                threadBasedChannelCheckpointerSchema.threadId,
                                threadIds
                            ),
                            eq(
                                threadBasedChannelCheckpointerSchema.status,
                                "completed"
                            )
                        )
                    )
                    .then((x) =>
                        x.map((x) => x.threadId).filter((x): x is string => !!x)
                    );

                processableThreads.push(
                    ...allThreads.filter(
                        (x) => !completedThreads.includes(x.id)
                    )
                );
            }

            fastify.log.info(
                `Found ${processableThreads.length} threads to process for channel ${channel.id}`
            );

            for (const thread of processableThreads) {
                fastify.log.info(`Start processing thread ${thread.id}`);

                const threadCheckpoint =
                    await db.query.threadBasedChannelCheckpointer.findFirst({
                        where: and(
                            eq(
                                threadBasedChannelCheckpointerSchema.channelId,
                                channelId
                            ),
                            eq(
                                threadBasedChannelCheckpointerSchema.threadId,
                                thread.id
                            )
                        ),
                    });

                if (!threadCheckpoint) {
                    await db
                        .insert(threadBasedChannelCheckpointerSchema)
                        .values({
                            channelId,
                            threadId: thread.id,
                            status: "pending",
                            createdAt: DateTime.now().toJSDate(),
                            updatedAt: DateTime.now().toJSDate(),
                        });
                }

                await db
                    .update(threadBasedChannelCheckpointerSchema)
                    .set({
                        status: "in_progress",
                        updatedAt: DateTime.now().toJSDate(),
                    })
                    .where(
                        and(
                            eq(
                                threadBasedChannelCheckpointerSchema.channelId,
                                channelId
                            ),
                            eq(
                                threadBasedChannelCheckpointerSchema.threadId,
                                thread.id
                            ),
                            eq(
                                threadBasedChannelCheckpointerSchema.status,
                                "pending"
                            )
                        )
                    );

                await fetchHistoricalThreadBasedMessages({
                    channel: channel as ForumChannel,
                    threadId: thread.id,
                    before,
                    maxRetries,
                    logger: fastify.log,
                });
            }
        } else {
            throw new Error(
                `Channel ${channel.id} type ${channel.type} does not support messages`
            );
        }

        return {
            status: 200,
        };
    },

    getMessages: async (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<ApiResponse<z.infer<typeof MessagesResponseSchema>>> => {
        const { db } = fastify.dependencies;
        const { channelId } = wrappedParse(
            GetMessagesRequestParamsSchema,
            request.params,
            "get_messages::path_params"
        );

        const { before, after, limit, sort } = wrappedParse(
            GetMessagesRequestQuerySchema,
            request.query,
            "get_messages::query_params"
        );

        const channelExists = await db.query.channels.findFirst({
            where: eq(channelsSchema.channelId, channelId),
        });

        if (!channelExists) {
            throw new Error("Channel not found");
        }

        const beforeDate = before ? DateTime.fromSeconds(before) : undefined;
        const afterDate = after ? DateTime.fromSeconds(after) : undefined;

        const whereConditions = [
            eq(messagesSchema.channelId, channelId),
            ...(beforeDate
                ? [lt(messagesSchema.createdAt, beforeDate.toJSDate())]
                : []),
            ...(afterDate
                ? [gt(messagesSchema.createdAt, afterDate.toJSDate())]
                : []),
        ];

        const messages = await db.query.messages.findMany({
            where: and(...whereConditions),
            orderBy:
                sort === "asc"
                    ? asc(messagesSchema.createdAt)
                    : desc(messagesSchema.createdAt),
            limit,
        });

        return {
            status: 200,
            data: {
                messages,
            },
        };
    },
});

/**
 * Routes for `/messages`
 */
export const messagesRoutes: FastifyPluginAsync = async (fastify) => {
    const handlers = createMessagesHandlers(fastify);

    // initialize message listener when routes are registered
    // await handlers.setupMessageListener();

    fastify.post("/messages/backfill", {
        preHandler: validateApiKey,
        schema: {
            body: BackfillMessagesRequestSchema,
            response: {
                200: ApiResponseSchema(z.void()),
                400: z.object({ error: z.string() }),
            },
        },
        handler: wrappedHandler(fastify)(handlers.backfillMessages),
    });

    // GET /messages/:channelId
    fastify.get("/messages/:channelId", {
        schema: {
            params: GetMessagesRequestParamsSchema,
            querystring: GetMessagesRequestQuerySchema,
            response: {
                200: ApiResponseSchema(MessagesResponseSchema),
                404: z.object({ error: z.string() }),
            },
        },
        handler: wrappedHandler(fastify)(handlers.getMessages),
    });
};

const fetchArchivedThreadsWithRetry = async (
    channel: ForumChannel,
    opts?: {
        maxRetries?: number;
        logger?: FastifyBaseLogger;
    }
): Promise<AnyThreadChannel[]> => {
    const archivedThreads: AnyThreadChannel[] = [];
    const maxRetries = opts?.maxRetries ?? 3;

    let hasMore = true;
    let fetchCount = 0;

    while (hasMore) {
        fetchCount++;

        try {
            const archived = await pRetry(
                async () => {
                    opts?.logger?.debug(
                        `Fetching archived threads batch #${fetchCount}`
                    );
                    return await channel.threads.fetchArchived();
                },
                {
                    retries: maxRetries,
                    onFailedAttempt: (error) => {
                        opts?.logger?.warn({
                            msg: `Error fetching archived threads batch #${fetchCount}, attempt ${
                                error.attemptNumber
                            }/${error.retriesLeft + error.attemptNumber}`,
                            error: error.message,
                            channelId: channel.id,
                        });
                    },
                    factor: 2,
                    minTimeout: 1_000,
                    maxTimeout: 10_000,
                }
            );

            hasMore = archived.hasMore;
            const batchThreads = Object.values(archived.threads);
            archivedThreads.push(...batchThreads);
            opts?.logger?.debug(
                `Successfully fetched ${batchThreads.length} archived threads in batch #${fetchCount}`
            );
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            opts?.logger?.error({
                msg: `Failed to fetch archived threads batch #${fetchCount} after ${maxRetries} attempts`,
                error: errorMessage,
                channelId: channel.id,
            });
            throw new Error(
                `Failed to fetch archived threads: ${errorMessage}`
            );
        }
    }

    opts?.logger?.debug(
        `Completed fetching all archived threads, found ${archivedThreads.length} threads`
    );

    return archivedThreads;
};
