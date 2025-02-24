import {
    Collection,
    GuildBasedChannel,
    Message,
    TextBasedChannel,
} from "discord.js";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import pRetry from "p-retry";
import { z } from "zod";

import { FastifyBaseLogger } from "fastify";
import { db } from "../../../db";
import { wrappedParse } from "../../../routes/utils";
import { textBasedChannelCheckpointer as textBasedChannelCheckpointerSchema } from "../../../schema/checkpointer";
import { messages as messagesSchema } from "../../../schema/messages";
import { Nullish } from "../../../types/index";
import { handleRateLimitError } from "../error";

const getTextBasedChannelCheckpoint = async (
    channelId: string
): Promise<string | null> => {
    const rows = await db
        .select()
        .from(textBasedChannelCheckpointerSchema)
        .where(eq(textBasedChannelCheckpointerSchema.channelId, channelId))
        .execute();
    return rows[0]?.lastMessageId ?? null;
};

const updateTextBasedChannelCheckpoint = async (
    channelId: string,
    lastMessageId: string
) => {
    const existing = await getTextBasedChannelCheckpoint(channelId);
    if (existing) {
        await db
            .update(textBasedChannelCheckpointerSchema)
            .set({ lastMessageId, updatedAt: DateTime.now().toJSDate() })
            .where(eq(textBasedChannelCheckpointerSchema.channelId, channelId))
            .execute();
    } else {
        await db
            .insert(textBasedChannelCheckpointerSchema)
            .values({
                channelId,
                lastMessageId,
                updatedAt: DateTime.now().toJSDate(),
            })
            .execute();
    }
};

const markBackfillComplete = async (channelId: string) => {
    await db
        .update(textBasedChannelCheckpointerSchema)
        .set({
            status: "completed",
            updatedAt: DateTime.now().toJSDate(),
        })
        .where(eq(textBasedChannelCheckpointerSchema.channelId, channelId))
        .execute();
};

const FetchHistoricalMessagesArgsSchema = z.object({
    channel: z.custom<GuildBasedChannel & TextBasedChannel>(),
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

type FetchHistoricalMessagesArgs = z.infer<
    typeof FetchHistoricalMessagesArgsSchema
>;

export const fetchHistoricalMessages = async (
    args: FetchHistoricalMessagesArgs
): Promise<void> => {
    const {
        channel,
        perRequestFetchLimit: perRequestFetchLimitArg,
        before: beforeArg,
        maxRetries,
        logger,
    } = wrappedParse(
        FetchHistoricalMessagesArgsSchema,
        args,
        "fetchHistoricalMessages"
    );

    // default is discord max
    const perRequestFetchLimit = perRequestFetchLimitArg ?? 100;
    let lastMessageId =
        beforeArg ?? (await getTextBasedChannelCheckpoint(channel.id));
    let retries = 0;

    let fetchOptions: { limit: number; before?: string } = {
        limit: perRequestFetchLimit,
    };
    if (lastMessageId) {
        fetchOptions.before = lastMessageId;
    }

    while (true) {
        try {
            const messages = await channel.messages.fetch(fetchOptions);
            if (messages.size === 0) {
                await markBackfillComplete(channel.id).then(() => {
                    logger?.info("Backfill complete");
                });

                break;
            }

            await handleMessagesWithRetry(messages, {
                logger,
            });

            // update checkpoint with the oldest (i.e. last) message from this batch
            const oldestMessage = messages.last();
            if (oldestMessage) {
                await updateTextBasedChannelCheckpoint(
                    channel.id,
                    oldestMessage.id
                );

                // prepare for the next batch
                fetchOptions.before = oldestMessage.id;
            } else {
                break;
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

const handleMessages = async (
    messages: Collection<string, Message>,
    opts?: { logger?: Nullish<FastifyBaseLogger> }
) => {
    const values = messages.map((message) => ({
        messageId: message.id,
        guildId: message.guildId,
        channelId: message.channelId,
        createdAt: message.createdAt,
        content: message.cleanContent,
        threadId: message.thread?.id ?? null,
        threadParentChannelId: message.thread?.parentId ?? null,
        replyTo: message.reference?.messageId,
        author: message.author.toJSON(),
        raw: message.toJSON(),
    }));

    if (values.length > 0) {
        opts?.logger?.info(`Inserting ${values.length} messages`);
        await db
            .insert(messagesSchema)
            .values(values)
            .onConflictDoNothing({
                target: [messagesSchema.messageId],
            });
    } else {
        opts?.logger?.info("No messages to insert");
    }
};

const handleMessagesWithRetry = async (
    messages: Collection<string, Message>,
    opts?: { logger?: Nullish<FastifyBaseLogger>; batchInsertRetries?: number }
) => {
    await pRetry(async () => handleMessages(messages, opts), {
        retries: opts?.batchInsertRetries ?? 3,
        onFailedAttempt: (error) => {
            opts?.logger?.warn(
                `Batch insert attempt failed (attempt ${error.attemptNumber}/${
                    error.retriesLeft + error.attemptNumber
                }). ${error.message}`
            );
        },
    });
};
