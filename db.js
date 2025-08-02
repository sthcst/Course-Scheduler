const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const useSSL = connectionString.includes('render') || connectionString.includes('supabase');

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;
