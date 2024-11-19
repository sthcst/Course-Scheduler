const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = 3000;

// Serve static files from the project directory
app.use(express.static(path.join(__dirname)));

// API endpoint to fetch JSON data
app.get('/data/:file', async (req, res) => {
    try {
        const fileName = req.params.file;
        const filePath = path.join(__dirname, `${fileName}.json`);

        // Check if the file exists
        const data = await fs.readFile(filePath, 'utf-8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error(`Error reading file: ${fileName}.json`, error);
        res.status(404).send({ error: "File not found" });
    }
});

// Route for the homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
