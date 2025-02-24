import { z } from "zod";

export interface ApiResponse<T> {
    data?: T;
    status: number;
    error?: string;
}

export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
    z.object({
        data: dataSchema.optional(),
        status: z.number(),
        error: z.string().optional(),
    });

// Common error response schemas
export const ErrorResponseSchema = ApiResponseSchema(z.never());

export const ValidationErrorSchema = z.object({
    status: z.literal(400),
    error: z.literal("Validation Error"),
    message: z.string(),
    issues: z.array(
        z.object({
            code: z.string(),
            message: z.string(),
            path: z.array(z.string().or(z.number())),
        })
    ),
});

export type ValidationError = z.infer<typeof ValidationErrorSchema>;
