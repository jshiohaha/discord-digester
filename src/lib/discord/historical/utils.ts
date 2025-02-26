import { Message } from "discord.js";
import pRetry from "p-retry";

import { FastifyBaseLogger } from "fastify";
import { db } from "../../../db";
import { messages as messagesSchema } from "../../../schema/messages";
import { Nullish } from "../../../types/index";

export const mapMessageToRecordSchema = (message: Message) => ({
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
});

const handleMessages = async (
    messages: Array<Message>,
    opts?: { logger?: Nullish<FastifyBaseLogger> }
) => {
    const insertableMessages = messages.map(mapMessageToRecordSchema);

    if (insertableMessages.length > 0) {
        opts?.logger?.info(`Inserting ${insertableMessages.length} messages`);
        await db
            .insert(messagesSchema)
            .values(insertableMessages)
            .onConflictDoNothing({
                target: [messagesSchema.messageId],
            });
    } else {
        opts?.logger?.info("No messages to insert");
    }
};

export const handleMessagesWithRetry = async (
    messages: Array<Message>,
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
