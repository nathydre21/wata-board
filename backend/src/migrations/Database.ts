import { Pool, PoolConfig } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export class Database {
  private static instance: Database;
  private pool: Pool;

  private constructor(config: DatabaseConfig) {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.maxConnections || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
    };

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  public static getInstance(config?: DatabaseConfig): Database {
    if (!Database.instance) {
      if (!config) {
        config = Database.getConfigFromEnv();
      }
      Database.instance = new Database(config);
    }
    return Database.instance;
  }

  private static getConfigFromEnv(): DatabaseConfig {
    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '5432');
    const database = process.env.DB_NAME || 'wata_board';
    const username = process.env.DB_USER || 'postgres';
    const password = process.env.DB_PASSWORD || 'password';
    const ssl = process.env.DB_SSL === 'true';
    const maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS || '20');
    const idleTimeoutMillis = parseInt(process.env.DB_IDLE_TIMEOUT || '30000');
    const connectionTimeoutMillis = parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000');

    return {
      host,
      port,
      database,
      username,
      password,
      ssl,
      maxConnections,
      idleTimeoutMillis,
      connectionTimeoutMillis,
    };
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Query executed', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error('Query failed', { text, duration, error });
      throw error;
    }
  }

  public async getClient() {
    return await this.pool.connect();
  }

  public getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}
