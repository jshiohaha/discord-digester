import { NonThreadGuildBasedChannel } from "discord.js";
import { and, eq, ilike, inArray } from "drizzle-orm";
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
import { wrappedHandler, wrappedParse } from "./utils";

const AddChannelToAllowlistRequestSchema = z.object({
    ids: z.array(z.string()).min(1, "Must provide at least one channel id"),
});

const RemoveChannelFromAllowlistRequestSchema = z.object({
    ids: z.array(z.string()).min(1, "Must provide at least one channel id"),
});

const ChannelResponseSchema = z.object({
    channelId: z.string(),
    name: z.string(),
    updatedAt: z.date(),
    isPublic: z.boolean(),
    allowed: z.boolean(),
    type: z.string(),
    parentId: z.string().nullable(),
});

const ChannelsResponseSchema = z.array(ChannelResponseSchema);

const SyncChannelsResponseSchema = z.object({
    newChannelCount: z.number(),
});

const GuildChannelResponseSchema = z.custom<NonThreadGuildBasedChannel>();

type GuildChannelResponse = z.infer<typeof GuildChannelResponseSchema>;

const ListChannelsRequestQuerySchema = z
    .object({
        name: z.string().optional(),
    })
    .transform((data) => ({
        ...data,
        name: data.name?.toLowerCase().trim(),
    }));

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

    listChannels: async (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<ApiResponse<z.infer<typeof ChannelsResponseSchema>>> => {
        const { db } = fastify.dependencies;

        const { name } = wrappedParse(
            ListChannelsRequestQuerySchema,
            request.query,
            "list_channels::query_params"
        );

        const whereConditions = [];
        if (name) {
            whereConditions.push(ilike(channelsSchema.name, `%${name}%`));
        }

        const whereClause =
            whereConditions.length > 0 ? and(...whereConditions) : undefined;

        const channels = await db
            .select({
                channelId: channelsSchema.channelId,
                name: channelsSchema.name,
                isPublic: channelsSchema.isPublic,
                allowed: channelsSchema.allowed,
                type: channelsSchema.type,
                updatedAt: channelsSchema.updatedAt,
                parentId: channelsSchema.parentId,
            })
            .from(channelsSchema)
            .where(whereClause)
            .orderBy(channelsSchema.name);

        return {
            status: 200,
            data: channels,
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
                parentId: channelsSchema.parentId,
            })
            .from(channelsSchema)
            .where(eq(channelsSchema.allowed, true))
            .orderBy(channelsSchema.name);

        return {
            status: 200,
            data: channels,
        };
    },

    // note: currently assumes we already have channel in the database after the sync operation
    addChannelToAllowlist: async (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<ApiResponse<z.infer<typeof ChannelsResponseSchema>>> => {
        const { db, discordClient } = fastify.dependencies;
        const { ids } = wrappedParse(
            AddChannelToAllowlistRequestSchema,
            request.body,
            "add_channel_to_allowlist::body"
        );

        fastify.log.info("trying to match channel ids", ids);

        const guild = discordClient?.guilds.cache.first();
        if (!guild) {
            return {
                status: 400,
                error: "Bot is not in any guilds",
            };
        }

        const results: z.infer<typeof ChannelsResponseSchema> = [];
        const channelIdsWithErrors: string[] = [];

        // process each channel ID separately
        for (const id of ids) {
            try {
                const channel = await db.query.channels.findFirst({
                    where: eq(channelsSchema.channelId, id),
                });

                if (!channel) {
                    fastify.log.error("channel not found", id);
                    channelIdsWithErrors.push(id);
                    continue;
                }

                if (channel?.allowed) {
                    results.push(channel);
                    continue;
                }

                if (!channel?.isPublic) {
                    fastify.log.error("channel is not public", id);
                    channelIdsWithErrors.push(id);
                    continue;
                }

                const [updatedChannel] = await db
                    .update(channelsSchema)
                    .set({
                        allowed: true,
                    })
                    .where(eq(channelsSchema.channelId, id))
                    .returning();

                results.push(updatedChannel);
            } catch (error) {
                fastify.log.error(`Error processing channel ${id}: ${error}`);
                channelIdsWithErrors.push(id);
            }
        }

        if (results.length === 0 && channelIdsWithErrors.length > 0) {
            return {
                status: 400,
                error: `Failed to add channels: ${channelIdsWithErrors.join(
                    ", "
                )}`,
            };
        }

        return {
            status: 201,
            data: results,
            ...(channelIdsWithErrors.length > 0
                ? {
                      error: `Unprocessable channels: ${channelIdsWithErrors.join(
                          ", "
                      )}`,
                  }
                : {}),
        };
    },

    removeChannelFromAllowlist: async (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<ApiResponse<{ message: string }>> => {
        const { db } = fastify.dependencies;
        const { ids } = wrappedParse(
            RemoveChannelFromAllowlistRequestSchema,
            request.body,
            "remove_channel_from_allowlist::body"
        );

        try {
            await db
                .update(channelsSchema)
                .set({ allowed: false })
                .where(inArray(channelsSchema.channelId, ids));

            return {
                status: 200,
                data: { message: "Channels removed from allowlist" },
            };
        } catch (error) {
            return {
                status: 500,
                error: "Failed to remove channels from allowlist",
            };
        }
    },
});

/**
 * Routes for `/channels`
 */
export const channelRoutes: FastifyPluginAsync = async (fastify) => {
    const handlers = createChannelHandlers(fastify);

    // GET /channels
    fastify.get("/channels", {
        schema: {
            response: {
                201: ApiResponseSchema(ChannelsResponseSchema),
                400: ErrorResponseSchema,
            },
        },
        handler: wrappedHandler(fastify)(handlers.listChannels),
    });

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
                201: ApiResponseSchema(ChannelsResponseSchema),
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
