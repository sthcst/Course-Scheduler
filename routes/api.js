// filepath: /Users/isaaccandari/Folders/Work/Course-Scheduler/routes/api.js

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// PostgreSQL Connection Pool Setup
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
 * @route   GET /courses
 * @desc    Fetch all courses or filter by course_name/course_id
 * @access  Public
 */
router.get('/courses', async (req, res) => {
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
 * @route   GET /courses/:course_id
 * @desc    Fetch a specific course by course_id
 * @access  Public
 */
router.get('/courses/:course_id', async (req, res) => {
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
 * @route   DELETE /courses/:course_id/classes/:class_id
 * @desc    Remove a class from a specific course based on class_id
 * @access  Public
 */
router.delete('/courses/:course_id/classes/:class_id', async (req, res) => {
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
 * @route   GET /classes/search
 * @desc    Search for classes by class_number or class_name
 * @access  Public
 */
router.get('/classes/search', async (req, res) => {
    const { query, limit } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required.' });
    }

    const searchLimit = parseInt(limit, 10) || 10; // Default limit to 10 if not provided or invalid

    try {
        // Perform case-insensitive search on class_number and class_name
        const searchQuery = `
            SELECT id, class_number, class_name
            FROM classes
            WHERE class_number ILIKE $1 OR class_name ILIKE $1
            ORDER BY class_number ASC
            LIMIT $2
        `;
        const searchValue = [`%${query}%`, searchLimit];
        const { rows } = await pool.query(searchQuery, searchValue);

        res.json({ classes: rows });
    } catch (error) {
        console.error('❌ Error searching classes:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   POST /courses/:course_id/classes
 * @desc    Add an existing class to a specific course
 * @access  Public
 */
router.post('/courses/:course_id/classes', async (req, res) => {
    const { course_id } = req.params;
    const { class_id } = req.body;

    try {
        // Validate that course_id and class_id are integers
        const courseIdNum = parseInt(course_id, 10);
        const classIdNum = parseInt(class_id, 10);
        if (isNaN(courseIdNum) || isNaN(classIdNum)) {
            return res.status(400).json({ error: 'course_id and class_id must be integers.' });
        }

        // Check if the course exists
        const courseCheckQuery = `SELECT * FROM courses WHERE id = $1`;
        const courseCheckResult = await pool.query(courseCheckQuery, [courseIdNum]);
        if (courseCheckResult.rows.length === 0) {
            return res.status(404).json({ error: 'Course not found.' });
        }

        // Check if the class exists
        const classCheckQuery = `SELECT * FROM classes WHERE id = $1`;
        const classCheckResult = await pool.query(classCheckQuery, [classIdNum]);
        if (classCheckResult.rows.length === 0) {
            return res.status(404).json({ error: 'Class not found.' });
        }

        // Check if the association already exists
        const associationCheckQuery = `
            SELECT * FROM classes_in_course
            WHERE course_id = $1 AND class_id = $2
        `;
        const { rows: associationRows } = await pool.query(associationCheckQuery, [courseIdNum, classIdNum]);

        if (associationRows.length > 0) {
            return res.status(400).json({ error: 'Class is already associated with this course.' });
        }

        // Insert the new association
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
 * @route   POST /courses
 * @desc    Create a new course
 * @access  Public
 */
router.post('/courses', async (req, res) => {
    const { course_name, course_type } = req.body;

    // Basic validation
    if (!course_name || !course_type) {
        return res.status(400).json({ error: 'Course name and type are required.' });
    }

    try {
        // Insert the new course into the courses table
        const insertQuery = `
            INSERT INTO courses (course_name, course_type)
            VALUES ($1, $2)
            RETURNING id, course_name, course_type
        `;
        const values = [course_name, course_type];

        const { rows } = await pool.query(insertQuery, values);
        const newCourse = rows[0];

        res.status(201).json({
            message: 'Course created successfully.',
            course: newCourse
        });
    } catch (error) {
        console.error('❌ Error creating course:', error);

        // Handle unique constraint violation (e.g., duplicate course_name)
        if (error.code === '23505') { // PostgreSQL unique_violation
            return res.status(409).json({ error: 'Course with this name already exists.' });
        }

        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   GET /courses/:course_id/classes/:class_id
 * @desc    Fetch a specific class associated with a course
 * @access  Public
 */
router.get('/courses/:course_id/classes/:class_id', async (req, res) => {
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

// [Include all other API routes here following the same pattern...]

module.exports = router;