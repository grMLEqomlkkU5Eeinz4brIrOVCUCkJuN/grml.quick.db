// `@libsql/client` is ESM-only, while this package compiles to CommonJS, so the
// type-only import needs an explicit `resolution-mode` of "import" to resolve
// its ES module declarations. The runtime value is loaded separately with a
// dynamic import in `connect()`.
import type { Client, Config } from "@libsql/client" with { "resolution-mode": "import" };

import { IRemoteDriver } from "../interfaces/IRemoteDriver";

/**
 * TursoDriver
 *
 * Backed by [Turso](https://turso.tech) / libSQL through the official
 * [`@libsql/client`](https://www.npmjs.com/package/@libsql/client) package.
 * libSQL is SQLite-compatible, so this driver uses the same `(ID, json)` table
 * layout as {@link SqliteDriver}. Pass a remote Turso database URL with an auth
 * token, or a local `file:` URL for an embedded SQLite database.
 *
 * @example
 * ```ts
 * const { TursoDriver } = require("grml.quick.db/TursoDriver");
 * const tursoDriver = new TursoDriver({
 *     url: "libsql://your-database.turso.io",
 *     authToken: "your-auth-token",
 * });
 *
 * const db = new QuickDB({ driver: tursoDriver });
 * await db.init(); // Always needed!!!
 * await db.set("test", "Hello World");
 * console.log(await db.get("test"));
 * ```
 */
export class TursoDriver implements IRemoteDriver {
    private static instance: TursoDriver | null = null;
    private readonly config: Config;
    private client?: Client;

    constructor(config: Config) {
        this.config = config;
    }

    public static createSingleton(config: Config): TursoDriver {
        if (!TursoDriver.instance) {
            TursoDriver.instance = new TursoDriver(config);
        }
        return TursoDriver.instance;
    }

    private checkConnection(): void {
        if (!this.client) {
            throw new Error("No connection to turso database");
        }
    }

    public async connect(): Promise<void> {
        // `@libsql/client` is an ES module. This package compiles to CommonJS,
        // so a static top-level import would be emitted as a forbidden `require`
        // of an ESM module (TS1479). A dynamic import is preserved by node16
        // module resolution as a real ESM import, which is the supported way to
        // load an ESM-only package from CommonJS.
        const { createClient } = await import("@libsql/client");
        this.client = createClient(this.config);
    }

    public async disconnect(): Promise<void> {
        this.checkConnection();
        this.client!.close();
    }

    public async prepare(table: string): Promise<void> {
        this.checkConnection();

        await this.client!.execute(
            `CREATE TABLE IF NOT EXISTS ${table} (ID TEXT PRIMARY KEY, json TEXT)`
        );
    }

    public async getAllRows(
        table: string
    ): Promise<{ id: string; value: any }[]> {
        this.checkConnection();

        const result = await this.client!.execute(`SELECT * FROM ${table}`);
        return result.rows.map((row) => ({
            id: row.ID as string,
            value: JSON.parse(row.json as string),
        }));
    }

    public async getRowByKey<T>(
        table: string,
        key: string
    ): Promise<[T | null, boolean]> {
        this.checkConnection();

        const result = await this.client!.execute({
            sql: `SELECT json FROM ${table} WHERE ID = ?`,
            args: [key],
        });

        if (result.rows.length < 1) return [null, false];
        return [JSON.parse(result.rows[0].json as string), true];
    }

    public async getStartsWith(
        table: string,
        query: string
    ): Promise<{ id: string; value: any }[]> {
        this.checkConnection();

        const result = await this.client!.execute({
            sql: `SELECT * FROM ${table} WHERE ID LIKE ?`,
            args: [`${query}%`],
        });

        return result.rows.map((row) => ({
            id: row.ID as string,
            value: JSON.parse(row.json as string),
        }));
    }

    public async setRowByKey<T>(
        table: string,
        key: string,
        value: any,
        update: boolean
    ): Promise<T> {
        this.checkConnection();

        const stringifiedJson = JSON.stringify(value);
        if (update) {
            await this.client!.execute({
                sql: `UPDATE ${table} SET json = ? WHERE ID = ?`,
                args: [stringifiedJson, key],
            });
        } else {
            await this.client!.execute({
                sql: `INSERT INTO ${table} (ID,json) VALUES (?,?)`,
                args: [key, stringifiedJson],
            });
        }

        return value;
    }

    public async deleteAllRows(table: string): Promise<number> {
        this.checkConnection();

        const result = await this.client!.execute(`DELETE FROM ${table}`);
        return result.rowsAffected;
    }

    public async deleteRowByKey(table: string, key: string): Promise<number> {
        this.checkConnection();

        const result = await this.client!.execute({
            sql: `DELETE FROM ${table} WHERE ID = ?`,
            args: [key],
        });
        return result.rowsAffected;
    }
}
