import { z } from "zod";

export const shortenSchema = z.object({
  url: z
    .string()
    .min(1, "url is required")
    .max(2048, "url too long")
    .url("must be a valid URL"),
});

export const codeParamSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[0-9A-Za-z]+$/, "invalid short code"),
});
