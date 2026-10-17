"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.codeParamSchema = exports.shortenSchema = void 0;
const zod_1 = require("zod");
exports.shortenSchema = zod_1.z.object({
    url: zod_1.z
        .string()
        .min(1, "url is required")
        .max(2048, "url too long")
        .url("must be a valid URL"),
});
exports.codeParamSchema = zod_1.z.object({
    code: zod_1.z
        .string()
        .min(1)
        .max(16)
        .regex(/^[0-9A-Za-z]+$/, "invalid short code"),
});
