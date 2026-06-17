import { IDriver } from "../interfaces/IDriver";

/**
 * Minimal type definitions for the `bun:sqlite` module.
 *
 * The real types ship with `bun-types`, but this package builds with `tsc`
 * against Node and must not take a hard dependency on the Bun runtime. These
 * cover only the surface used by the driver. `bun:sqlite` is resolved lazily
 * at runtime so the Node build never tries to load it.
 */
interface BunStatement {
    all(...params: any[]): any[];
    get(...params: any[]): any;
    run(...params: any[]): {
        changes: number;
        lastInsertRowid: number | bigint;
    };
}

interface BunDatabase {
    exec(sql: string): void;
    query(sql: string): BunStatement;
    prepare(sql: string): BunStatement;
    close(): void;
}

interface BunDatabaseConstructor {
    new (filename?: string, options?: unknown): BunDatabase;
}

/**
 * BunSqliteDriver
 *
 * A drop-in replacement for {@link SqliteDriver} backed by Bun's built-in
 * `bun:sqlite` module. It requires no native compilation (no `better-sqlite3`)
 * and only runs under the Bun runtime.
 *
 * @example
 * ```ts
 * // Run with: bun run index.ts
 * const { BunSqliteDriver } = require("grml.quick.db/BunSqliteDriver");
 *
 * const db = new QuickDB({ driver: new BunSqliteDriver("data.sqlite") });
 * await db.init(); // Always needed!!!
 * await db.set("test", "Hello World");
 * console.log(await db.get("test"));
 * ```
 */
export class BunSqliteDriver implements IDriver {
    private static instance: BunSqliteDriver | null = null;
    private readonly _database: BunDatabase;

    get database(): BunDatabase {
        return this._database;
    }

    constructor(path: string) {
        let Database: BunDatabaseConstructor;
        try {
            // `bun:sqlite` is only available inside the Bun runtime. Resolve it
            // lazily via require so the Node/tsc build never tries to load it.
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            Database = require("bun:sqlite").Database;
        } catch {
            throw new Error(
                "BunSqliteDriver requires the Bun runtime. Run your app with `bun` " +
                    "or use SqliteDriver (better-sqlite3) under Node instead."
            );
        }

        this._database = new Database(path);
    }

    public static createSingleton(path: string): BunSqliteDriver {
        if (!BunSqliteDriver.instance) {
            BunSqliteDriver.instance = new BunSqliteDriver(path);
        }
        return BunSqliteDriver.instance;
    }

    public async prepare(table: string): Promise<void> {
        this._database.exec(
            `CREATE TABLE IF NOT EXISTS ${table} (ID TEXT PRIMARY KEY, json TEXT)`
        );
    }

    public async getAllRows(
        table: string
    ): Promise<{ id: string; value: any }[]> {
        const rows = this._database.query(`SELECT * FROM ${table}`).all() as {
            ID: string;
            json: string;
        }[];

        return rows.map((row) => ({
            id: row.ID,
            value: JSON.parse(row.json),
        }));
    }

    public async getRowByKey<T>(
        table: string,
        key: string
    ): Promise<[T | null, boolean]> {
        const value = this._database
            .query(`SELECT json FROM ${table} WHERE ID = ?`)
            .get(key) as { json: string } | null;

        return value != null ? [JSON.parse(value.json), true] : [null, false];
    }

    public async getStartsWith(
        table: string,
        query: string
    ): Promise<{ id: string; value: any }[]> {
        const rows = this._database
            .query(`SELECT * FROM ${table} WHERE ID LIKE ?`)
            .all(`${query}%`) as { ID: string; json: string }[];

        return rows.map((row) => ({
            id: row.ID,
            value: JSON.parse(row.json),
        }));
    }

    public async setRowByKey<T>(
        table: string,
        key: string,
        value: any,
        update: boolean
    ): Promise<T> {
        const stringifiedJson = JSON.stringify(value);
        if (update) {
            this._database
                .prepare(`UPDATE ${table} SET json = (?) WHERE ID = (?)`)
                .run(stringifiedJson, key);
        } else {
            this._database
                .prepare(`INSERT INTO ${table} (ID,json) VALUES (?,?)`)
                .run(key, stringifiedJson);
        }

        return value;
    }

    public async deleteAllRows(table: string): Promise<number> {
        const result = this._database.prepare(`DELETE FROM ${table}`).run();
        return result.changes;
    }

    public async deleteRowByKey(table: string, key: string): Promise<number> {
        const result = this._database
            .prepare(`DELETE FROM ${table} WHERE ID = ?`)
            .run(key);
        return result.changes;
    }
}
