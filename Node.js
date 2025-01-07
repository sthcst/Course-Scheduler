const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Load environment variables from .env file
require('dotenv').config();

// PostgreSQL connection configuration
const client = new Client({
    user: process.env.DB_USER || 'icandari',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_DATABASE || 'course_scheduler',
    password: process.env.DB_PASSWORD || 'your_secure_password',
    port: process.env.DB_PORT || 5432,
});

// Specify the folders containing JSON files
const folders = ["majors", "minors", "religion", "EIL", "holokai", "core"];

const importData = async () => {
    try {
        await client.connect();
        console.log('Connected to PostgreSQL');

        for (const folder of folders) {
            const folderPath = path.join(__dirname, folder);
            
            // Check if folder exists
            if (!fs.existsSync(folderPath)) {
                console.warn(`Folder not found: ${folderPath}. Skipping...`);
                continue;
            }

            const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.json'));

            for (const file of files) {
                const filePath = path.join(folderPath, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

                for (const course of data.courses) {
                    const { course_number, course_name, semesters_offered, credits, prerequisites } = course;
                    const type = path.basename(file, '.json'); // Use filename (without extension) as type

                    const query = `
                        INSERT INTO courses (course_number, course_name, semesters_offered, credits, prerequisites, type)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (course_number) DO NOTHING
                    `;
                    const values = [
                        course_number,
                        course_name,
                        semesters_offered,
                        credits,
                        prerequisites.length > 0 ? prerequisites : null,
                        type
                    ];

                    try {
                        await client.query(query, values);
                        console.log(`Inserted: ${course_number} - ${course_name} as ${type}`);
                    } catch (insertErr) {
                        console.error(`Error inserting ${course_number}:`, insertErr.message);
                    }
                }
            }
        }

        console.log('All data has been imported.');
    } catch (err) {
        console.error('Error importing data:', err);
    } finally {
        await client.end();
        console.log('Disconnected from PostgreSQL');
    }
};

importData();