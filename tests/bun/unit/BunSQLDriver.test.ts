// Runs under the Bun runtime only: `bun test tests/bun`
// (Jest is configured to ignore this directory, go see jest.config.js.)
//
// These tests use Bun.sql's in-memory SQLite adapter so they need no external
// database server. The same code path serves Postgres and MySQL connections.
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    test,
} from "bun:test";

import { BunSQLDriver } from "../../../src/drivers/BunSQLDriver";

const TABLE = "json";

const driver = new BunSQLDriver({ adapter: "sqlite", filename: ":memory:" });

describe("BunSQLDriver", () => {
    beforeAll(async () => {
        await driver.connect();
        await driver.prepare(TABLE);
    });

    afterEach(async () => {
        await driver.deleteAllRows(TABLE);
    });

    afterAll(async () => {
        await driver.disconnect();
    });

    test("sets and gets a row", async () => {
        await driver.setRowByKey(TABLE, "foo", "bar", false);
        expect(await driver.getRowByKey(TABLE, "foo")).toEqual(["bar", true]);
        expect(await driver.getRowByKey(TABLE, "missing")).toEqual([
            null,
            false,
        ]);
    });

    test("updates an existing row", async () => {
        await driver.setRowByKey(TABLE, "foo", 1, false);
        await driver.setRowByKey(TABLE, "foo", 2, true);
        expect(await driver.getRowByKey(TABLE, "foo")).toEqual([2, true]);
    });

    test("stores and round-trips complex values", async () => {
        const value = { a: 1, nested: { b: [1, 2, 3] } };
        await driver.setRowByKey(TABLE, "obj", value, false);
        expect(await driver.getRowByKey(TABLE, "obj")).toEqual([value, true]);
    });

    test("deletes a row", async () => {
        await driver.setRowByKey(TABLE, "foo", "bar", false);
        expect(await driver.deleteRowByKey(TABLE, "foo")).toBe(1);
        expect(await driver.getRowByKey(TABLE, "foo")).toEqual([null, false]);
    });

    test("gets all rows", async () => {
        await driver.setRowByKey(TABLE, "a", 1, false);
        await driver.setRowByKey(TABLE, "b", 2, false);
        const rows = await driver.getAllRows(TABLE);
        expect(rows.sort((x, y) => x.id.localeCompare(y.id))).toEqual([
            { id: "a", value: 1 },
            { id: "b", value: 2 },
        ]);
    });

    test("getStartsWith returns only matching prefixes", async () => {
        await driver.setRowByKey(TABLE, "test_1", 1, false);
        await driver.setRowByKey(TABLE, "test_2", 2, false);
        await driver.setRowByKey(TABLE, "nope_1", 3, false);

        const rows = await driver.getStartsWith(TABLE, "test_");
        expect(rows.length).toBe(2);
        expect(rows.map((r) => r.id).sort()).toEqual(["test_1", "test_2"]);
    });

    test("getStartsWith returns an empty array when nothing matches", async () => {
        expect(await driver.getStartsWith(TABLE, "absent_")).toEqual([]);
    });

    test("deleteAllRows clears the table and reports the count", async () => {
        await driver.setRowByKey(TABLE, "a", 1, false);
        await driver.setRowByKey(TABLE, "b", 2, false);
        expect(await driver.deleteAllRows(TABLE)).toBe(2);
        expect(await driver.getAllRows(TABLE)).toEqual([]);
    });
});
