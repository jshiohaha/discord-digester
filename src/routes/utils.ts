import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

// export const wrappedHandler =
//     (fastify: FastifyInstance) =>
//     <T>(
//         handler: (
//             request: FastifyRequest,
//             reply: FastifyReply
//         ) => Promise<ApiResponse<T>>
//     ) =>
//     async (request: FastifyRequest, reply: FastifyReply) => {
//         try {
//             const response = await handler(request, reply);
//             return reply.status(response.status).send(response);
//         } catch (error) {
//             fastify.log.error(error);
//             return reply.status(500).send({
//                 status: 500,
//                 error: "Failed to process request",
//             });
//         }
//     };

export const wrappedHandler =
    (fastify: FastifyInstance) =>
    (handler: (req: FastifyRequest, reply: FastifyReply) => Promise<any>) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            return await handler(req, reply);
        } catch (error) {
            fastify.log.error(error);
            console.error(error);
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
