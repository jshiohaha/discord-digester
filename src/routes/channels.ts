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
    createdAt: z.date(),
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
        console.log("guild", guild?.id);

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
        console.error("Error fetching guild channels", error);
        throw error;
    }
};

const createChannelHandlers = (fastify: FastifyInstance) => ({
    listChannels: async (): Promise<
        ApiResponse<z.infer<typeof ChannelsResponseSchema>>
    > => {
        console.log("listChannels", fastify.dependencies);
        return {
            status: 200,
            data: [],
        };
    },

    listGuildChannels: async (): Promise<
        ApiResponse<(GuildChannelResponse & { is_public: boolean })[]>
    > => {
        const channels = await getGuildChannels(fastify);

        return {
            status: 200,
            data: channels,
        };
    },

    syncChannels: async (): Promise<
        ApiResponse<z.infer<typeof SyncChannelsResponseSchema>>
    > => {
        const { db } = fastify.dependencies;
        console.log("starting sync channels");
        const guildChannels = await getGuildChannels(fastify);
        console.log("got guild channels", guildChannels.length);
        const dbChannels = await db
            .select({
                channelId: channelsSchema.channelId,
            })
            .from(channelsSchema)
            .orderBy(channelsSchema.name);
        console.log("select existing channels", dbChannels.length);

        const newChannels = guildChannels.filter(
            (channel) =>
                !dbChannels.some(
                    (dbChannel) => dbChannel.channelId === channel.id
                )
        );
        console.log("new channels", newChannels.length);

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
            console.log("inserted channels", newDbChannels.length);
        } catch (error) {
            console.error("Error inserting channels", error);
            throw error;
        }

        return {
            status: 200,
            data: {
                newChannelCount,
            },
        };
    },

    listAllowedChannels: async (): Promise<
        ApiResponse<z.infer<typeof ChannelsResponseSchema>>
    > => {
        const { db } = fastify.dependencies;

        const channels = await db
            .select({
                channelId: channelsSchema.channelId,
                name: channelsSchema.name,
                isPublic: channelsSchema.isPublic,
                allowed: channelsSchema.allowed,
                type: channelsSchema.type,
                createdAt: channelsSchema.createdAt,
            })
            .from(channelsSchema)
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
        const body = request.body as AddChannelToAllowlistRequest;
        console.log("request.body", request.body);

        const { id } = body;
        const { db, discordClient } = fastify.dependencies;

        console.log("trying to match channel id", id);

        const channel = await db.query.channels.findFirst({
            where: eq(channelsSchema.channelId, id),
        });
        console.log("channel", channel);

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
        body: RemoveChannelFromAllowlistRequest
    ): Promise<ApiResponse<{ message: string }>> => {
        const { id } = body;
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
    fastify.get(
        "/channels/guild",
        {
            schema: {
                response: {
                    201: ApiResponseSchema(ChannelsResponseSchema),
                    400: ErrorResponseSchema,
                },
            },
        },
        async (req, res) => {
            console.log("dependencies", fastify.dependencies);
            return handlers.listGuildChannels();
        }
    );

    // POST /channels/sync
    fastify.post("/channels/sync", {
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
