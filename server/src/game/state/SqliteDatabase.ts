import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";

const DEFAULT_DATABASE_FILENAME = "game.sqlite";

export interface SqliteDatabaseOptions {
    dataDir: string;
    databasePath?: string;
}

/**
 * Shared SQLite connection for a gamemode's durable game data.
 *
 * Account credentials and player state intentionally use separate tables, but
 * live in the same SQLite file so a local server only needs one database to
 * back up and manage.
 */
export class SqliteDatabase {
    readonly databasePath: string;
    readonly connection: DatabaseSync;

    constructor(options: SqliteDatabaseOptions) {
        this.databasePath = options.databasePath
            ? path.resolve(options.databasePath)
            : path.resolve(options.dataDir, DEFAULT_DATABASE_FILENAME);

        fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
        this.connection = new DatabaseSync(this.databasePath);
        this.connection.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS accounts (
                username TEXT PRIMARY KEY,
                password_algorithm TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                password_changed_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS player_states (
                account_name TEXT PRIMARY KEY,
                state_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            PRAGMA user_version = 1;
        `);
    }
}

const databaseInstances = new Map<string, SqliteDatabase>();

/** Return one shared connection for each database file in this server process. */
export function getSqliteDatabase(options: SqliteDatabaseOptions): SqliteDatabase {
    const databasePath = options.databasePath
        ? path.resolve(options.databasePath)
        : path.resolve(options.dataDir, DEFAULT_DATABASE_FILENAME);
    let database = databaseInstances.get(databasePath);
    if (!database) {
        database = new SqliteDatabase({ ...options, databasePath });
        databaseInstances.set(databasePath, database);
    }
    return database;
}
