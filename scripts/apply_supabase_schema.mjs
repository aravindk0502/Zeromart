import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

const schemaPath = path.resolve(process.cwd(), 'supabase/schema.sql');
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required to apply the Supabase schema.');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  const sql = await fs.readFile(schemaPath, 'utf8');
  await client.connect();
  await client.query(sql);
  console.log('Supabase schema applied successfully.');
} catch (error) {
  console.error('Failed to apply Supabase schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
