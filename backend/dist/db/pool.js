"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.pingDb = pingDb;
const pg_1 = require("pg");
const config_1 = require("../config");
exports.pool = new pg_1.Pool({
    host: config_1.config.pg.host,
    port: config_1.config.pg.port,
    user: config_1.config.pg.user,
    password: config_1.config.pg.password,
    database: config_1.config.pg.database,
    max: 20, // pool size per API instance
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});
exports.pool.on("error", (err) => {
    console.error("Unexpected Postgres pool error", err);
    process.exit(1);
});
async function pingDb() {
    try {
        await exports.pool.query("SELECT 1");
        return true;
    }
    catch {
        return false;
    }
}
