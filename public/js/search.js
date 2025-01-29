document.addEventListener('DOMContentLoaded', async () => {
    const courseDropdown = document.getElementById('courseDropdown');
    const viewCourseButton = document.getElementById('viewCourseButton');
    const addCourseButton = document.getElementById('addCourseButton');
    const addNewClassButton = document.getElementById('addNewClassButton'); // Defined the button
    const resultsDiv = document.getElementById('results');

    // Ensure the button exists before adding event listener
    if (addNewClassButton) {
        addNewClassButton.addEventListener('click', () => {
            // Redirect to add_new_class.html using absolute path
            window.location.href = '/add_new_class.html';
        });
    } else {
        console.warn('addNewClassButton not found in the DOM.');
    }

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
            option.textContent = `${course.course_type}: ${course.course_name}`;
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
        // Redirect to course details page with selected course ID using absolute path
        window.location.href = `/course_details.html?course_id=${encodeURIComponent(selectedCourseId)}`;
    });

    // Event listener for Add New Course button
    addCourseButton.addEventListener('click', () => {
        // Redirect to add new course page using absolute path
        window.location.href = '/add_course.html';
    });

    // =======================
    // Class Search Functionality
    // =======================

    const classSearchInput = document.getElementById('classSearchInput');
    const classSearchResults = document.getElementById('classSearchResults');

    // Implement Debouncing with 300 milliseconds delay
    let classDebounceTimeout;
    classSearchInput.addEventListener('input', () => {
        clearTimeout(classDebounceTimeout);
        classDebounceTimeout = setTimeout(() => {
            performClassSearch();
        }, 300);
    });

    async function performClassSearch() {
        const query = classSearchInput.value.trim().toLowerCase();
        classSearchResults.innerHTML = '';

        if (query === '') return;

        try {
            // Fetch matching classes with a limit of 5 results
            const response = await fetch(`/api/classes/search?query=${encodeURIComponent(query)}&limit=5`);
            if (!response.ok) {
                let errorMessage = response.statusText;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (parseError) {
                    // Ignore JSON parse errors
                }
                throw new Error(`Error searching classes: ${errorMessage}`);
            }
            const data = await response.json();
            const classes = data.classes;

            if (!Array.isArray(classes)) {
                throw new Error('Invalid response format from server.');
            }

            if (classes.length === 0) {
                classSearchResults.innerHTML = '<li>No matching classes found.</li>';
                return;
            }

            classes.forEach(cls => {
                const li = document.createElement('li');
                li.innerHTML = `
                    ${cls.class_number}: ${cls.class_name}
                    <button class="view-class-button" data-class-id="${cls.id}">View Class</button>
                `;
                classSearchResults.appendChild(li);
            });

            // Add event listeners to all view buttons
            const viewButtons = document.querySelectorAll('.view-class-button');
            viewButtons.forEach(button => {
                button.addEventListener('click', (event) => {
                    const classId = event.target.getAttribute('data-class-id');
                    if (!classId) {
                        alert('Invalid Class ID.');
                        return;
                    }
                    // Redirect to edit_class.html with the class_id as a query parameter
                    window.location.href = `/edit_class.html?class_id=${encodeURIComponent(classId)}`;
                });
            });

        } catch (error) {
            console.error('Error during class search:', error);
            classSearchResults.innerHTML = `<li style="color: red;">${error.message}</li>`;
        }
    }
});