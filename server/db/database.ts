import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { SCHEMA } from './schema.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

let db: SqlJsDatabase | null = null;
let dbPath: string;

export interface PreparedLike {
  all(...params: any[]): any[];
  get(...params: any[]): any;
  run(...params: any[]): { changes: number };
}

function createPreparedLike(database: SqlJsDatabase, sql: string): PreparedLike {
  return {
    all(...params: any[]): any[] {
      const stmt = database.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      const results: any[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },
    get(...params: any[]): any {
      const stmt = database.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      let result = null;
      if (stmt.step()) {
        result = stmt.getAsObject();
      }
      stmt.free();
      return result;
    },
    run(...params: any[]): { changes: number } {
      database.run(sql, params);
      const changes = database.getRowsModified();
      scheduleSave();
      return { changes };
    },
  };
}

export interface DbWrapper {
  prepare(sql: string): PreparedLike;
  exec(sql: string): void;
}

let wrapper: DbWrapper | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (db) {
      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    }
  }, 500);
}

export async function initDb(): Promise<DbWrapper> {
  if (wrapper) return wrapper;

  const SQL = await initSqlJs();
  dbPath = config.dbPath;
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  // Execute schema statements one by one
  const statements = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    db.run(stmt + ';');
  }

  // Save initial state
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));

  wrapper = {
    prepare(sql: string): PreparedLike {
      return createPreparedLike(db!, sql);
    },
    exec(sql: string): void {
      db!.run(sql);
      scheduleSave();
    },
  };

  logger.info(`Database initialized at ${dbPath}`);
  return wrapper;
}

export function getDb(): DbWrapper {
  if (!wrapper) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return wrapper;
}

export function saveDb(): void {
  if (db) {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}

export function closeDb(): void {
  if (saveTimer) clearTimeout(saveTimer);
  if (db) {
    saveDb();
    db.close();
    db = null;
    wrapper = null;
    logger.info('Database connection closed');
  }
}
