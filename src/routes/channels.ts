import { Channel, ChannelType, NonThreadGuildBasedChannel } from "discord.js";
import { and, eq, ilike } from "drizzle-orm";
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
    channelId: z.string().min(1, "Channel ID is required"),
    guildId: z.string().min(1, "Guild ID is required"),
});

const RemoveChannelFromAllowlistRequestSchema = z.object({
    channelId: z.string().min(1, "Channel ID is required"),
    guildId: z.string().min(1, "Guild ID is required"),
});

const ListGuildChannelsRequestSchema = z.object({
    guildId: z.string().min(1, "Guild ID is required"),
});

const SyncChannelsRequestSchema = z.object({
    guildId: z.string().min(1, "Guild ID is required"),
});

const ChannelResponseSchema = z.object({
    channelId: z.string(),
    guildId: z.string(),
    name: z.string(),
    updatedAt: z.date(),
    isPublic: z.boolean(),
    allowed: z.boolean(),
    type: z.string(),
    parentId: z.string().nullable(),
});

const ChannelsResponseSchema = z.array(ChannelResponseSchema);

const SyncChannelsResponseSchema = z.object({
    syncedChannelCount: z.number(),
});

const BooleanQueryStringSchema = z
    .string()
    .optional()
    .transform((val) => {
        if (val === undefined) return undefined;
        return val.toLowerCase() === "true"
            ? true
            : val.toLowerCase() === "false"
            ? false
            : undefined;
    });

const ListChannelsWithGuildQuerySchema = z
    .object({
        guildId: z.string(),
        name: z.string().optional(),
        allowed: BooleanQueryStringSchema,
        public: BooleanQueryStringSchema,
    })
    .transform((data) => ({
        ...data,
        name: data.name?.toLowerCase().trim(),
    }));

const getGuildChannels = async (
    fastify: FastifyInstance,
    guildId?: string
): Promise<(NonThreadGuildBasedChannel & { is_public: boolean })[]> => {
    try {
        let guild;

        if (guildId) {
            guild =
                fastify.dependencies.discordClient.guilds.cache.get(guildId);
        }

        if (!guild) {
            throw {
                statusCode: 400,
                message: guildId
                    ? `Guild ${guildId} not found`
                    : "Bot is not in any guilds",
            };
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
    setupChannelsListener: async () => {
        const { discordClient, db } = fastify.dependencies;

        discordClient.on("channelCreate", async (channel: Channel) => {
            // Check if channel is part of a guild (not a DM channel)
            if (!("guildId" in channel)) {
                fastify.log.warn(
                    {
                        channelId: channel.id,
                    },
                    "Channel is not part of a authorized guild"
                );

                return;
            }

            const guild = discordClient.guilds.cache.get(channel.guildId);
            if (!guild) {
                fastify.log.warn(
                    {
                        channelId: channel.id,
                    },
                    "Channel for authorized guild not found"
                );

                return;
            }

            // only auto-approve public text channels for now
            if (
                channel.isTextBased() &&
                channel.type === ChannelType.GuildText
            ) {
                const isPublic = isPublicChannel(channel, guild);
                if (isPublic) {
                    await db.insert(channelsSchema).values({
                        channelId: channel.id,
                        guildId: guild.id,
                        createdAt: channel.createdAt,
                        name: channel.name,
                        isPublic,
                        type: channel.type.toString().toLowerCase().trim(),
                        allowed: false,
                        parentId: channel.parentId,
                    });
                }
            }
        });
    },

    syncChannels: async (
        request: FastifyRequest
    ): Promise<ApiResponse<z.infer<typeof SyncChannelsResponseSchema>>> => {
        const { db } = fastify.dependencies;
        const { guildId } = wrappedParse(
            SyncChannelsRequestSchema,
            request.query,
            "sync_channels::query_params"
        );

        if (!guildId) {
            return {
                status: 400,
                error: "guildId is required",
            };
        }

        fastify.log.info(`Starting sync channels for guild ${guildId}`);
        const guildChannels = await getGuildChannels(fastify, guildId);
        fastify.log.info(
            `Got guild channels for ${guildId}`,
            guildChannels.length
        );

        const dbChannels = await db
            .select({
                channelId: channelsSchema.channelId,
            })
            .from(channelsSchema)
            .where(eq(channelsSchema.guildId, guildId))
            .orderBy(channelsSchema.name);

        fastify.log.info(
            `Selected existing channels for guild ${guildId}`,
            dbChannels.length
        );

        const newChannels = guildChannels.filter(
            (channel) =>
                !dbChannels.some(
                    (dbChannel) => dbChannel.channelId === channel.id
                )
        );

        fastify.log.info(
            `New channels for guild ${guildId}`,
            newChannels.length
        );

        let syncedChannelCount = 0;
        try {
            const newDbChannels = await db
                .insert(channelsSchema)
                .values(
                    newChannels.map((channel) => ({
                        channelId: channel.id,
                        guildId,
                        name: channel.name,
                        isPublic: channel.is_public,
                        type: channel.type.toString().toLowerCase().trim(),
                        createdAt: channel.createdAt,
                        allowed: false,
                        parentId: channel.parentId,
                    }))
                )
                .returning();

            syncedChannelCount = newDbChannels.length;
            fastify.log.info(
                `Inserted channels for guild ${guildId}`,
                newDbChannels.length
            );
        } catch (error) {
            fastify.log.error(
                error,
                `Error inserting channels for guild ${guildId}`
            );
            throw error;
        }

        return {
            status: 200,
            data: {
                syncedChannelCount,
            },
        };
    },

    listChannels: async (
        request: FastifyRequest
    ): Promise<ApiResponse<z.infer<typeof ChannelsResponseSchema>>> => {
        const { db } = fastify.dependencies;

        const {
            name,
            allowed,
            public: isPublic,
            guildId,
        } = wrappedParse(
            ListChannelsWithGuildQuerySchema,
            request.query,
            "list_channels::query_params"
        );

        const whereConditions = [eq(channelsSchema.guildId, guildId)];
        if (name) {
            whereConditions.push(ilike(channelsSchema.name, `%${name}%`));
        }

        if (allowed !== undefined) {
            whereConditions.push(eq(channelsSchema.allowed, allowed));
        }

        if (isPublic !== undefined) {
            whereConditions.push(eq(channelsSchema.isPublic, isPublic));
        }

        const whereClause =
            whereConditions.length > 0 ? and(...whereConditions) : undefined;

        const channels = await db
            .select({
                channelId: channelsSchema.channelId,
                guildId: channelsSchema.guildId,
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
        request: FastifyRequest
    ): Promise<ApiResponse<z.infer<typeof ChannelsResponseSchema>>> => {
        const { db } = fastify.dependencies;
        const { guildId } = wrappedParse(
            ListGuildChannelsRequestSchema,
            request.query,
            "list_allowed_channels::query_params"
        );

        const channels = await db
            .select({
                channelId: channelsSchema.channelId,
                guildId: channelsSchema.guildId,
                name: channelsSchema.name,
                isPublic: channelsSchema.isPublic,
                allowed: channelsSchema.allowed,
                type: channelsSchema.type,
                updatedAt: channelsSchema.updatedAt,
                parentId: channelsSchema.parentId,
            })
            .from(channelsSchema)
            .where(
                and(
                    eq(channelsSchema.allowed, true),
                    eq(channelsSchema.guildId, guildId)
                )
            )
            .orderBy(channelsSchema.name);

        return {
            status: 200,
            data: channels,
        };
    },

    addChannelToAllowlist: async (
        request: FastifyRequest
    ): Promise<ApiResponse<void>> => {
        const { db } = fastify.dependencies;

        const { channelId, guildId } = wrappedParse(
            AddChannelToAllowlistRequestSchema,
            request.body,
            "add_channel_to_allowlist::body"
        );

        try {
            await db
                .update(channelsSchema)
                .set({
                    allowed: true,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(channelsSchema.channelId, channelId),
                        eq(channelsSchema.guildId, guildId)
                    )
                );

            return {
                status: 200,
            };
        } catch (error) {
            fastify.log.error(
                error,
                `Failed to add channel ${channelId} to allowlist for guild ${guildId}`
            );
            throw error;
        }
    },

    removeChannelFromAllowlist: async (
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<ApiResponse<void>> => {
        const { db } = fastify.dependencies;

        const { channelId, guildId } = wrappedParse(
            RemoveChannelFromAllowlistRequestSchema,
            request.body,
            "remove_channel_from_allowlist::body"
        );

        try {
            await db
                .update(channelsSchema)
                .set({
                    allowed: false,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(channelsSchema.channelId, channelId),
                        eq(channelsSchema.guildId, guildId)
                    )
                );

            return {
                status: 200,
            };
        } catch (error) {
            fastify.log.error(
                error,
                `Failed to remove channel ${channelId} from allowlist for guild ${guildId}`
            );
            throw error;
        }
    },
});

/**
 * Routes for `/channels`
 */
export const channelRoutes: FastifyPluginAsync = async (fastify) => {
    const handlers = createChannelHandlers(fastify);

    // initialize channels listener when routes are registered
    await handlers.setupChannelsListener();

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

    // POST /channels/sync
    fastify.post("/channels/sync", {
        preHandler: validateApiKey,
        schema: {
            response: {
                201: ApiResponseSchema(SyncChannelsResponseSchema),
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
