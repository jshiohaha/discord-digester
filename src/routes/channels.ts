import { NonThreadGuildBasedChannel } from "discord.js";
import { eq } from "drizzle-orm";
import {
    FastifyInstance,
    FastifyPluginAsync,
    FastifyReply,
    FastifyRequest,
} from "fastify";
import { z } from "zod";

import { isPublicChannel } from "../lib/discord/utils";
import { validateApiKey } from "../middleware/auth";
import { channels as channelsSchema } from "../schema/channels";
import {
    ApiResponse,
    ApiResponseSchema,
    ErrorResponseSchema,
} from "../types/api";
import { wrappedHandler } from "./utils";

const AddChannelToAllowlistRequestSchema = z.object({
    id: z.string().min(1, "Channel id is required"),
});

type AddChannelToAllowlistRequest = z.infer<
    typeof AddChannelToAllowlistRequestSchema
>;

const RemoveChannelFromAllowlistRequestSchema = z.object({
    id: z.string().min(1, "Channel id is required"),
});

type RemoveChannelFromAllowlistRequest = z.infer<
    typeof RemoveChannelFromAllowlistRequestSchema
>;

const ChannelResponseSchema = z.object({
    channelId: z.string(),
    name: z.string(),
    updatedAt: z.date(),
    isPublic: z.boolean(),
    allowed: z.boolean(),
    type: z.string(),
});

const ChannelsResponseSchema = z.array(ChannelResponseSchema);

const SyncChannelsResponseSchema = z.object({
    newChannelCount: z.number(),
});

const GuildChannelResponseSchema = z.custom<NonThreadGuildBasedChannel>();

type GuildChannelResponse = z.infer<typeof GuildChannelResponseSchema>;

const getGuildChannels = async (
    fastify: FastifyInstance
): Promise<(NonThreadGuildBasedChannel & { is_public: boolean })[]> => {
    try {
        const guild = fastify.dependencies.discordClient?.guilds.cache.first();
        fastify.log.info("guild", guild?.id);

        if (!guild) {
            throw { statusCode: 400, message: "Bot is not in any guilds" };
        }

        const channels = await guild.channels.fetch();
        if (channels.size === 0) {
            throw { statusCode: 400, message: "Bot is not in any channels" };
        }

        return channels
            .filter((channel): channel is NonNullable<typeof channel> =>
                Boolean(channel)
            )
            .map((channel) => ({
                ...channel,
                is_public: isPublicChannel(channel, guild),
            })) as (NonThreadGuildBasedChannel & { is_public: boolean })[];
    } catch (error) {
        fastify.log.error(error, "Error fetching guild channels");
        throw error;
    }
};

const createChannelHandlers = (fastify: FastifyInstance) => ({
    listGuildChannels: async (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<
        ApiResponse<(GuildChannelResponse & { is_public: boolean })[]>
    > => {
        const channels = await getGuildChannels(fastify);

        return {
            status: 200,
            data: channels,
        };
    },

    syncChannels: async (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<ApiResponse<z.infer<typeof SyncChannelsResponseSchema>>> => {
        const { db } = fastify.dependencies;
        fastify.log.info("starting sync channels");
        const guildChannels = await getGuildChannels(fastify);
        fastify.log.info("got guild channels", guildChannels.length);
        const dbChannels = await db
            .select({
                channelId: channelsSchema.channelId,
            })
            .from(channelsSchema)
            .orderBy(channelsSchema.name);
        fastify.log.info("select existing channels", dbChannels.length);

        const newChannels = guildChannels.filter(
            (channel) =>
                !dbChannels.some(
                    (dbChannel) => dbChannel.channelId === channel.id
                )
        );
        fastify.log.info("new channels", newChannels.length);

        let newChannelCount = 0;
        try {
            const newDbChannels = await db
                .insert(channelsSchema)
                .values(
                    newChannels.map((channel) => ({
                        channelId: channel.id,
                        name: channel.name,
                        isPublic: channel.is_public,
                        type: channel.type.toString().toLowerCase().trim(),
                        createdAt: channel.createdAt,
                        allowed: false,
                        parentId: channel.parentId,
                    }))
                )
                .returning();

            newChannelCount = newDbChannels.length;
            fastify.log.info("inserted channels", newDbChannels.length);
        } catch (error) {
            fastify.log.error(error, "Error inserting channels");
            throw error;
        }

        return {
            status: 200,
            data: {
                newChannelCount,
            },
        };
    },

    listAllowedChannels: async (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<ApiResponse<z.infer<typeof ChannelsResponseSchema>>> => {
        const { db } = fastify.dependencies;

        const channels = await db
            .select({
                channelId: channelsSchema.channelId,
                name: channelsSchema.name,
                isPublic: channelsSchema.isPublic,
                allowed: channelsSchema.allowed,
                type: channelsSchema.type,
                updatedAt: channelsSchema.updatedAt,
            })
            .from(channelsSchema)
            .where(eq(channelsSchema.allowed, true))
            .orderBy(channelsSchema.name);

        return {
            status: 200,
            data: channels,
        };
    },

    addChannelToAllowlist: async (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<ApiResponse<z.infer<typeof ChannelResponseSchema>>> => {
        const { id } = request.body as AddChannelToAllowlistRequest;
        const { db, discordClient } = fastify.dependencies;

        fastify.log.info("trying to match channel id", id);

        const channel = await db.query.channels.findFirst({
            where: eq(channelsSchema.channelId, id),
        });
        fastify.log.info("channel", channel);

        if (!channel) {
            return {
                status: 404,
                error: "Channel not found",
            };
        }

        // if channel is already allowed, return it
        if (channel?.allowed) {
            return {
                status: 200,
                data: channel,
            };
        }
        const guild = discordClient?.guilds.cache.first();
        if (!guild) {
            return {
                status: 400,
                error: "Bot is not in any guilds",
            };
        }

        const discordChannel = await guild.channels.fetch(id);
        if (!discordChannel) {
            return {
                status: 404,
                error: "Channel not found in guild",
            };
        }

        const isPublic = isPublicChannel(discordChannel, guild);
        if (!isPublic) {
            return {
                status: 400,
                error: "Channel is not public",
            };
        }

        // const isMessageable = isMessageBasedChannel(discordChannel);
        // if (!isMessageable) {
        //     return {
        //         status: 400,
        //         error: "Channel is not message based",
        //     };
        // }

        const [updatedChannel] = await db
            .insert(channelsSchema)
            .values({
                channelId: id,
                name: discordChannel.name,
                isPublic: isPublic,
                allowed: true,
                type: discordChannel.type.toString().toLowerCase().trim(),
            })
            .onConflictDoUpdate({
                target: channelsSchema.channelId,
                set: {
                    isPublic: isPublic,
                    allowed: true,
                },
            })
            .returning();

        return {
            status: 201,
            data: updatedChannel,
        };
    },

    removeChannelFromAllowlist: async (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<ApiResponse<{ message: string }>> => {
        const { id } = request.body as RemoveChannelFromAllowlistRequest;

        const { db } = fastify.dependencies;

        try {
            await db
                .update(channelsSchema)
                .set({ allowed: false })
                .where(eq(channelsSchema.channelId, id));

            return {
                status: 200,
                data: { message: "Channel removed from allowlist" },
            };
        } catch (error) {
            return {
                status: 500,
                error: "Failed to remove channel from allowlist",
            };
        }
    },
});

/**
 * Routes for `/channels`
 */
export const channelRoutes: FastifyPluginAsync = async (fastify) => {
    const handlers = createChannelHandlers(fastify);

    // GET /channels/allowed
    fastify.get("/channels/allowed", {
        schema: {
            response: {
                201: ApiResponseSchema(ChannelsResponseSchema),
                400: ErrorResponseSchema,
            },
        },
        handler: wrappedHandler(fastify)(handlers.listAllowedChannels),
    });

    // GET /channels/guild
    fastify.get("/channels/guild", {
        preHandler: validateApiKey,
        schema: {
            response: {
                201: ApiResponseSchema(ChannelsResponseSchema),
                400: ErrorResponseSchema,
            },
        },
        handler: wrappedHandler(fastify)(handlers.listGuildChannels),
    });

    // POST /channels/sync
    fastify.post("/channels/sync", {
        preHandler: validateApiKey,
        schema: {
            response: {
                201: ApiResponseSchema(ChannelResponseSchema),
                400: ErrorResponseSchema,
                404: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
        handler: wrappedHandler(fastify)(handlers.syncChannels),
    });

    // POST /channels/allowed
    fastify.post("/channels/allowed", {
        preHandler: validateApiKey,
        schema: {
            body: AddChannelToAllowlistRequestSchema,
            response: {
                201: ApiResponseSchema(ChannelResponseSchema),
                400: ErrorResponseSchema,
                404: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
        handler: wrappedHandler(fastify)(handlers.addChannelToAllowlist),
    });

    // DELETE /channels/allowed
    fastify.delete("/channels/allowed", {
        preHandler: validateApiKey,
        schema: {
            body: RemoveChannelFromAllowlistRequestSchema,
            response: {
                200: ApiResponseSchema(z.object({ message: z.string() })),
                400: ErrorResponseSchema,
                404: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
        handler: wrappedHandler(fastify)(handlers.removeChannelFromAllowlist),
    });
};
