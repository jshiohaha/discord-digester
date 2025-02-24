import { RateLimitError } from "discord.js";
import { FastifyBaseLogger } from "fastify";

import { Nullish } from "../../types/index";

type RateLimitResult =
    | { retry: true; retryAfter: number }
    | { retry: false; error: Error };

export const handleRateLimitError = async (
    error: unknown,
    retries: number,
    maxRetries: number,
    opts?: {
        descriptor: string;
        logger?: Nullish<FastifyBaseLogger>;
    }
): Promise<RateLimitResult | undefined> => {
    if (error instanceof RateLimitError) {
        if (retries < maxRetries) {
            const retryAfter = error.retryAfter;
            opts?.logger?.warn(
                `Rate limit exceeded while ${
                    opts?.descriptor
                }, retrying in ${retryAfter}ms (Retry ${
                    retries + 1
                }/${maxRetries}).`
            );
            await new Promise((resolve) => setTimeout(resolve, retryAfter));
            return { retry: true, retryAfter };
        } else {
            opts?.logger?.error(
                error,
                `Rate limit exceeded after ${maxRetries} retries while ${opts?.descriptor}.`
            );

            return {
                retry: false,
                error: new Error(
                    `Rate limit exceeded ${opts?.descriptor} after ${maxRetries} retries.`
                ),
            };
        }
    }

    return undefined;
};
