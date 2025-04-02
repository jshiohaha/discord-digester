import { FastifyReply, FastifyRequest } from "fastify";

import { EnvConfig } from "../env";

// Validate API key for admin endpoints
export const validateApiKey = async (
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const apiKey = request.headers["x-api-key"];
    if (!apiKey || apiKey !== EnvConfig.API_KEY) {
        return reply.status(401).send({
            status: 401,
            error: "Unauthorized: Invalid API key",
        });
    }
};

declare module "fastify" {
    interface FastifyRequest {
        user?: {
            userId: string;
            scope: string;
            iat: number;
            exp: number;
        };
    }
}
