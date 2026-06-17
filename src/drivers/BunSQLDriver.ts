import { IRemoteDriver } from "../interfaces/IRemoteDriver";

/**
 * Minimal type definitions for Bun's built-in `SQL` client (`Bun.sql`).
 *
 * This package builds with `tsc` against Node and must not take a hard
 * dependency on the Bun runtime, so only the surface used by the driver is
 * declared here. `Bun.sql` is resolved lazily at runtime; the Node build never
 * loads it. See https://bun.sh/docs/api/sql for the full API.
 */
type BunSQLResult = any[] & {
    // Affected-row count for write queries. The property differs by adapter:
    // Postgres and SQLite populate `count`, while MySQL reports it on
    // `affectedRows` (and leaves `count` at 0). See {@link affectedRows}.
    count?: number;
    affectedRows?: number;
};

interface BunSQLClient {
    /** Tagged-template query. Interpolations become bound parameters. */
    (
        strings: TemplateStringsArray,
        ...values: unknown[]
    ): Promise<BunSQLResult>;
    /** Identifier/fragment helper, e.g. `sql("table_name")`. */
    (value: string): unknown;
    close(options?: unknown): Promise<void>;
}

interface BunSQLConstructor {
    new (options: string | Record<string, unknown>): BunSQLClient;
}

/**
 * Connection configuration for {@link BunSQLDriver}. Either a connection string
 * (`postgres://…`, `mysql://…`, `sqlite://…`) or an options object passed
 * straight to `new Bun.SQL(...)`.
 */
export type BunSQLConfig = string | Record<string, unknown>;

/**
 * Number of rows affected by a write query, normalized across Bun.sql's
 * adapters. Postgres and SQLite expose the count on `count`, while MySQL leaves
 * `count` at 0 and reports it under a different property. Rather than guess one
 * name, this checks every common convention and returns the first positive
 * value, so a query that genuinely affected no rows still reports 0.
 */
function affectedRows(result: BunSQLResult): number {
    const meta = result as unknown as Record<string, unknown>;
    for (const key of [
        "affectedRows",
        "rowsAffected",
        "count",
        "changes",
        "rowCount",
    ]) {
        const value = meta[key];
        if (typeof value === "number" && value > 0) return value;
    }
    return 0;
}

/**
 * BunSQLDriver
 *
 * A single remote driver backed by Bun's built-in SQL client (`Bun.sql`),
 * which speaks Postgres, MySQL/MariaDB and SQLite through one parameterized
 * code path. It requires **no external database client** (`pg`, `mysql2`, …)
 * the client ships with Bun, and only runs under the Bun runtime.
 *
 * @example
 * ```ts
 * // Run with: bun run index.ts
 * const { BunSQLDriver } = require("grml.quick.db/BunSQLDriver");
 *
 * // Postgres
 * const driver = new BunSQLDriver("postgres://user:pass@localhost:5432/mydb");
 * // MySQL: new BunSQLDriver("mysql://user:pass@localhost:3306/mydb")
 *
 * const db = new QuickDB({ driver });
 * await db.init(); // Always needed!!!
 * await db.set("test", "Hello World");
 * console.log(await db.get("test"));
 * await db.close(); // disconnect when finished
 * ```
 */
export class BunSQLDriver implements IRemoteDriver {
    private static instance: BunSQLDriver | null = null;
    private readonly config: BunSQLConfig;
    private sql?: BunSQLClient;

    /** The underlying `Bun.sql` client, or undefined before {@link connect}. */
    get client(): BunSQLClient | undefined {
        return this.sql;
    }

    constructor(config: BunSQLConfig) {
        this.config = config;
    }

    public static createSingleton(config: BunSQLConfig): BunSQLDriver {
        if (!BunSQLDriver.instance) {
            BunSQLDriver.instance = new BunSQLDriver(config);
        }
        return BunSQLDriver.instance;
    }

    private checkConnection(): void {
        if (!this.sql) {
            throw new Error("BunSQLDriver is not connected to the database");
        }
    }

    public async connect(): Promise<void> {
        let SQL: BunSQLConstructor;
        try {
            // `Bun.SQL` only exists inside the Bun runtime. Resolve it lazily so
            // the Node/tsc build never tries to load it.
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            SQL = require("bun").SQL;
        } catch {
            throw new Error(
                "BunSQLDriver requires the Bun runtime. Run your app with `bun`, " +
                    "or use PostgresDriver/MySQLDriver under Node instead."
            );
        }

        this.sql = new SQL(this.config);
    }

    public async disconnect(): Promise<void> {
        this.checkConnection();
        await this.sql!.close();
        this.sql = undefined;
    }

    public async prepare(table: string): Promise<void> {
        this.checkConnection();
        await this
            .sql!`CREATE TABLE IF NOT EXISTS ${this.sql!(table)} (id VARCHAR(255) PRIMARY KEY, value TEXT)`;
    }

    public async getAllRows(
        table: string
    ): Promise<{ id: string; value: any }[]> {
        this.checkConnection();
        const rows = await this.sql!`SELECT * FROM ${this.sql!(table)}`;
        return rows.map((row) => ({
            id: row.id,
            value: JSON.parse(row.value),
        }));
    }

    public async getStartsWith(
        table: string,
        query: string
    ): Promise<{ id: string; value: any }[]> {
        this.checkConnection();
        const rows = await this
            .sql!`SELECT * FROM ${this.sql!(table)} WHERE id LIKE ${`${query}%`}`;
        return rows.map((row) => ({
            id: row.id,
            value: JSON.parse(row.value),
        }));
    }

    public async getRowByKey<T>(
        table: string,
        key: string
    ): Promise<[T | null, boolean]> {
        this.checkConnection();
        const rows = await this
            .sql!`SELECT value FROM ${this.sql!(table)} WHERE id = ${key}`;
        if (rows.length < 1) return [null, false];
        return [JSON.parse(rows[0].value), true];
    }

    public async setRowByKey<T>(
        table: string,
        key: string,
        value: any,
        update: boolean
    ): Promise<T> {
        this.checkConnection();
        const stringifiedValue = JSON.stringify(value);

        if (update) {
            await this
                .sql!`UPDATE ${this.sql!(table)} SET value = ${stringifiedValue} WHERE id = ${key}`;
        } else {
            await this
                .sql!`INSERT INTO ${this.sql!(table)} (id, value) VALUES (${key}, ${stringifiedValue})`;
        }

        return value;
    }

    public async deleteAllRows(table: string): Promise<number> {
        this.checkConnection();
        const result = await this.sql!`DELETE FROM ${this.sql!(table)}`;
        return affectedRows(result);
    }

    public async deleteRowByKey(table: string, key: string): Promise<number> {
        this.checkConnection();
        const result = await this
            .sql!`DELETE FROM ${this.sql!(table)} WHERE id = ${key}`;
        return affectedRows(result);
    }
}
