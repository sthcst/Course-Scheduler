document.addEventListener('DOMContentLoaded', () => {
    const addCourseButton = document.getElementById('addCourseButton');
    const courseNameInput = document.getElementById('courseName');
    const courseTypeSelect = document.getElementById('courseType');
    const addCourseForm = document.getElementById('add-course-form');

    addCourseButton.addEventListener('click', async () => {
        const courseName = courseNameInput.value.trim();
        const courseType = courseTypeSelect.value;

        // Basic validation
        if (!courseName) {
            alert('Please enter a course name.');
            return;
        }

        try {
            // Send POST request to create a new course
            const response = await fetch('/api/courses', { // Ensure this URL is correct
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    course_name: courseName,
                    course_type: courseType,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create course.');
            }

            const result = await response.json();
            console.log('Response from POST /api/courses:', result); // Debugging statement
            const newCourseId = result.course.id;

            if (!newCourseId) {
                throw new Error('New course ID is undefined.');
            }

            // Redirect to course_details.html with the new course ID
            window.location.href = `course_details.html?course_id=${encodeURIComponent(newCourseId)}`;
        } catch (error) {
            console.error('Error creating course:', error);
            alert(`Error: ${error.message}`);
        }
    });
});