import {
    ChannelType,
    ForumChannel,
    GuildBasedChannel,
    TextBasedChannel,
} from "discord.js";
import { and, count, desc, eq, gt, lt } from "drizzle-orm";
import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { fetchHistoricalMessages } from "../lib/discord/historical/text-channel";
import { fetchHistoricalThreadBasedMessages } from "../lib/discord/historical/thread-channel";
import { channels as channelsSchema } from "../schema/channels";
import {
    textBasedChannelCheckpointer as textBasedChannelCheckpointerSchema,
    threadBasedChannelCheckpointer as threadBasedChannelCheckpointerSchema,
} from "../schema/checkpointer";
import { messages as messagesSchema } from "../schema/messages";
import { ApiResponse } from "../types/api";
import { wrappedHandler, wrappedParse } from "./utils";

const GetMessagesRequestParamsSchema = z.object({
    channelId: z.string().min(1, "Channel ID is required"),
});

const GetMessagesRequestQuerySchema = z.object({
    startDate: z.coerce
        .date()
        .optional()
        .describe("Start date for filtering messages"),
    endDate: z.coerce
        .date()
        .optional()
        .describe("End date for filtering messages"),
    limit: z
        .number()
        .int()
        .positive()
        .default(100)
        .describe("Maximum number of messages to return"),
    offset: z
        .number()
        .int()
        .nonnegative()
        .default(0)
        .describe("Pagination offset"),
});

const DbMessageSchema = z.custom<typeof messagesSchema.$inferSelect>();
const MessagesResponseSchema = z.object({
    messages: z.array(DbMessageSchema),
    meta: z.object({
        total: z.number().int().nonnegative(),
        hasMore: z.boolean(),
    }),
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
        request: FastifyRequest
    ): Promise<ApiResponse<{ processed: number }>> => {
        const { discordClient, db } = fastify.dependencies;
        const { channelId, threadId, before, maxRetries } = wrappedParse(
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

        try {
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
                            eq(
                                textBasedChannelCheckpointerSchema.status,
                                "pending"
                            )
                        )
                    );

                await fetchHistoricalMessages({
                    channel: channel as GuildBasedChannel & TextBasedChannel,
                    before,
                    maxRetries,
                    // logger,
                });
            } else if (channel.type === ChannelType.GuildForum) {
                if (!threadId) {
                    throw new Error(
                        "Thread ID is required for forum based channels"
                    );
                }

                await db
                    .update(threadBasedChannelCheckpointerSchema)
                    .set({
                        status: "in_progress",
                    })
                    .where(
                        and(
                            eq(
                                threadBasedChannelCheckpointerSchema.channelId,
                                channelId
                            ),
                            eq(
                                threadBasedChannelCheckpointerSchema.threadId,
                                ""
                            ),
                            eq(
                                threadBasedChannelCheckpointerSchema.status,
                                "pending"
                            )
                        )
                    );

                await fetchHistoricalThreadBasedMessages({
                    channel: channel as ForumChannel,
                    threadId,
                    before,
                    maxRetries,
                    // logger,
                });
            } else {
                throw new Error(
                    `Channel ${channel.id} type ${channel.type} does not support messages`
                );
            }

            return {
                status: 200,
            };
        } catch (error) {
            fastify.log.error({
                msg: "Backfill failed",
                channelId,
                error: error instanceof Error ? error.message : String(error),
            });

            throw new Error("Failed to backfill messages");
        }
    },

    getMessages: async (
        request: FastifyRequest
    ): Promise<ApiResponse<z.infer<typeof MessagesResponseSchema>>> => {
        const { db } = fastify.dependencies;
        const { channelId } = wrappedParse(
            GetMessagesRequestParamsSchema,
            request.params,
            "get_messages::path_params"
        );

        const { startDate, endDate, limit, offset } = wrappedParse(
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

        const whereConditions = [
            eq(messagesSchema.channelId, channelId),
            ...(startDate ? [gt(messagesSchema.createdAt, startDate)] : []),
            ...(endDate ? [lt(messagesSchema.createdAt, endDate)] : []),
        ];

        const [messages, totalCount] = await Promise.all([
            db.query.messages.findMany({
                where: and(...whereConditions),
                orderBy: desc(messagesSchema.createdAt),
                limit,
                offset,
            }),
            db
                .select({ count: count() })
                .from(messagesSchema)
                .where(and(...whereConditions)),
        ]);

        return {
            status: 200,
            data: {
                messages,
                meta: {
                    total: totalCount[0].count,
                    hasMore: totalCount[0].count > offset + limit,
                },
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

    fastify.withTypeProvider<ZodTypeProvider>().post(
        "/messages/backfill",
        {
            schema: {
                body: BackfillMessagesRequestSchema,
                response: {
                    200: z.object({ processed: z.number() }),
                    400: z.object({ error: z.string() }),
                },
            },
        },
        wrappedHandler(fastify)(handlers.backfillMessages)
    );

    // GET /messages/:channelId
    fastify.withTypeProvider<ZodTypeProvider>().get(
        "/messages/:channelId",
        {
            schema: {
                params: GetMessagesRequestParamsSchema,
                querystring: GetMessagesRequestQuerySchema,
                response: {
                    200: MessagesResponseSchema,
                    404: z.object({ error: z.string() }),
                },
            },
        },
        wrappedHandler(fastify)(handlers.getMessages)
    );
};
