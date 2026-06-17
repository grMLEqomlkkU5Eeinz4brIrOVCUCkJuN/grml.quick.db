// Live integration tests for BunSQLDriver against real Postgres and MySQL.
//
// Runs under the Bun runtime only and requires the Docker services from
// docker-compose.yml to be up:
//
//   ./deploy-integration-environment.sh        # in one terminal
//   bun run test:bun:integration               # in another
//
// Connection details are read from the environment (load .env.dev with
// `--env-file=.env.dev`, which the npm script does). If a backend is not
// reachable within the timeout, its suite is skipped rather than failed, so
// this file is safe to run without servers present.
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    test,
} from "bun:test";

import { BunSQLDriver } from "../../../src/drivers/BunSQLDriver";

const env = process.env;

const TABLE = "json";
// How long to keep retrying the initial connection while containers warm up.
// Tunable via env so CI can wait longer and local runs can fail fast.
const CONNECT_TIMEOUT_MS = Number(env.BUN_SQL_CONNECT_TIMEOUT_MS ?? 60_000);

interface Backend {
    name: string;
    url: string;
}

const backends: Backend[] = [
    {
        name: "Postgres",
        url: `postgres://${env.POSTGRES_USER ?? "postgres"}:${
            env.POSTGRES_PASSWORD ?? "root"
        }@127.0.0.1:${env.POSTGRESS_PORT ?? "5432"}/${
            env.POSTGRES_DB ?? "test"
        }`,
    },
    {
        name: "MySQL",
        url: `mysql://${env.MYSQL_USER ?? "mysql"}:${
            env.MYSQL_PASSWORD ?? "root"
        }@127.0.0.1:${env.MYSQL_PORT ?? "3306"}/${env.MYSQL_DATABASE ?? "test"}`,
    },
];

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

/** Connect + prepare with retries; returns null if the backend never answers. */
async function connectWithRetry(url: string): Promise<BunSQLDriver | null> {
    const start = Date.now();
    while (Date.now() - start < CONNECT_TIMEOUT_MS) {
        const driver = new BunSQLDriver(url);
        try {
            await driver.connect();
            await driver.prepare(TABLE);
            return driver;
        } catch {
            await driver.disconnect().catch(() => {});
            await sleep(2000);
        }
    }
    return null;
}

for (const backend of backends) {
    describe(`BunSQLDriver (${backend.name})`, () => {
        let driver: BunSQLDriver | null = null;

        beforeAll(async () => {
            driver = await connectWithRetry(backend.url);
            if (!driver) {
                // eslint-disable-next-line no-console
                console.warn(
                    `[skip] ${backend.name} not reachable at ${backend.url}, skipping suite`
                );
            }
        }, CONNECT_TIMEOUT_MS + 5000);

        afterEach(async () => {
            if (driver) await driver.deleteAllRows(TABLE);
        });

        afterAll(async () => {
            if (driver) await driver.disconnect();
        });

        test("sets, updates and gets a row", async () => {
            if (!driver) return;
            await driver.setRowByKey(TABLE, "foo", "bar", false);
            expect(await driver.getRowByKey(TABLE, "foo")).toEqual([
                "bar",
                true,
            ]);

            await driver.setRowByKey(TABLE, "foo", { n: 1 }, true);
            expect(await driver.getRowByKey(TABLE, "foo")).toEqual([
                { n: 1 },
                true,
            ]);

            expect(await driver.getRowByKey(TABLE, "missing")).toEqual([
                null,
                false,
            ]);
        });

        test("deletes a row and reports the count", async () => {
            if (!driver) return;
            await driver.setRowByKey(TABLE, "foo", "bar", false);
            expect(await driver.deleteRowByKey(TABLE, "foo")).toBe(1);
            expect(await driver.getRowByKey(TABLE, "foo")).toEqual([
                null,
                false,
            ]);
        });

        test("gets all rows and matches prefixes", async () => {
            if (!driver) return;
            await driver.setRowByKey(TABLE, "test_1", 1, false);
            await driver.setRowByKey(TABLE, "test_2", 2, false);
            await driver.setRowByKey(TABLE, "nope_1", 3, false);

            expect((await driver.getAllRows(TABLE)).length).toBe(3);

            const prefixed = await driver.getStartsWith(TABLE, "test_");
            expect(prefixed.map((r) => r.id).sort()).toEqual([
                "test_1",
                "test_2",
            ]);

            expect(await driver.getStartsWith(TABLE, "absent_")).toEqual([]);
        });

        test("deleteAllRows clears the table", async () => {
            if (!driver) return;
            await driver.setRowByKey(TABLE, "a", 1, false);
            await driver.setRowByKey(TABLE, "b", 2, false);
            expect(await driver.deleteAllRows(TABLE)).toBe(2);
            expect(await driver.getAllRows(TABLE)).toEqual([]);
        });
    });
}
