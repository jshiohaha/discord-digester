import { GuildBasedChannel, TextBasedChannel } from "discord.js";
import { asc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";

import { FastifyBaseLogger } from "fastify";
import { db } from "../../../db";
import { wrappedParse } from "../../../routes/utils";
import { textBasedChannelCheckpointer as textBasedChannelCheckpointerSchema } from "../../../schema/checkpointer";
import { messages } from "../../../schema/messages";
import { handleRateLimitError } from "../error";
import { handleMessagesWithRetry } from "./utils";

const getEarliestMessageForChannel = async (
    channelId: string
): Promise<string | null> => {
    const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.channelId, channelId))
        .orderBy(asc(messages.createdAt))
        .limit(1)
        .execute();

    return rows[0]?.messageId ?? null;
};

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
        beforeArg ?? (await getEarliestMessageForChannel(channel.id));
    let retries = 0;

    let fetchOptions: { limit: number; before?: string } = {
        limit: perRequestFetchLimit,
    };
    if (lastMessageId) {
        fetchOptions.before = lastMessageId;
    }

    while (true) {
        try {
            const messages = await channel.messages
                .fetch(fetchOptions)
                .then((x) => Array.from(x.values()));
            if (messages.length === 0) {
                await markBackfillComplete(channel.id).then(() => {
                    logger?.info("Backfill complete");
                });

                break;
            }

            await handleMessagesWithRetry(messages, {
                logger,
            });

            // update checkpoint with the oldest (i.e. last) message from this batch
            const oldestMessage = messages[messages.length - 1];
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
