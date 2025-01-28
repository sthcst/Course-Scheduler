document.addEventListener('DOMContentLoaded', async () => {
    const courseDropdown = document.getElementById('courseDropdown');
    const viewCourseButton = document.getElementById('viewCourseButton');
    const addCourseButton = document.getElementById('addCourseButton');
    const resultsDiv = document.getElementById('results');
    addNewClassButton.addEventListener('click', () => {
        // Redirect to add_new_class.html without course_id
        window.location.href = 'add_new_class.html';
    });

    try {
        // Fetch all courses to populate the dropdown
        const response = await fetch('/api/courses');
        if (!response.ok) {
            throw new Error(`Error fetching courses: ${response.statusText}`);
        }
        const courses = await response.json();
        console.log("Fetched courses:", courses);

        // Populate the dropdown with courses
        courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = `${course.course_number}: ${course.course_name}`;
            courseDropdown.appendChild(option);
        });
    } catch (error) {
        console.error("Error fetching courses:", error);
        resultsDiv.innerHTML = `<p style="color: red;">An error occurred while loading courses: ${error.message}</p>`;
    }

    // Event listener for View Course button
    viewCourseButton.addEventListener('click', () => {
        const selectedCourseId = courseDropdown.value;
        if (!selectedCourseId) {
            resultsDiv.innerHTML = '<p style="color: red;">Please select a course to view.</p>';
            return;
        }
        // Redirect to course details page with selected course ID
        window.location.href = `course_details.html?course_id=${encodeURIComponent(selectedCourseId)}`;
    });

    // Event listener for Add New Course button
    addCourseButton.addEventListener('click', () => {
        // Redirect to add new course page
        window.location.href = 'add_course.html';
    });
});