// db.js

const { Pool } = require('pg');

// Initialize PostgreSQL Connection Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/isaaccandari',
});

// Export the pool for use in other modules
module.exports = pool;