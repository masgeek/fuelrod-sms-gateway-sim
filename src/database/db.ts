// db.ts
import { Pool } from 'pg';
import { config } from '../config/env';

export const pool = new Pool({
    connectionString: config.database_url, // e.g., "postgres://user:pass@host:port/db"
});
