const { Pool } = require('pg'); // Add the missing import
const isProduction = process.env.NODE_ENV === 'production';
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction
        ? { rejectUnauthorized: false }  // Render needs SSL
        : false                          // Local dev needs plain connection
});

// Handle connection errors gracefully
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = pool;