import { ForumChannel, ThreadChannel } from "discord.js";
import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";

import { FastifyBaseLogger } from "fastify";
import { db } from "../../../db";
import { wrappedParse } from "../../../routes/utils";
import { threadBasedChannelCheckpointer as threadBasedChannelCheckpointerSchema } from "../../../schema/checkpointer";
import { Nullish } from "../../../types/index";
import { handleRateLimitError } from "../error";
import { handleMessagesWithRetry } from "./utils";

const getLastCheckpoint = async (
    channelId: string,
    threadId: string
): Promise<string | null> => {
    const result = await db
        .select()
        .from(threadBasedChannelCheckpointerSchema)
        .where(
            and(
                eq(threadBasedChannelCheckpointerSchema.channelId, channelId),
                eq(threadBasedChannelCheckpointerSchema.threadId, threadId)
            )
        );
    return result[0]?.lastMessageId || null;
};

const updateCheckpoint = async (
    channelId: string,
    threadId: string,
    lastMessageId: string
): Promise<void> => {
    await db
        .insert(threadBasedChannelCheckpointerSchema)
        .values({
            channelId,
            threadId,
            lastMessageId,
        })
        .onConflictDoUpdate({
            target: threadBasedChannelCheckpointerSchema.threadId,
            set: { lastMessageId },
        });
};

const markBackfillComplete = async (channelId: string, threadId: string) => {
    await db
        .update(threadBasedChannelCheckpointerSchema)
        .set({
            status: "completed",
            updatedAt: DateTime.now().toJSDate(),
        })
        .where(
            and(
                eq(threadBasedChannelCheckpointerSchema.channelId, channelId),
                eq(threadBasedChannelCheckpointerSchema.threadId, threadId)
            )
        )
        .execute();
};

const fetchThreadMessages = async (
    channel: ForumChannel,
    threadId: string,
    opts?: {
        logger?: Nullish<FastifyBaseLogger>;
        perRequestFetchLimit?: number;
        batchInsertRetries?: number;
    }
): Promise<void> => {
    let lastMessageId = await getLastCheckpoint(channel.id, threadId);
    let totalFetched = 0;

    // loop until no messages are returned (backfill complete)
    while (true) {
        try {
            const threadChannel = channel as unknown as ThreadChannel;
            const fetchOptions: { limit: number; before?: string } = {
                limit: opts?.perRequestFetchLimit ?? 100,
            };

            if (lastMessageId) fetchOptions.before = lastMessageId;
            const messagesCollection = await threadChannel.messages.fetch(
                fetchOptions
            );
            const messages = Array.from(messagesCollection.values());

            if (messages.length === 0) {
                await markBackfillComplete(channel.id, threadId).then(() => {
                    opts?.logger?.info("Backfill complete");
                });

                break;
            }

            await handleMessagesWithRetry(messages, {
                logger: opts?.logger,
                batchInsertRetries: opts?.batchInsertRetries,
            });

            lastMessageId = messages[messages.length - 1].id;
            await updateCheckpoint(channel.id, threadId, lastMessageId);

            totalFetched += messages.length;
            opts?.logger?.info(
                `Total messages fetched for thread ${threadId}: ${totalFetched}`
            );
        } catch (error: any) {
            opts?.logger?.error(`Error processing thread ${threadId}:`, error);
            break;
        }
    }
};

const getLastCheckpointStatus = async (
    channelId: string,
    threadId: string
): Promise<string | null> => {
    const result = await db
        .select({ status: threadBasedChannelCheckpointerSchema.status })
        .from(threadBasedChannelCheckpointerSchema)
        .where(
            and(
                eq(threadBasedChannelCheckpointerSchema.channelId, channelId),
                eq(threadBasedChannelCheckpointerSchema.threadId, threadId)
            )
        );
    return result[0]?.status || null;
};

const isThreadBackfillCompleted = async (
    channelId: string,
    threadId: string
): Promise<boolean> =>
    getLastCheckpointStatus(channelId, threadId).then(
        (status) => status === "completed"
    );

const FetchHistoricalThreadBasedMessagesArgsSchema = z.object({
    channel: z.custom<ForumChannel>(),
    threadId: z.string(),
    before: z.string().nullish(),
    maxRetries: z.number().int().nonnegative().default(3),
    perRequestFetchLimit: z
        .number()
        .positive("perRequestFetchLimit must be a positive number")
        .max(
            100,
            "perRequestFetchLimit should not exceed 100 as per Discord API limits"
        )
        .optional(),
    logger: z.custom<FastifyBaseLogger>().nullish(),
});

type FetchHistoricalThreadBasedMessagesArgs = z.infer<
    typeof FetchHistoricalThreadBasedMessagesArgsSchema
>;

export const fetchHistoricalThreadBasedMessages = async (
    args: FetchHistoricalThreadBasedMessagesArgs
): Promise<void> => {
    const {
        channel,
        threadId,
        perRequestFetchLimit: perRequestFetchLimitArg,
        before: beforeArg,
        maxRetries,
        logger,
    } = wrappedParse(
        FetchHistoricalThreadBasedMessagesArgsSchema,
        args,
        "fetchHistoricalThreadBasedMessages"
    );

    // default is discord max
    const perRequestFetchLimit = perRequestFetchLimitArg ?? 100;
    let lastMessageId =
        beforeArg ?? (await getLastCheckpoint(channel.id, threadId));
    let retries = 0;

    let fetchOptions: { limit: number; before?: string } = {
        limit: perRequestFetchLimit,
    };
    if (lastMessageId) {
        fetchOptions.before = lastMessageId;
    }

    while (true) {
        try {
            const activeThreadsData = await channel.threads.fetchActive();
            const archivedThreadsData = await channel.threads.fetchArchived();
            const threads = new Map([
                ...activeThreadsData.threads,
                ...archivedThreadsData.threads,
            ]);

            // filter out threads where backfill is already completed
            const threadsToProcess = Array.from(threads.values()).filter(
                async (thread) =>
                    isThreadBackfillCompleted(channel.id, thread.id)
            );

            logger?.info(
                `Found ${threadsToProcess.length} threads to process in channel ${channel.id}.`
            );

            if (threadsToProcess.length === 0) {
                logger?.info(
                    `No more threads to process in channel ${channel.id}. Backfill complete.`
                );

                break;
            }

            for (const thread of threadsToProcess) {
                logger?.info(
                    `Backfilling messages from thread ${thread.id} (${thread.name})`
                );

                await fetchThreadMessages(channel, thread.id, {
                    logger,
                    perRequestFetchLimit,
                    batchInsertRetries: maxRetries,
                });
            }

            retries = 0;
        } catch (error: unknown) {
            /**
             * Handle error appropriately. You might want to:
             *
             * 1. Break the loop and return what you have fetched so far. Log progress in backfill table.
             * 2. Retry after a delay (be careful with infinite retries and rate limits).
             * 3. Throw the error to be handled by the caller.
             */

            const rateLimitResult = await handleRateLimitError(
                error,
                retries,
                maxRetries,
                {
                    descriptor: "FetchHistoricalMessages",
                    logger,
                }
            );

            if (rateLimitResult) {
                retries++;
                continue;
            } else {
                logger?.error(error, "Error fetching messages");
                throw error;
            }
        }
    }
};
