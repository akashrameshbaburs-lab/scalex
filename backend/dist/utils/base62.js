"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encode = encode;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/**
 * Encode a numeric DB id into a base62 short code (collision-free, 7 chars
 * covers ~3.5 trillion ids). BigInt is used because ids are BIGSERIAL.
 */
function encode(id) {
    if (id === 0n)
        return BASE62[0];
    let out = "";
    let n = id;
    while (n > 0n) {
        out = BASE62[Number(n % 62n)] + out;
        n = n / 62n;
    }
    return out;
}
