require('dotenv').config(); // Load environment variables from .env

const express = require('express');
const path = require('path');
const axios = require('axios'); // Add this at the top with other imports
const app = express();
const PORT = process.env.PORT || 3000;


// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Import and mount API routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

/**
 * Serve HTML Files Based on Routes
 * This catch-all route handles serving HTML files for frontend navigation
 */
app.get('*', (req, res) => {
    // Extract the pathname without query parameters
    const pathname = req.path;

    // Define a mapping of routes to HTML files
    const routeToFileMap = {
        '/course_details.html': 'course_details.html',
        '/edit_class.html': 'edit_class.html',
        '/add_new_class.html': 'add_new_class.html',
        '/search.html': 'search.html',
        '/change_plan.html': 'change_plan.html', // Add this line
    };

    const fileName = routeToFileMap[pathname];

    if (fileName) {
        res.sendFile(path.join(__dirname, 'public', fileName));
    } else {
        res.status(404).send('Page not found');
    }
});

// Add these routes specifically for the ML service
app.get('/api/classes/for-courses', async (req, res) => {
    try {
        const courseIds = req.query.ids.split(',').map(id => parseInt(id, 10));
        
        // Validate course IDs
        if (!courseIds.every(id => !isNaN(id))) {
            return res.status(400).json({ error: 'Invalid course IDs' });
        }
        
        // Build query to get classes for these courses
        const { rows } = await pool.query(`
            SELECT DISTINCT c.*
            FROM classes c
            JOIN classes_in_course cic ON c.id = cic.class_id
            WHERE cic.course_id = ANY($1::int[])
        `, [courseIds]);
        
        res.json(rows);
    } catch (error) {
        console.error('Error fetching classes for courses:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Update this proxy route in your server.js
app.post('/api/generate-schedule', async (req, res) => {
    try {
        // Try multiple possible URLs in order
        const possibleUrls = [
            'http://ml_service:5000/generate_schedule',  // Docker service name
            'http://localhost:5001/generate_schedule'    // Local development
        ];
        
        let lastError = null;
        
        for (const url of possibleUrls) {
            try {
                console.log(`Trying ML service at: ${url}`);
                const response = await axios.post(
                    url,
                    req.body,
                    {
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        timeout: 2000 // Short timeout to fail fast
                    }
                );
                
                console.log(`Successfully connected to ML service at: ${url}`);
                return res.json(response.data);
            } catch (error) {
                console.log(`Failed to connect to ${url}: ${error.message}`);
                lastError = error;
            }
        }
        
        // If we get here, all URLs failed
        throw lastError || new Error("Failed to connect to any ML service URL");
    } catch (error) {
        console.error('Error proxying request to ML service:', error);
        res.status(error.response?.status || 500).json({
            error: 'Failed to connect to ML service',
            details: error.message
        });
    }
});

// Similar endpoints for:
// GET /api/classes/english?level=EIL_LEVEL1
// GET /api/classes/religion

/**
 * Fallback Route for Undefined Endpoints
 * This should be placed after all other routes
 */
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
});