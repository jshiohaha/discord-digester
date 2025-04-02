import {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
    RouteGenericInterface,
} from "fastify";
import { z } from "zod";

// Generic version of wrappedHandler that can be used with specific request types
export const wrappedHandler =
    (fastify: FastifyInstance) =>
    <T extends RouteGenericInterface = RouteGenericInterface, R = any>(
        handler: (req: FastifyRequest<T>, reply: FastifyReply) => Promise<R>
    ) =>
    async (req: FastifyRequest<T>, reply: FastifyReply) => {
        try {
            return await handler(req, reply);
        } catch (error) {
            fastify.log.error(error);
            return reply.status(500).send({
                status: 500,
                error: "Internal Server Error",
            });
        }
    };

export const wrappedParse = <T extends z.ZodTypeAny>(
    schema: T,
    data: unknown,
    context: string
): z.infer<T> => {
    try {
        return schema.parse(data);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorDetails = error.issues
                .map((issue) => {
                    const path = issue.path.join(".");
                    return `${path}: ${issue.message}`;
                })
                .join("\n");

            throw new Error(`Validation error in ${context}:\n${errorDetails}`);
        }
        throw new Error(`Unexpected validation error in ${context}`);
    }
};
