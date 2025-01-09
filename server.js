require('dotenv').config(); // Load environment variables

const express = require('express');
const path = require('path');
const db = require('./db'); // Import db.js models

const app = express();
const PORT = 3000;

// Serve static files from the project directory
app.use(express.static(path.join(__dirname)));

// API endpoint to fetch data from MongoDB
app.get('/api/:collection', async (req, res) => {
    try {
        const collectionName = req.params.collection;
        let data;

        switch(collectionName) {
            case 'majors':
                data = await db.Major.find();
                break;
            case 'minors1':
                data = await db.Minor1.find();
                break;
            case 'minors2':
                data = await db.Minor2.find();
                break;
            case 'religion':
                data = await db.Religion.find();
                break;
            case 'core':
                data = await db.Core.find();
                break;
            case 'holokai':
                data = await db.Holokai.find();
                break;
            case 'eillevel1':
                data = await db.EILLevel1.find();
                break;
            case 'eillevel2':
                data = await db.EILLevel2.find();
                break;
            default:
                return res.status(404).send({ error: "Collection not found" });
        }

        res.json(data);
    } catch (error) {
        console.error(`Error fetching collection: ${req.params.collection}`, error);
        res.status(500).send({ error: "Internal Server Error" });
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