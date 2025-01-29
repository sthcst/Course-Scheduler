const { Pool } = require('pg');

// Initialize PostgreSQL Connection Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:mysecretpassword@localhost:5432/postgres',
});

// Export the pool for use in other modules
module.exports = pool;