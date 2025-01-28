// server.js

require('dotenv').config(); // Load environment variables from .env

// Example in node_modules/gopd/index.js
const gOPD = require('./gOPD'); // This should match the actual file name

const express = require('express');
const path = require('path');
const { Pool } = require('pg'); // PostgreSQL client
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the project root
app.use(express.static(__dirname));

/**
 * PostgreSQL Connection Pool Setup
 */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/isaaccandari',
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client', err.stack);
    }
    client.query('SELECT NOW()', (err, result) => {
        release();
        if (err) {
            return console.error('Error executing query', err.stack);
        }
        console.log('Database connected:', result.rows);
    });
});

/**
 * @route   GET /api/courses
 * @desc    Fetch all courses or filter by course_name/course_id
 * @access  Public
 */
app.get('/api/courses', async (req, res) => {
    try {
        const { course_name, course_id } = req.query;
        let query = `
            SELECT 
                courses.id,
                courses.course_name,
                courses.course_type,
                COALESCE(json_agg(
                    json_build_object(
                        'id', classes.id,
                        'class_name', classes.class_name,
                        'class_number', classes.class_number,
                        'semesters_offered', classes.semesters_offered,
                        'prerequisites', classes.prerequisites,
                        'corequisites', classes.corequisites,
                        'days_offered', classes.days_offered,
                        'times_offered', classes.times_offered
                    ) ORDER BY classes.id
                ) FILTER (WHERE classes.id IS NOT NULL), '[]') AS classes
            FROM 
                courses
            LEFT JOIN 
                classes_in_course cic ON cic.course_id = courses.id
            LEFT JOIN 
                classes ON classes.id = cic.class_id
        `;
        const values = [];
        const conditions = [];
        let count = 1;

        if (course_id) {
            conditions.push(`courses.id = $${count}`);
            values.push(course_id);
            count++;
        }

        if (course_name) {
            conditions.push(`courses.course_name ILIKE $${count}`);
            values.push(`%${course_name}%`);
            count++;
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' GROUP BY courses.id';

        console.log("Executing query:", query, values); // Debug log

        const { rows } = await pool.query(query, values);

        if (course_id) {
            const course = rows.find(c => c.id == course_id);
            if (course) {
                res.json(course);
            } else {
                res.status(404).json({ error: 'Course not found.' });
            }
        } else {
            res.json(rows);
        }
    } catch (error) {
        console.error('❌ Error fetching courses:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   GET /api/courses/:course_id
 * @desc    Fetch a specific course by course_id
 * @access  Public
 */
app.get('/api/courses/:course_id', async (req, res) => {
    try {
        const { course_id } = req.params;
        let query = `
            SELECT 
                courses.id,
                courses.course_name,
                courses.course_type,
                COALESCE(json_agg(
                    json_build_object(
                        'id', classes.id,
                        'class_name', classes.class_name,
                        'class_number', classes.class_number,
                        'semesters_offered', classes.semesters_offered,
                        'prerequisites', classes.prerequisites,
                        'corequisites', classes.corequisites,
                        'days_offered', classes.days_offered,
                        'times_offered', classes.times_offered
                    ) ORDER BY classes.id
                ) FILTER (WHERE classes.id IS NOT NULL), '[]') AS classes
            FROM 
                courses
            LEFT JOIN 
                classes_in_course cic ON cic.course_id = courses.id
            LEFT JOIN 
                classes ON classes.id = cic.class_id
            WHERE 
                courses.id = $1
            GROUP BY 
                courses.id
        `;
        const values = [course_id];

        console.log("Executing query for specific course:", query, values); // Debug log

        const { rows } = await pool.query(query, values);

        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Course not found.' });
        }
    } catch (error) {
        console.error('❌ Error fetching specific course:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   DELETE /api/courses/:course_id/classes/:class_id
 * @desc    Remove a class from a specific course based on class_id
 * @access  Public
 */
app.delete('/api/courses/:course_id/classes/:class_id', async (req, res) => {
    const { course_id, class_id } = req.params;

    try {
        // Validate that course_id and class_id are integers
        const courseIdNum = parseInt(course_id, 10);
        const classIdNum = parseInt(class_id, 10);
        if (isNaN(courseIdNum) || isNaN(classIdNum)) {
            return res.status(400).json({ error: 'course_id and class_id must be integers.' });
        }

        // Check if the association exists
        const checkQuery = `
            SELECT * FROM classes_in_course
            WHERE course_id = $1 AND class_id = $2
        `;
        const checkValues = [courseIdNum, classIdNum];
        const { rows: associationRows } = await pool.query(checkQuery, checkValues);

        if (associationRows.length === 0) {
            return res.status(404).json({ error: 'Association not found between the specified course and class.' });
        }

        // Delete the association
        const deleteQuery = `
            DELETE FROM classes_in_course
            WHERE course_id = $1 AND class_id = $2
            RETURNING *
        `;
        const deleteValues = [courseIdNum, classIdNum];
        const deleteResult = await pool.query(deleteQuery, deleteValues);

        res.json({ message: 'Class successfully removed from the course.', data: deleteResult.rows[0] });
    } catch (error) {
        console.error('❌ Error deleting class from course:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   GET /api/classes/check
 * @desc    Check if a class with the given class_id exists
 * @access  Public
 */
app.get('/api/classes/check', async (req, res) => {
    const { class_id } = req.query;

    if (!class_id) {
        return res.status(400).json({ error: 'class_id query parameter is required.' });
    }

    try {
        const classIdNum = parseInt(class_id, 10);
        if (isNaN(classIdNum)) {
            return res.status(400).json({ error: 'class_id must be an integer.' });
        }

        const checkQuery = 'SELECT * FROM classes WHERE id = $1';
        const checkValues = [classIdNum];
        const { rows } = await pool.query(checkQuery, checkValues);

        if (rows.length > 0) {
            res.json({ exists: true, class: rows[0] });
        } else {
            res.json({ exists: false, message: 'Class does not exist.' });
        }
    } catch (error) {
        console.error('❌ Error checking class ID:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   GET /api/courses/:course_id/classes/:class_id
 * @desc    Fetch a specific class associated with a course
 * @access  Public
 */
app.get('/api/courses/:course_id/classes/:class_id', async (req, res) => {
    const { course_id, class_id } = req.params;

    try {
        // Validate course_id and class_id
        const courseIdNum = parseInt(course_id, 10);
        const classIdNum = parseInt(class_id, 10);
        if (isNaN(courseIdNum) || isNaN(classIdNum)) {
            return res.status(400).json({ error: 'course_id and class_id must be integers.' });
        }

        // Check if the association exists
        const checkQuery = `
            SELECT * FROM classes_in_course
            WHERE course_id = $1 AND class_id = $2
        `;
        const checkValues = [courseIdNum, classIdNum];
        const { rows: associationRows } = await pool.query(checkQuery, checkValues);

        if (associationRows.length === 0) {
            return res.status(404).json({ error: 'Association not found between the specified course and class.' });
        }

        // Fetch class details
        const classQuery = `
            SELECT 
                id,
                class_number,
                class_name,
                semesters_offered,
                credits,
                prerequisites,
                corequisites,
                days_offered,
                times_offered,
                created_at,
                updated_at
            FROM classes
            WHERE id = $1
        `;
        const classValues = [classIdNum];
        const { rows: classRows } = await pool.query(classQuery, classValues);

        if (classRows.length === 0) {
            return res.status(404).json({ error: 'Class not found.' });
        }

        const classData = classRows[0];

        // Ensure times_offered is an array
        if (!Array.isArray(classData.times_offered)) {
            classData.times_offered = [];
        }

        /**
 * Helper function to fetch class details by IDs or class identifiers (class_number/class_name)
 * @param {Array} identifiers - Array containing class IDs (numbers) or class identifiers (strings)
 * @returns {Array} - Array of class detail objects
 */
    const fetchClassDetails = async (identifiers) => {
        if (!identifiers || identifiers.length === 0) return [];

        const classDetails = [];

        for (const identifier of identifiers) {
            if (typeof identifier === 'number' || /^\d+$/.test(identifier)) {
                // If identifier is a number or a string that represents a number, treat it as class_id
                const classId = typeof identifier === 'number' ? identifier : parseInt(identifier, 10);
                if (isNaN(classId)) continue;

                const classQuery = `
                    SELECT id, class_number, class_name
                    FROM classes
                    WHERE id = $1
                `;
                const { rows } = await pool.query(classQuery, [classId]);
                if (rows.length > 0) {
                    classDetails.push(rows[0]);
                }
            } else if (typeof identifier === 'string') {
                // If identifier is a string, attempt to find by class_number or class_name
                const classQuery = `
                    SELECT id, class_number, class_name
                    FROM classes
                    WHERE class_number = $1 OR class_name ILIKE $1
                    LIMIT 1
                `;
                const { rows } = await pool.query(classQuery, [identifier]);
                if (rows.length > 0) {
                    classDetails.push(rows[0]);
                }
            }
        }

        return classDetails;
    };
        // Fetch prerequisites details
        const prereqDetails = await fetchClassDetails(classData.prerequisites);

        // Fetch corequisites details
        const coreqDetails = await fetchClassDetails(classData.corequisites);

        // Prepare the response
        const response = {
            id: classData.id,
            class_number: classData.class_number,
            class_name: classData.class_name,
            semesters_offered: classData.semesters_offered,
            credits: classData.credits,
            prerequisites: prereqDetails, // Array of objects with id, class_number, class_name
            corequisites: coreqDetails,   // Array of objects with id, class_number, class_name
            days_offered: classData.days_offered,
            times_offered: classData.times_offered,
            created_at: classData.created_at,
            updated_at: classData.updated_at
        };

        res.json(response);

    } catch (error) {
        console.error('❌ Error fetching class details:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   POST /api/courses/:course_id/classes
 * @desc    Associate an existing class to a specific course using class_id
 * @access  Public
 */
app.post('/api/courses/:course_id/classes', async (req, res) => {
    const { course_id } = req.params;
    const { class_id } = req.body;

    if (!class_id) {
        return res.status(400).json({ error: 'class_id is required.' });
    }

    try {
        // Validate course_id and class_id
        const courseIdNum = parseInt(course_id, 10);
        const classIdNum = parseInt(class_id, 10);
        if (isNaN(courseIdNum) || isNaN(classIdNum)) {
            return res.status(400).json({ error: 'course_id and class_id must be integers.' });
        }

        // Check if class exists
        const classQuery = 'SELECT id FROM classes WHERE id = $1';
        const classValues = [classIdNum];
        const { rows: classRows } = await pool.query(classQuery, classValues);

        if (classRows.length === 0) {
            return res.status(404).json({ error: 'Class not found.' });
        }

        // Check if the association already exists
        const checkQuery = `
            SELECT * FROM classes_in_course
            WHERE course_id = $1 AND class_id = $2
        `;
        const checkValues = [courseIdNum, classIdNum];
        const { rows: associationRows } = await pool.query(checkQuery, checkValues);

        if (associationRows.length > 0) {
            return res.status(400).json({ error: 'Class is already associated with this course.' });
        }

        // Create the association
        const insertQuery = `
            INSERT INTO classes_in_course (course_id, class_id)
            VALUES ($1, $2)
            RETURNING *
        `;
        const insertValues = [courseIdNum, classIdNum];
        const insertResult = await pool.query(insertQuery, insertValues);

        res.status(201).json({ message: 'Class successfully added to the course.', data: insertResult.rows[0] });
    } catch (error) {
        console.error('❌ Error adding class to course:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   POST /api/courses/:course_id/classes/new
 * @desc    Add a new class and associate it with a specific course
 * @access  Public
 */
app.post('/api/courses/:course_id/classes/new', async (req, res) => {
    const { course_id } = req.params;
    const { 
        class_number, 
        class_name, 
        semesters_offered, 
        credits, 
        prerequisites, 
        corequisites, 
        days_offered, 
        times_offered 
    } = req.body;

    // Validate required fields
    if (!class_number || !class_name || credits == null) {
        return res.status(400).json({ error: 'class_number, class_name, and credits are required.' });
    }

    // Validate that credits is a non-negative integer
    if (!Number.isInteger(credits) || credits < 0) {
        return res.status(400).json({ error: 'credits must be a non-negative integer.' });
    }

    try {
        // Validate course_id
        const courseIdNum = parseInt(course_id, 10);
        if (isNaN(courseIdNum)) {
            return res.status(400).json({ error: 'course_id must be an integer.' });
        }

        // Check for existing class_number (case-insensitive)
        const existingClassNumberQuery = 'SELECT id FROM classes WHERE LOWER(class_number) = LOWER($1)';
        const existingClassNumberValues = [class_number];
        const { rows: existingClassNumberRows } = await pool.query(existingClassNumberQuery, existingClassNumberValues);

        if (existingClassNumberRows.length > 0) {
            return res.status(400).json({ error: 'A class with this class_number already exists.' });
        }

        // Check for existing class_name (case-insensitive)
        const existingClassNameQuery = 'SELECT id FROM classes WHERE LOWER(class_name) = LOWER($1)';
        const existingClassNameValues = [class_name];
        const { rows: existingClassNameRows } = await pool.query(existingClassNameQuery, existingClassNameValues);

        if (existingClassNameRows.length > 0) {
            return res.status(400).json({ error: 'A class with this class_name already exists.' });
        }

        // Parse prerequisites and corequisites as integers
        const parsedPrerequisites = Array.isArray(prerequisites) 
            ? prerequisites.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) 
            : [];
        const parsedCorequisites = Array.isArray(corequisites) 
            ? corequisites.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) 
            : [];

        // Insert new class
        const insertClassQuery = `
            INSERT INTO classes (
                class_number, 
                class_name, 
                semesters_offered, 
                credits, 
                prerequisites, 
                corequisites, 
                days_offered, 
                times_offered,
                created_at,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            RETURNING id
        `;
        const insertClassValues = [
            class_number,
            class_name,
            semesters_offered || [],
            credits,
            parsedPrerequisites || [],
            parsedCorequisites || [],
            days_offered || [],
            times_offered || []
        ];
        const insertClassResult = await pool.query(insertClassQuery, insertClassValues);
        const newClassId = insertClassResult.rows[0].id;

        // Associate the new class with the course
        const associateQuery = `
            INSERT INTO classes_in_course (course_id, class_id)
            VALUES ($1, $2)
            RETURNING *
        `;
        const associateValues = [courseIdNum, newClassId];
        const associateResult = await pool.query(associateQuery, associateValues);

        res.status(201).json({ message: 'New class added and associated with the course successfully.', data: associateResult.rows[0] });
    } catch (error) {
        console.error('❌ Error adding new class to course:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   PUT /api/courses/:course_id/classes/:class_id
 * @desc    Update a class within a specific course using class_id
 * @access  Public
 */
app.put('/api/courses/:course_id/classes/:class_id', async (req, res) => {
    const { course_id, class_id } = req.params;
    const updateData = req.body;

    try {
        // Validate course_id and class_id
        const courseIdNum = parseInt(course_id, 10);
        const classIdNum = parseInt(class_id, 10);
        if (isNaN(courseIdNum) || isNaN(classIdNum)) {
            return res.status(400).json({ error: 'course_id and class_id must be integers.' });
        }

        // Check if the association exists
        const checkQuery = `
            SELECT * FROM classes_in_course
            WHERE course_id = $1 AND class_id = $2
        `;
        const checkValues = [courseIdNum, classIdNum];
        const { rows: associationRows } = await pool.query(checkQuery, checkValues);

        if (associationRows.length === 0) {
            return res.status(404).json({ error: 'Association not found between the specified course and class.' });
        }

        // Initialize arrays to hold fields and values for update
        const fields = [];
        const values = [];
        let count = 1;

        // List of allowed fields to update
        const allowedFields = ['class_number', 'class_name', 'semesters_offered', 'credits', 'prerequisites', 'corequisites', 'days_offered', 'times_offered'];

        for (const key of allowedFields) {
            if (key in updateData) {
                if (key === 'prerequisites' || key === 'corequisites') {
                    // Parse prerequisites and corequisites as integers
                    const parsedArray = Array.isArray(updateData[key]) 
                        ? updateData[key].map(id => parseInt(id, 10)).filter(id => !isNaN(id)) 
                        : [];
                    fields.push(`${key} = $${count}`);
                    values.push(parsedArray);
                } else if (key === 'credits') {
                    const creditVal = parseInt(updateData[key], 10);
                    if (isNaN(creditVal) || creditVal < 0) {
                        return res.status(400).json({ error: 'credits must be a non-negative integer.' });
                    }
                    fields.push(`${key} = $${count}`);
                    values.push(creditVal);
                } else {
                    fields.push(`${key} = $${count}`);
                    values.push(updateData[key]);
                }
                count++;
            }
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No valid fields provided for update.' });
        }

        const updateQuery = `
            UPDATE classes
            SET ${fields.join(', ')}
            WHERE id = $${count}
            RETURNING *
        `;
        values.push(classIdNum);

        const updateResult = await pool.query(updateQuery, values);

        res.json({ message: 'Class updated successfully.', data: updateResult.rows[0] });
    } catch (error) {
        console.error('❌ Error updating class:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   GET /api/classes/search
 * @desc    Search for classes by class_number or class_name with partial matching
 * @access  Public
 */
app.get('/api/classes/search', async (req, res) => {
    const { query } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required.' });
    }

    try {
        const searchQuery = `
            SELECT 
                id,
                class_number, 
                class_name 
            FROM 
                classes 
            WHERE 
                class_number ILIKE $1 OR 
                class_name ILIKE $1
            ORDER BY 
                class_number
            LIMIT 50
        `;
        const searchValues = [`%${query}%`];
        const { rows } = await pool.query(searchQuery, searchValues);

        res.json({ classes: rows });
    } catch (error) {
        console.error('❌ Error searching classes:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   POST /api/classes
 * @desc    Add a new class independently
 * @access  Public
 */
app.post('/api/classes', async (req, res) => {
    const {
        class_number,
        class_name,
        semesters_offered,
        credits,
        prerequisites,
        corequisites,
        days_offered,
        times_offered
    } = req.body;

    // Validate required fields
    if (!class_number || !class_name || credits == null) {
        return res.status(400).json({ error: 'class_number, class_name, and credits are required.' });
    }

    // Validate that credits is a non-negative integer
    if (!Number.isInteger(credits) || credits < 0) {
        return res.status(400).json({ error: 'credits must be a non-negative integer.' });
    }

    try {
        // Parse prerequisites and corequisites as integers
        const parsedPrerequisites = Array.isArray(prerequisites) 
            ? prerequisites.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) 
            : [];
        const parsedCorequisites = Array.isArray(corequisites) 
            ? corequisites.map(id => parseInt(id, 10)).filter(id => !isNaN(id)) 
            : [];

        const insertQuery = `
            INSERT INTO classes (
                class_number,
                class_name,
                semesters_offered,
                credits,
                prerequisites,
                corequisites,
                days_offered,
                times_offered,
                created_at,
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
            ) RETURNING *
        `;
        const values = [
            class_number,
            class_name,
            semesters_offered || [],
            credits,
            parsedPrerequisites || [],
            parsedCorequisites || [],
            days_offered || [],
            times_offered || null
        ];

        const { rows } = await pool.query(insertQuery, values);
        res.status(201).json({ message: 'Class added successfully!', class: rows[0] });
    } catch (error) {
        console.error('❌ Error adding class:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   POST /api/courses
 * @desc    Create a new course
 * @access  Public
 */
app.post('/api/courses', async (req, res) => {
    const { course_name, course_type } = req.body;

    // Validate input
    if (!course_name || !course_type) {
        return res.status(400).json({ error: 'Course name and course type are required.' });
    }

    try {
        // Insert new course into the database
        const insertQuery = `
            INSERT INTO courses (course_name, course_type, created_at, updated_at)
            VALUES ($1, $2, NOW(), NOW())
            RETURNING id
        `;
        const insertValues = [course_name, course_type];
        const result = await pool.query(insertQuery, insertValues);
        const newCourseId = result.rows[0].id;

        res.status(201).json({ message: 'Course created successfully.', id: newCourseId });
    } catch (error) {
        console.error('❌ Error creating course:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

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
        '/add_new_class.html': 'add_new_class.html',
        '/search.html': 'search.html',
    };

    const fileName = routeToFileMap[pathname];

    if (fileName) {
        res.sendFile(path.join(__dirname, fileName));
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