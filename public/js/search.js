document.addEventListener('DOMContentLoaded', async () => {
    // Elements for stats box
    const statsInfo = document.getElementById('stats-info');

    // Elements for Search Courses box
    const courseDropdown = document.getElementById('courseDropdown');
    const viewCourseButton = document.getElementById('viewCourseButton');
    const addCourseButton = document.getElementById('addCourseButton');
    const resultsDiv = document.getElementById('results');

    // Elements for Search Classes box
    const classSearchInput = document.getElementById('classSearchInput');
    const classSearchResults = document.getElementById('classSearchResults');
    const addNewClassButton = document.getElementById('addNewClassButton');

    // Load statistics (Assuming an endpoint exists; otherwise, this is a placeholder)
    try {
        const response = await fetch('/api/stats');
        if (response.ok) {
            const stats = await response.json();
            statsInfo.textContent = `Majors: ${stats.majors}, Minors: ${stats.minors}, Classes: ${stats.classes}`;
        } else {
            statsInfo.textContent = 'Unable to load statistics.';
        }
    } catch (err) {
        console.error('Error fetching stats:', err);
        statsInfo.textContent = 'Error loading statistics.';
    }

    // Fetch courses for dropdown
    try {
        const response = await fetch('/api/courses');
        if (!response.ok) {
            throw new Error(`Error fetching courses: ${response.statusText}`);
        }
        const courses = await response.json();
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

    viewCourseButton.addEventListener('click', () => {
        const selectedCourseId = courseDropdown.value;
        if (!selectedCourseId) {
            resultsDiv.innerHTML = '<p style="color: red;">Please select a course to view.</p>';
            return;
        }
        window.location.href = `/course_details.html?course_id=${encodeURIComponent(selectedCourseId)}`;
    });

    addCourseButton.addEventListener('click', () => {
        window.location.href = '/add_course.html';
    });

    // Search Classes Functionality
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
            const response = await fetch(`/api/classes/search?query=${encodeURIComponent(query)}&limit=5`);
            if (!response.ok) {
                let errorMessage = response.statusText;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (parseError) { }
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

            const viewButtons = document.querySelectorAll('.view-class-button');
            viewButtons.forEach(button => {
                button.addEventListener('click', (event) => {
                    const classId = event.target.getAttribute('data-class-id');
                    if (!classId) {
                        alert('Invalid Class ID.');
                        return;
                    }
                    window.location.href = `/edit_class.html?class_id=${encodeURIComponent(classId)}`;
                });
            });

        } catch (error) {
            console.error('Error during class search:', error);
            classSearchResults.innerHTML = `<li style="color: red;">${error.message}</li>`;
        }
    }

    addNewClassButton.addEventListener('click', () => {
        window.location.href = '/add_new_class.html';
    });
});