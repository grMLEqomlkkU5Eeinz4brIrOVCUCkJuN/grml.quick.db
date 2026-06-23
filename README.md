# grml.quick.db

> A community-maintained fork of [quick.db](https://github.com/plexidev/quick.db).

`grml.quick.db` is an easy-to-use, persistent key/value data layer for Node.js. It is designed for beginners and for low-to-medium volume workloads where standing up a full database server would be overkill. Data is stored persistently through one of several pluggable drivers (SQLite, MySQL, Postgres, MongoDB, Cassandra, JSON, or in-memory) and is accessed through a single, consistent API.

## Why this fork exists

The original [quick.db](https://github.com/plexidev/quick.db) by [Loren Cerri](https://github.com/TrueXPixels) and the [Plexi Development](https://github.com/plexidev) team is no longer actively maintained. This fork was created to keep the project alive: to ship dependency and security updates, keep the drivers working against current database versions, and accept community contributions. It remains MIT licensed and preserves the original copyright. Full credit for the original design and implementation belongs to the upstream authors. See [Credits](#credits).

## Features

- **Persistent storage** so your data survives process restarts.
- **Multiple drivers**: SQLite, MySQL, Postgres, Turso/libSQL, MongoDB, Cassandra, JSON, and in-memory.
- **Works out of the box** with SQLite, with no separate database server to run.
- **Beginner friendly** with a small, consistent, and well-documented API.
- **Dot-path access** for reading and writing nested object properties directly.

## Installation

```bash
npm i grml.quick.db
```

Each driver depends on its own database client, which you install separately. Only install the one you intend to use:

| Driver         | Install                       |
| -------------- | ----------------------------- |
| SQLite         | `npm i better-sqlite3`        |
| SQLite (Bun)   | (built into Bun, no install)  |
| MySQL          | `npm i mysql2`                |
| MySQL (Bun)    | (built into Bun, no install)  |
| Postgres       | `npm i pg`                    |
| Postgres (Bun) | (built into Bun, no install)  |
| Turso / libSQL | `npm i @libsql/client`        |
| MongoDB        | `npm i mongoose`              |
| Cassandra      | `npm i cassandra-driver`      |
| JSON           | `npm i write-file-atomic`     |
| In-memory      | (no extra dependency)         |

<details>
<summary>macOS prerequisites for better-sqlite3</summary>

```text
1. Install Xcode
2. Run `npm i -g node-gyp`
3. Run `node-gyp --python /path/to/python`
```

</details>

If you have trouble installing `better-sqlite3`, follow its [troubleshooting guide](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md). Windows users may need the additional steps listed there.

## Quick start (SQLite)

SQLite is the default driver.

```js
const { QuickDB } = require("grml.quick.db");
const db = new QuickDB(); // creates json.sqlite in the project root
// To choose a path:
// const db = new QuickDB({ filePath: "source/to/path/test.sqlite" });

(async () => {
    // Init the database. This is always required.
    await db.init();

    // Set an object:
    await db.set("userInfo", { difficulty: "Easy" });
    // -> { difficulty: 'Easy' }

    // Get a whole object:
    await db.get("userInfo");
    // -> { difficulty: 'Easy' }

    // Get a single property via a dot path:
    await db.get("userInfo.difficulty");
    // -> 'Easy'

    // Push to an array (created automatically if it does not exist):
    await db.push("userInfo.items", "Sword");
    // -> { difficulty: 'Easy', items: ['Sword'] }

    // Add to a number (created automatically if it does not exist):
    await db.add("userInfo.balance", 500);
    // -> { difficulty: 'Easy', items: ['Sword'], balance: 500 }

    await db.push("userInfo.items", "Watch");
    // -> { difficulty: 'Easy', items: ['Sword', 'Watch'], balance: 500 }
    await db.add("userInfo.balance", 500);
    // -> { difficulty: 'Easy', items: ['Sword', 'Watch'], balance: 1000 }

    await db.get("userInfo.balance"); // -> 1000
    await db.get("userInfo.items"); // -> ['Sword', 'Watch']
})();
```

## Drivers

Every driver exposes the same `QuickDB` API. You only change how the driver is constructed. Each driver is imported from a subpath of the package.

### SQLite on Bun

If you run your app with [Bun](https://bun.sh) instead of Node, use `BunSqliteDriver`. It is backed by Bun's built-in [`bun:sqlite`](https://bun.sh/docs/api/sqlite) module, so it needs **no native compilation**, so there is nothing to `npm i`, and no `better-sqlite3` build step. It is a drop-in replacement for the default SQLite driver and stores data in the same `(ID, json)` table layout, so existing `.sqlite` files remain compatible.

```js
// Run with: bun run index.ts
const { QuickDB } = require("grml.quick.db");
const { BunSqliteDriver } = require("grml.quick.db/BunSqliteDriver");

const db = new QuickDB({ driver: new BunSqliteDriver("data.sqlite") });

await db.init();
await db.set("test", "Hello World");
console.log(await db.get("test"));
```

> `BunSqliteDriver` only works under the Bun runtime. When executed under Node it throws a clear error directing you to the default `SqliteDriver`. Conversely, the default `SqliteDriver` (better-sqlite3) also works under Bun if you prefer it, `BunSqliteDriver` is the zero-dependency option.

### Postgres & MySQL on Bun

`BunSQLDriver` is backed by Bun's built-in SQL client ([`Bun.sql`](https://bun.sh/docs/api/sql)), which speaks Postgres, MySQL/MariaDB, and SQLite through a single client. Under Bun it replaces both `PostgresDriver` (`pg`) and `MySQLDriver` (`mysql2`) with **no external client to install**. Pass a connection string or an options object straight through to the client.

```js
// Run with: bun run index.ts
const { QuickDB } = require("grml.quick.db");
const { BunSQLDriver } = require("grml.quick.db/BunSQLDriver");

// Postgres
const driver = new BunSQLDriver("postgres://user:pass@localhost:5432/mydb");
// MySQL:   new BunSQLDriver("mysql://user:pass@localhost:3306/mydb")

const db = new QuickDB({ driver });

await db.init();
await db.set("test", "Hello World");
console.log(await db.get("test"));

await db.close(); // disconnect when finished
```

> `BunSQLDriver` only works under the Bun runtime; under Node it throws a clear error directing you to `PostgresDriver`/`MySQLDriver`.

### MySQL

```js
const { QuickDB } = require("grml.quick.db");
const { MySQLDriver } = require("grml.quick.db/MySQLDriver");

(async () => {
    const mysqlDriver = new MySQLDriver({
        host: "localhost",
        user: "me",
        password: "secret",
        database: "my_db",
    });

    const db = new QuickDB({ driver: mysqlDriver });
    await db.init(); // connects and sets up the database

    await db.set("userInfo", { difficulty: "Easy" });
})();
```

### Postgres

```js
const { QuickDB } = require("grml.quick.db");
const { PostgresDriver } = require("grml.quick.db/PostgresDriver");

(async () => {
    const postgresDriver = new PostgresDriver({
        host: "localhost",
        user: "me",
        password: "secret",
        database: "my_db",
    });

    const db = new QuickDB({ driver: postgresDriver });
    await db.init();

    await db.set("userInfo", { difficulty: "Easy" });
})();
```

### Turso / libSQL

[Turso](https://turso.tech) is a hosted database built on [libSQL](https://github.com/tursodatabase/libsql), a fork of SQLite. `TursoDriver` connects through the official [`@libsql/client`](https://www.npmjs.com/package/@libsql/client) package. Because libSQL is SQLite-compatible, it uses the same `(ID, json)` table layout as the default SQLite driver. Pass a remote Turso URL with an auth token, or a local `file:` URL for an embedded database.

```js
const { QuickDB } = require("grml.quick.db");
const { TursoDriver } = require("grml.quick.db/TursoDriver");

(async () => {
    const tursoDriver = new TursoDriver({
        url: "libsql://your-database.turso.io",
        authToken: "your-auth-token",
    });

    const db = new QuickDB({ driver: tursoDriver });
    await db.init();

    await db.set("userInfo", { difficulty: "Easy" });
})();
```

### MongoDB

```js
const { QuickDB } = require("grml.quick.db");
const { MongoDriver } = require("grml.quick.db/MongoDriver");

(async () => {
    const mongoDriver = new MongoDriver("mongodb://localhost/quickdb");

    const db = new QuickDB({ driver: mongoDriver });
    await db.init();

    await db.set("userInfo", { difficulty: "Easy" });

    await mongoDriver.close(); // disconnect when finished
})();
```

### JSON

```js
const { QuickDB } = require("grml.quick.db");
const { JSONDriver } = require("grml.quick.db/JSONDriver");

const jsonDriver = new JSONDriver();
const db = new QuickDB({ driver: jsonDriver });

await db.init();
await db.set("userInfo", { difficulty: "Easy" });
```

### In-memory

In-memory storage is not persistent and is intended for temporary caching or tests.

```js
const { QuickDB } = require("grml.quick.db");
const { MemoryDriver } = require("grml.quick.db/MemoryDriver");

const memoryDriver = new MemoryDriver();
const db = new QuickDB({ driver: memoryDriver });

await db.init();
await db.set("userInfo", { difficulty: "Easy" });
```

## Common methods

| Method                        | Description                                            |
| ----------------------------- | ------------------------------------------------------ |
| `set(key, value)`             | Store a value at a key or dot path.                    |
| `get(key)`                    | Read a value from a key or dot path.                   |
| `has(key)`                    | Check whether a key exists.                            |
| `delete(key)`                 | Remove a key.                                          |
| `add(key, number)`            | Add a number to a stored number.                       |
| `sub(key, number)`            | Subtract a number from a stored number.                |
| `push(key, value)`            | Append a value to a stored array.                      |
| `pull(key, value)`            | Remove matching values from a stored array.            |
| `all()`                       | Return every stored entry.                             |
| `deleteAll()`                 | Remove every stored entry.                             |

## Contributing

Contributions are welcome. Open an issue or pull request on the [repository](https://github.com/grMLEqomlkkU5Eeinz4brIrOVCUCkJuN/grml.quick.db).

```bash
npm install      # install dependencies
npm run build    # compile TypeScript
npm test         # run unit tests
npm run lint     # lint the source
```

Integration tests for the database drivers use Docker. Bring the test services up with `./deploy-integration-environment.sh`, then run `npm run test:integration`.

The Bun drivers (`BunSqliteDriver`, `BunSQLDriver`) have their own tests that run under the Bun runtime:

```bash
bun run test:bun              # unit tests (bun:sqlite + Bun.sql in-memory SQLite, no servers)
bun run test:bun:integration  # BunSQLDriver vs. live Postgres/MySQL (needs the Docker services above)
```

## Credits

This project is a fork of [quick.db](https://github.com/plexidev/quick.db), originally created by [Loren Cerri](https://github.com/TrueXPixels) and maintained by [Plexi Development](https://github.com/plexidev) and its contributors. All of the original design and the vast majority of the implementation are their work, and this fork would not exist without it. Thank you.

## License

[MIT](./LICENSE.md). The original copyright is retained alongside the fork's. See [LICENSE.md](./LICENSE.md) for details.
