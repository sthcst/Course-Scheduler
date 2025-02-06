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
                c.id,
                c.course_name,
                c.course_type,
                json_agg(DISTINCT jsonb_build_object(
                    'id', cs.id,
                    'section_name', cs.section_name,
                    'credits_required', cs.credits_required,
                    'electives_required', cs.electives_required,
                    'classes', (
                        SELECT json_agg(json_build_object(
                            'id', cl.id,
                            'class_name', cl.class_name,
                            'class_number', cl.class_number,
                            'semesters_offered', cl.semesters_offered,
                            'prerequisites', cl.prerequisites,
                            'corequisites', cl.corequisites,
                            'credits', cl.credits,
                            'is_elective', cic.is_elective,
                            'elective_group', CASE 
                                WHEN cic.elective_group_id IS NOT NULL THEN json_build_object(
                                    'id', eg.id,
                                    'name', eg.group_name,
                                    'required_count', eg.required_count
                                )
                                ELSE NULL
                            END
                        ))
                        FROM classes_in_course cic2
                        JOIN classes cl ON cl.id = cic2.class_id
                        LEFT JOIN elective_groups eg ON eg.id = cic2.elective_group_id
                        WHERE cic2.course_id = c.id AND cic2.section_id = cs.id
                    )
                )) as sections
            FROM courses c
            LEFT JOIN course_sections cs ON cs.course_id = c.id
            LEFT JOIN classes_in_course cic ON cic.course_id = c.id
        `;

        const values = [];
        const conditions = [];
        let count = 1;

        if (course_id) {
            conditions.push(`c.id = $${count}`);
            values.push(course_id);
            count++;
        }

        if (course_name) {
            conditions.push(`c.course_name ILIKE $${count}`);
            values.push(`%${course_name}%`);
            count++;
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' GROUP BY c.id';

        const { rows } = await pool.query(query, values);

        // Format response
        const formattedRows = rows.map(row => ({
            id: row.id,
            course_name: row.course_name,
            course_type: row.course_type,
            sections: row.sections.filter(section => section !== null).map(section => ({
                id: section.id,
                section_name: section.section_name,
                credits_required: section.credits_required,
                electives_required: section.electives_required,
                classes: section.classes || []
            }))
        }));

        if (course_id) {
            const course = formattedRows.find(c => c.id == course_id);
            if (course) {
                res.json(course);
            } else {
                res.status(404).json({ error: 'Course not found.' });
            }
        } else {
            res.json(formattedRows);
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
        const query = `
            SELECT 
                c.id,
                c.course_name,
                c.course_type,
                json_agg(DISTINCT jsonb_build_object(
                    'id', cs.id,
                    'section_name', cs.section_name,
                    'credits_required', cs.credits_required,
                    'electives_required', cs.electives_required,
                    'classes', (
                        SELECT json_agg(json_build_object(
                            'id', cl.id,
                            'class_name', cl.class_name,
                            'class_number', cl.class_number,
                            'semesters_offered', cl.semesters_offered,
                            'prerequisites', cl.prerequisites,
                            'corequisites', cl.corequisites,
                            'days_offered', cl.days_offered,
                            'times_offered', cl.times_offered,
                            'credits', cl.credits,
                            'is_elective', cic2.is_elective,
                            'elective_group', CASE 
                                WHEN cic2.elective_group_id IS NOT NULL THEN json_build_object(
                                    'id', eg.id,
                                    'name', eg.group_name,
                                    'required_count', eg.required_count
                                )
                                ELSE NULL
                            END
                        ))
                        FROM classes_in_course cic2
                        JOIN classes cl ON cl.id = cic2.class_id
                        LEFT JOIN elective_groups eg ON eg.id = cic2.elective_group_id
                        WHERE cic2.course_id = c.id AND cic2.section_id = cs.id
                    )
                )) as sections
            FROM courses c
            LEFT JOIN course_sections cs ON cs.course_id = c.id
            LEFT JOIN classes_in_course cic ON cic.course_id = c.id
            WHERE c.id = $1
            GROUP BY c.id;
        `;

        const { rows } = await pool.query(query, [course_id]);

        if (rows.length > 0) {
            const course = {
                ...rows[0],
                sections: rows[0].sections.filter(section => section !== null).map(section => ({
                    ...section,
                    classes: section.classes || []
                }))
            };
            res.json(course);
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
            SELECT c.*, cic.section_id, cic.is_elective, cic.elective_group_id
            FROM classes_in_course cic
            JOIN classes c ON c.id = cic.class_id
            WHERE cic.course_id = $1 AND cic.class_id = $2
        `;
        const checkValues = [courseIdNum, classIdNum];
        const { rows: associationRows } = await pool.query(checkQuery, checkValues);

        if (associationRows.length === 0) {
            return res.status(404).json({ error: 'Association not found between the specified course and class.' });
        }

        // Begin transaction
        await pool.query('BEGIN');

        try {
            // Delete the association
            const deleteAssocQuery = `
                DELETE FROM classes_in_course
                WHERE course_id = $1 AND class_id = $2
                RETURNING *
            `;
            const deleteAssocResult = await pool.query(deleteAssocQuery, [courseIdNum, classIdNum]);

            // Check if this class is used in any other courses
            const checkUsageQuery = `
                SELECT COUNT(*) 
                FROM classes_in_course 
                WHERE class_id = $1
            `;
            const { rows: usageRows } = await pool.query(checkUsageQuery, [classIdNum]);

            // If class is not used anywhere else, delete it from classes table
            if (parseInt(usageRows[0].count) === 0) {
                const deleteClassQuery = `
                    DELETE FROM classes 
                    WHERE id = $1 
                    RETURNING *
                `;
                await pool.query(deleteClassQuery, [classIdNum]);
            }

            await pool.query('COMMIT');
            res.json({ 
                message: 'Class successfully removed from the course.',
                data: deleteAssocResult.rows[0]
            });

        } catch (err) {
            await pool.query('ROLLBACK');
            throw err;
        }

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
 * @route   GET /classes/:class_id
 * @desc    Fetch a specific class without course association
 * @access  Public
 */
router.get('/classes/:class_id', async (req, res) => {
    const { class_id } = req.params;

    try {
        const classIdNum = parseInt(class_id, 10);
        if (isNaN(classIdNum)) {
            return res.status(400).json({ error: 'class_id must be an integer.' });
        }

        const classQuery = `
            SELECT 
                id,
                class_number,
                class_name,
                semesters_offered,
                prerequisites,
                corequisites,
                credits,
                is_elective,
                days_offered,
                times_offered,
                created_at,
                updated_at
            FROM classes
            WHERE id = $1
        `;
        const { rows: classRows } = await pool.query(classQuery, [classIdNum]);

        if (classRows.length === 0) {
            return res.status(404).json({ error: 'Class not found.' });
        }

        const classData = classRows[0];

        // Helper function to fetch class details by IDs
        const fetchClassDetails = async (ids) => {
            if (!ids || !Array.isArray(ids)) return [];
            // Filter out any non-integer or invalid IDs
            const validIds = ids.filter(id => Number.isInteger(id));
            if (validIds.length === 0) return [];

            const query = `
                SELECT id, class_number, class_name
                FROM classes
                WHERE id = ANY($1::int[])
            `;
            try {
                const { rows } = await pool.query(query, [validIds]);
                return rows;
            } catch (error) {
                console.error('❌ Error in fetchClassDetails:', error);
                return [];
            }
        };

        // Fetch prerequisites and corequisites details
        const prerequisites = await fetchClassDetails(classData.prerequisites);
        const corequisites = await fetchClassDetails(classData.corequisites);

        const response = {
            id: classData.id,
            class_number: classData.class_number,
            class_name: classData.class_name,
            semesters_offered: classData.semesters_offered,
            credits: classData.credits,
            prerequisites: prerequisites, // Array of objects
            corequisites: corequisites,   // Array of objects
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
 * @route   PUT /classes/:class_id
 * @desc    Update an existing class without course association
 * @access  Public
 */
router.put('/classes/:class_id', async (req, res) => {
    try {
        const { class_id } = req.params;
        const classIdNum = parseInt(class_id, 10);

        if (isNaN(classIdNum)) {
            return res.status(400).json({ error: 'class_id must be a valid integer.' });
        }

        const {
            class_number,
            class_name,
            semesters_offered = [],
            prerequisites = [],
            corequisites = [],
            credits = 0,
            is_elective = false,
            days_offered = [],
            times_offered = null
        } = req.body;

        // Validate that the class exists
        const classCheckQuery = `
            SELECT * FROM classes
            WHERE id = $1
        `;
        const { rows: classRows } = await pool.query(classCheckQuery, [classIdNum]);

        if (classRows.length === 0) {
            return res.status(404).json({ error: 'Class not found.' });
        }

        // Update the class
        const updateClassQuery = `
            UPDATE classes
            SET
                class_number = $1,
                class_name = $2,
                semesters_offered = $3,
                prerequisites = $4,
                corequisites = $5,
                credits = $6,
                is_elective = $7,
                days_offered = $8,
                times_offered = $9,
                updated_at = NOW()
            WHERE id = $10
            RETURNING id
        `;
        const updateClassValues = [
            class_number,
            class_name,
            semesters_offered,
            prerequisites,
            corequisites,
            credits,
            is_elective,
            days_offered,
            times_offered,
            classIdNum
        ];

        const { rows: updatedRows } = await pool.query(updateClassQuery, updateClassValues);

        if (updatedRows.length === 0) {
            return res.status(404).json({ error: 'Failed to update class.' });
        }

        res.json({ message: 'Class updated successfully!' });

    } catch (error) {
        console.error('❌ Error updating class:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   PUT /courses/:course_id/classes/:class_id
 * @desc    Update an existing class in the database using raw SQL
 * @access  Public
 */
router.put('/courses/:course_id/classes/:class_id', async (req, res) => {
    try {
        const courseId = parseInt(req.params.course_id, 10);
        const classId = parseInt(req.params.class_id, 10);

        if (isNaN(courseId) || isNaN(classId)) {
            return res.status(400).json({ error: 'course_id and class_id must be valid integers.' });
        }

        const {
            class_number,
            class_name,
            semesters_offered = [],
            prerequisites = [],
            corequisites = [],
            credits = 0,
            is_elective = false,
            days_offered = [],
            times_offered = null
        } = req.body;

        // Check if the association exists
        const checkAssociationQuery = `
            SELECT 1 FROM classes_in_course
            WHERE course_id = $1 AND class_id = $2
        `;
        const checkValues = [courseId, classId];
        const { rows: associationRows } = await pool.query(checkAssociationQuery, checkValues);
        if (associationRows.length === 0) {
            return res.status(404).json({ error: 'The class is not associated with this course.' });
        }

        // Update this class in the "classes" table
        const updateClassQuery = `
            UPDATE classes
            SET
                class_number = $1,
                class_name = $2,
                semesters_offered = $3,
                prerequisites = $4,
                corequisites = $5,
                credits = $6,
                is_elective = $7,
                days_offered = $8,
                times_offered = $9,
                updated_at = NOW()
            WHERE id = $10
            RETURNING id
        `;
        const updateClassValues = [
            class_number,
            class_name,
            semesters_offered,
            prerequisites,
            corequisites,
            credits,
            is_elective,
            days_offered,
            times_offered,
            classId
        ];

        // Perform the update
        const { rows } = await pool.query(updateClassQuery, updateClassValues);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No class found with the given ID.' });
        }

        res.json({ message: 'Class updated successfully!' });
    } catch (error) {
        console.error('Error updating class:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @route   POST /courses/:course_id/classes
 * @desc    Add a new or existing class to a specific course
 * @access  Public
 */
router.post('/courses/:course_id/classes', async (req, res) => {
    try {
        const courseId = parseInt(req.params.course_id, 10);
        if (isNaN(courseId)) {
            return res.status(400).json({ error: 'course_id must be an integer.' });
        }

        if (req.body.class_id) {
            // **Associating an Existing Class**
            const classId = parseInt(req.body.class_id, 10);
            if (isNaN(classId)) {
                return res.status(400).json({ error: 'class_id must be an integer.' });
            }

            // Check if the class exists
            const classCheckQuery = `
                SELECT * FROM classes
                WHERE id = $1
            `;
            const { rows: classRows } = await pool.query(classCheckQuery, [classId]);

            if (classRows.length === 0) {
                return res.status(404).json({ error: 'Class not found.' });
            }

            // Check if association already exists
            const assocCheckQuery = `
                SELECT * FROM classes_in_course
                WHERE course_id = $1 AND class_id = $2
            `;
            const { rows: assocRows } = await pool.query(assocCheckQuery, [courseId, classId]);

            if (assocRows.length > 0) {
                return res.status(400).json({ error: 'Class is already associated with this course.' });
            }

            // Insert association into classes_in_course
            const insertAssocQuery = `
                INSERT INTO classes_in_course (course_id, class_id)
                VALUES ($1, $2)
            `;
            await pool.query(insertAssocQuery, [courseId, classId]);

            res.json({ message: 'Class associated successfully with the course.' });
        } else {
            // **Creating and Associating a New Class**
            const { 
                class_number,
                class_name,
                semesters_offered = [],
                prerequisites = [],
                corequisites = [],
                credits = 0,
                is_elective = false,
                days_offered = [],
                times_offered = []
            } = req.body;

            // Basic validation
            if (!class_number || !class_name) {
                return res.status(400).json({ error: 'class_number and class_name are required for creating a new class.' });
            }

            // Insert a new row into "classes" using raw SQL
            const insertClassQuery = `
                INSERT INTO classes 
                    (class_number, class_name, semesters_offered, prerequisites, corequisites, credits, is_elective, days_offered, times_offered, created_at, updated_at)
                VALUES 
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                RETURNING id
            `;
            const insertClassValues = [
                class_number,
                class_name,
                semesters_offered,
                prerequisites,
                corequisites,
                credits,
                is_elective,
                days_offered,
                times_offered
            ];

            const { rows } = await pool.query(insertClassQuery, insertClassValues);
            const newClassId = rows[0].id;

            // Associate the new class with the course in "classes_in_course"
            const insertJunctionQuery = `
                INSERT INTO classes_in_course (course_id, class_id)
                VALUES ($1, $2)
            `;
            await pool.query(insertJunctionQuery, [courseId, newClassId]);

            res.json({ message: 'New class created and associated successfully!', newClassId });
        }
    } catch (error) {
        console.error('❌ Error in POST /courses/:course_id/classes:', error);
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
 * @route   POST /classes
 * @desc    Add a new class without associating it to a course
 * @access  Public
 */
router.post('/classes', async (req, res) => {
    try {
        const {
            class_number,
            class_name,
            semesters_offered = [],
            prerequisites = [],
            corequisites = [],
            credits = 0,
            is_elective = false,
            days_offered = [],
            times_offered = []
        } = req.body;

        // Basic validation
        if (!class_number || !class_name) {
            return res.status(400).json({ error: 'class_number and class_name are required.' });
        }

        // Insert a new row into "classes"
        const insertClassQuery = `
            INSERT INTO classes 
                (class_number, class_name, semesters_offered, prerequisites, corequisites, credits, is_elective, days_offered, times_offered, created_at, updated_at)
            VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING id
        `;
        const insertClassValues = [
            class_number,
            class_name,
            semesters_offered,
            prerequisites,
            corequisites,
            credits,
            is_elective,
            days_offered,
            times_offered
        ];

        const { rows } = await pool.query(insertClassQuery, insertClassValues);
        const newClassId = rows[0].id;

        res.json({ 
            message: 'Class added successfully!',
            newClassId 
        });
    } catch (error) {
        console.error('❌ Error adding a new class:', error);
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
                prerequisites,
                corequisites,
                credits,
                is_elective,
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