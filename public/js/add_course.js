document.addEventListener('DOMContentLoaded', () => {
    const addCourseButton = document.getElementById('addCourseButton');
    const courseNameInput = document.getElementById('courseName');
    const courseTypeSelect = document.getElementById('courseType');
    const holokaiContainer = document.getElementById('holokaiContainer');
    const holokaiTypeSelect = document.getElementById('holokaiType');
    const addCourseForm = document.getElementById('add-course-form');

    // Show/hide holokai dropdown based on course type
    courseTypeSelect.addEventListener('change', () => {
        const courseType = courseTypeSelect.value;
        holokaiContainer.style.display = 
            (courseType === 'major' || courseType === 'minor') ? 'block' : 'none';
    });

    // Initial check to set correct display
    holokaiContainer.style.display = 
        (courseTypeSelect.value === 'major' || courseTypeSelect.value === 'minor') ? 'block' : 'none';

    addCourseButton.addEventListener('click', async () => {
        const courseName = courseNameInput.value.trim();
        const courseType = courseTypeSelect.value;
        const holokai = (courseType === 'major' || courseType === 'minor') ? 
            holokaiTypeSelect.value : null;

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
                    holokai: holokai
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