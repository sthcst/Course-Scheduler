CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    course_number VARCHAR(20) UNIQUE NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    semesters_offered TEXT[] NOT NULL,
    credits INTEGER NOT NULL,
    prerequisites TEXT[] DEFAULT '{}'::TEXT[],
    type VARCHAR(50) NOT NULL
);
