import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiResponse, ApiResponseSchema } from "../index";
import { generateAuthUrl } from "../lib/discord/oauth";
import { wrappedHandler } from "./utils";

const CodeExchangeSchema = z.object({
    code: z.string().min(1, "Authorization code is required"),
    // state: z.string().min(1, "State is required"),
});

const AuthResponseSchema = z.object({
    token: z.string(),
    user: z.object({
        id: z.string(),
        username: z.string(),
    }),
    guilds: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            icon: z.string().nullable(),
        })
    ),
});

const createAuthHandlers = (fastify: FastifyInstance) => ({
    getAuthUrl: async (): Promise<ApiResponse<{ url: string }>> => {
        const { url } = generateAuthUrl();
        return {
            status: 200,
            data: {
                url,
            },
        };
    },
});

export const authRoutes = async (fastify: FastifyInstance) => {
    const handlers = createAuthHandlers(fastify);

    // Endpoint to get the OAuth URL and state
    fastify.get("/auth/url", {
        schema: {
            response: {
                200: ApiResponseSchema(
                    z.object({
                        url: z.string(),
                    })
                ),
                400: ApiResponseSchema(z.void()),
            },
        },
        handler: wrappedHandler(fastify)(handlers.getAuthUrl),
    });
};
