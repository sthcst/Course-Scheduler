require('dotenv').config(); // Load environment variables from .env

const express = require('express');
const path = require('path');
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
    };

    const fileName = routeToFileMap[pathname];

    if (fileName) {
        res.sendFile(path.join(__dirname, 'public', fileName));
    } else {
        res.status(404).send('Page not found');
    }
});

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