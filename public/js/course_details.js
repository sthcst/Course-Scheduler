window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('course_id');
    const courseInfoDiv = document.getElementById('course-info');
    const classesList = document.getElementById('classes-list');

    if (!courseId) {
        courseInfoDiv.innerHTML = '<p>No valid course found.</p>';
        return;
    }

    try {
        // Fetch course details along with associated classes
        const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch course details: ${response.statusText}`);
        }
        const data = await response.json();
        if (!data) {
            courseInfoDiv.innerHTML = '<p>No details available for this course.</p>';
            return;
        }

        // Display the course name and type
        courseInfoDiv.innerHTML = `
            <h2>${data.course_name} (ID: ${data.id})</h2>
            <p>Type: ${data.course_type || 'N/A'}</p>
        `;

        // Clear existing classes list
        classesList.innerHTML = '';

        // Check if there are classes associated with the course
        if (Array.isArray(data.classes) && data.classes.length > 0) {
            data.classes.forEach(cls => {
                const li = document.createElement('li');
                li.innerHTML = `
                    ${cls.class_number}: ${cls.class_name}
                    <button class="update-class-button" data-class-id="${cls.id}">Update</button>
                    <button class="delete-class-button" data-class-id="${cls.id}">Delete</button>
                `;
                classesList.appendChild(li);
            });
        } else {
            classesList.innerHTML = '<li>No classes available for this course.</li>';
        }

        // Add event listeners to all delete buttons
        const deleteButtons = document.querySelectorAll('.delete-class-button');
        deleteButtons.forEach(button => {
            button.addEventListener('click', async (event) => {
                const classId = event.target.getAttribute('data-class-id');
                const className = event.target.parentElement.textContent.split(':')[1].trim();

                const confirmDelete = confirm(`Are you sure you want to delete class "${className}"?`);

                if (confirmDelete) {
                    try {
                        const deleteResponse = await fetch(`/api/courses/${encodeURIComponent(courseId)}/classes/${encodeURIComponent(classId)}`, {
                            method: 'DELETE',
                        });

                        if (!deleteResponse.ok) {
                            let errorMessage = deleteResponse.statusText;
                            try {
                                const errorData = await deleteResponse.json();
                                errorMessage = errorData.error || errorMessage;
                            } catch (parseError) {
                                // Ignore JSON parse errors
                            }
                            throw new Error(`Failed to delete class: ${errorMessage}`);
                        }

                        const result = await deleteResponse.json();
                        alert(result.message);

                        // Refresh the classes list
                        location.reload();
                    } catch (error) {
                        console.error('Error deleting class:', error);
                        alert(`Error: ${error.message}`);
                    }
                }
            });
        });

        // Add event listeners to all update buttons
        const updateButtons = document.querySelectorAll('.update-class-button');
        updateButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                const classId = event.target.getAttribute('data-class-id');
                window.location.href = `edit_class.html?course_id=${encodeURIComponent(courseId)}&class_id=${encodeURIComponent(classId)}`;
            });
        });

    } catch (error) {
        console.error(error);
        courseInfoDiv.innerHTML = `<p>Error: ${error.message}</p>`;
    }

    // =======================
    // Add Existing Class Functionality
    // =======================

    const addExistingClassButton = document.getElementById('add-existing-class-button');
    const addNewClassButton = document.getElementById('add-new-class-button');
    const searchContainer = document.getElementById('search-container');
    const classSearchInput = document.getElementById('class-search-input');
    const searchResults = document.getElementById('search-results');

    addExistingClassButton.addEventListener('click', () => {
        searchContainer.style.display = searchContainer.style.display === 'none' ? 'block' : 'none';
        classSearchInput.value = '';
        searchResults.innerHTML = '';
        classSearchInput.focus();
    });

    addNewClassButton.addEventListener('click', () => {
        window.location.href = `add_new_class.html?course_id=${encodeURIComponent(courseId)}`;
    });

    // Implement Debouncing with increased delay
    let debounceTimeout;
    classSearchInput.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            performSearch();
        }, 500); // Increased to 500 milliseconds delay
    });

    async function performSearch() {
        const query = classSearchInput.value.trim().toLowerCase();
        searchResults.innerHTML = '';

        if (query === '') return;

        try {
            // Updated fetch URL with limit parameter
            const response = await fetch(`/api/classes/search?query=${encodeURIComponent(query)}&limit=10`);
            if (!response.ok) {
                let errorMessage = response.statusText;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorMessage;
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
                searchResults.innerHTML = '<li>No matching classes found.</li>';
                return;
            }

            // Limit to 10 results if not already handled by the backend
            const limitedClasses = classes.slice(0, 10);

            limitedClasses.forEach(cls => {
                const li = document.createElement('li');
                li.innerHTML = `
                    ${cls.class_number}: ${cls.class_name}
                    <button class="add-class-button" data-class-id="${cls.id}">Add</button>
                `;
                searchResults.appendChild(li);
            });

            // Add event listeners to all add buttons
            const addButtons = document.querySelectorAll('.add-class-button');
            addButtons.forEach(button => {
                button.addEventListener('click', async (event) => {
                    const classIdStr = event.target.getAttribute('data-class-id');
                    const classId = parseInt(classIdStr, 10); // Convert to integer

                    if (isNaN(classId)) {
                        alert('Invalid Class ID.');
                        return;
                    }

                    try {
                        const addResponse = await fetch(`/api/courses/${encodeURIComponent(courseId)}/classes`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ class_id: classId }), // Ensure class_id is an integer
                        });

                        if (!addResponse.ok) {
                            let errorMessage = addResponse.statusText;
                            try {
                                const errorData = await addResponse.json();
                                errorMessage = errorData.error || errorMessage;
                            } catch (parseError) {
                                // Ignore JSON parse errors
                            }
                            throw new Error(`Failed to add class: ${errorMessage}`);
                        }

                        const result = await addResponse.json();
                        alert(result.message);

                        // Refresh the classes list
                        location.reload();
                    } catch (error) {
                        console.error('Error adding class:', error);
                        alert(`Error: ${error.message}`);
                    }
                });
            });

        } catch (error) {
            console.error('Error during class search:', error);
            searchResults.innerHTML = `<li style="color: red;">${error.message}</li>`;
        }
    }
});