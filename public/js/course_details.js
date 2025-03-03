window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('course_id');
    const courseInfoDiv = document.getElementById('course-info');
    const courseSectionsDiv = document.getElementById('course-sections');
    const addSectionButton = document.getElementById('add-section-button');
    const addSectionModal = document.getElementById('add-section-modal');
    const addSectionForm = document.getElementById('add-section-form');
    const sectionTypeSelect = document.getElementById('section-type');
    const electiveOptions = document.getElementById('elective-options');
    const deleteCourseButton = document.getElementById('delete-course-button');
    let searchTimeout;
    
    if (deleteCourseButton) {
        deleteCourseButton.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to delete this course?')) return;
            try {
                const response = await fetch(`/api/courses/${courseId}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to delete course');
                }
               
                window.location.href = 'search.html'; // Redirect to search after deletion
            } catch (error) {
                console.error('Error deleting course:', error);
                alert(`Error: ${error.message}`);
            }
        });
    }

    if (!courseId) {
        courseInfoDiv.innerHTML = '<p>No valid course found.</p>';
        return;
    }

    // Show/hide elective options based on section type
    sectionTypeSelect.addEventListener('change', () => {
        electiveOptions.style.display = 
            sectionTypeSelect.value === 'elective' ? 'block' : 'none';
    });

    // Handle section modal
    addSectionButton.addEventListener('click', () => {
        addSectionModal.style.display = 'block';
    });

    document.getElementById('cancel-section').addEventListener('click', () => {
        addSectionModal.style.display = 'none';
        addSectionForm.reset();
    });

    // Handle section form submission
    addSectionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const sectionData = {
            section_name: document.getElementById('section-name').value,
            is_required: sectionTypeSelect.value === 'required',
            classes_to_choose: sectionTypeSelect.value === 'elective' ? 
                parseInt(document.getElementById('classes-to-choose').value) : null
        };

        try {
            const response = await fetch(`/api/courses/${courseId}/sections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sectionData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create section');
            }
            
            addSectionModal.style.display = 'none';
            addSectionForm.reset();
            location.reload();
        } catch (error) {
            console.error('Error creating section:', error);
            alert(error.message);
        }
    });

    try {
        // Fetch course details with sections
        const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch course details: ${response.statusText}`);
        }
        const data = await response.json();
        if (!data) {
            courseInfoDiv.innerHTML = '<p>No details available for this course.</p>';
            return;
        }

        // Display course info
        displayCourse(data);

    } catch (error) {
        console.error(error);
        courseInfoDiv.innerHTML = `<p>Error: ${error.message}</p>`;
    }

    // First, inject the search modal HTML
    const searchModalHTML = `
        <div id="search-modal" class="modal">
            <div class="modal-content search-modal-content">
                <h2>Search Classes</h2>
                <input type="text" class="class-search-input" placeholder="Search by Class Number">
                <ul class="search-results"></ul>
                <div class="modal-buttons">
                    <button id="close-search-modal">Cancel</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', searchModalHTML);

    // Now that the modal exists in the DOM, set up the search functionality
    const searchModal = document.getElementById('search-modal');
    const searchInput = searchModal.querySelector('.class-search-input');
    const searchResults = searchModal.querySelector('.search-results');

    // Add input event listener to search input
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const sectionId = searchModal.dataset.sectionId;
        searchTimeout = setTimeout(() => performSearch(sectionId), 500);
    });

    // Add modal close handlers
    document.getElementById('close-search-modal').onclick = () => {
        searchModal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target === searchModal) {
            searchModal.style.display = 'none';
        }
    };

    function displayCourse(data) {
        // Display the course name and type
        courseInfoDiv.innerHTML = `
            <h2>${data.course_name} (ID: ${data.id})</h2>
            <p>Type: ${data.course_type || 'N/A'}</p>
        `;
    
        // Clear the sections div
        courseSectionsDiv.innerHTML = '';
        
        if (data.sections && Array.isArray(data.sections) && data.sections.length > 0) {
            data.sections.forEach(section => {
                if (section && section.id) {
                    const sectionDiv = document.createElement('div');
                    sectionDiv.className = 'course-section';
                    sectionDiv.innerHTML = `
                        <div class="section-header">
                            <div class="section-info-container">
                                <h3 class="section-title">${section.section_name}</h3>
                                <div class="section-info">
                                    ${section.is_required ? 'Required' : `Choose ${section.classes_to_choose} classes`}
                                </div>
                            </div>
                            <button class="delete-section-button" data-section="${section.id}">Delete Section</button>
                        </div>
                        <ul class="classes-list" id="section-${section.id}-classes"></ul>
                        <div class="section-footer">
                            <div class="section-controls">
                                <div class="custom-button add-existing-class-button" data-section="${section.id}">
                                    <img src="./assets/addexistingclassbutton.png" alt="Add existing">
                                    <span>Add Existing Class</span>
                                </div>
                                <div class="custom-button add-new-class-button" data-section="${section.id}">
                                    <img src="./assets/addnewclassbutton.png" alt="Add new">
                                    <span>Add New Class</span>
                                </div>
                            </div>
                        </div>
                    `;
                    courseSectionsDiv.appendChild(sectionDiv);
    
                    // Display classes for this section
                    const sectionClassesList = document.getElementById(`section-${section.id}-classes`);
                    if (section.classes && section.classes.length > 0) {
                        section.classes.forEach(cls => {
                            const li = document.createElement('li');
                            li.innerHTML = `
                                ${cls.class_number}: ${cls.class_name}
                                <div class="class-actions">
                                    <img class="update-class-button" 
                                        src="./assets/editclassbutton.png" 
                                        alt="Edit class"
                                        data-class-id="${cls.id}" 
                                        data-section-id="${section.id}">
                                    <img class="delete-class-button" 
                                        src="./assets/removebutton.png" 
                                        alt="Remove class"
                                        data-class-id="${cls.id}"
                                        data-section-id="${section.id}">
                                </div>
                            `;
                            sectionClassesList.appendChild(li);
                        });
                    } else {
                        sectionClassesList.innerHTML = '<li>No classes in this section</li>';
                    }
                }
            });
    
            // Add event listeners for the section-specific buttons
            attachSectionEventListeners();
        }
    
        // Show add section button (always visible)
        addSectionButton.style.display = 'block';
    }

    // Attach event listeners for section controls
    function attachSectionEventListeners() {
        // Add existing class buttons
        document.querySelectorAll('.add-existing-class-button').forEach(button => {
            button.addEventListener('click', (e) => {
                // Get the section ID from the button element itself, not the target
                const sectionId = button.dataset.section;
                showSearchContainer(sectionId);
            });
        });

        // Add new class buttons
        document.querySelectorAll('.add-new-class-button').forEach(button => {
            button.addEventListener('click', (e) => {
                // Get sectionId from the button's data attribute, not from e.target
                const sectionId = button.dataset.section;
                window.location.href = `add_new_class.html?course_id=${courseId}&section_id=${sectionId}`;
            });
        });

        // Update class buttons
        document.querySelectorAll('.update-class-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const classId = e.target.dataset.classId;
                const sectionId = e.target.dataset.sectionId;
                window.location.href = `edit_class.html?course_id=${courseId}&class_id=${classId}&section_id=${sectionId}`;
            });
        });

        // Delete class buttons
                document.querySelectorAll('.delete-class-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const classId = e.target.dataset.classId;
                const sectionId = e.target.dataset.sectionId;
                
                if (confirm('Are you sure you want to remove this class from the section?')) {
                    try {
                        // Update the URL to match the API endpoint
                        const response = await fetch(
                            `/api/courses/${courseId}/sections/${sectionId}/classes/${classId}`,
                            { method: 'DELETE' }
                        );
        
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Failed to remove class from section');
                        }
        
                        location.reload();
                    } catch (error) {
                        console.error('Error removing class from section:', error);
                        alert(error.message);
                    }
                }
            });
        });

        // Delete section buttons
        document.querySelectorAll('.delete-section-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const sectionId = e.target.dataset.section;
                
                if (confirm('Are you sure you want to delete this section? This will remove all class associations.')) {
                    try {
                        const response = await fetch(
                            `/api/courses/${courseId}/sections/${sectionId}`,
                            { method: 'DELETE' }
                        );

                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Failed to delete section');
                        }

                        location.reload();
                    } catch (error) {
                        console.error('Error deleting section:', error);
                        alert(error.message);
                    }
                }
            });
        });

        // Add search input listeners for each section
        document.querySelectorAll('.class-search-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const sectionId = e.target.closest('.section-controls')
                    .querySelector('.add-existing-class-button').dataset.section;
                
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => performSearch(sectionId), 500);
            });
        });
    }

    function showSearchContainer(sectionId) {
        const searchModal = document.getElementById('search-modal');
        const searchInput = searchModal.querySelector('.class-search-input');
        const searchResults = searchModal.querySelector('.search-results');
        
        // Store the section ID as a data attribute
        searchModal.dataset.sectionId = sectionId;
        
        // Clear previous results
        searchInput.value = '';
        searchResults.innerHTML = '';
        
        // Show the modal
        searchModal.style.display = 'block';
        searchInput.focus();
    }

    async function performSearch(sectionId) {
        const searchModal = document.getElementById('search-modal');
        const searchInput = searchModal.querySelector('.class-search-input');
        const searchResults = searchModal.querySelector('.search-results');
        const query = searchInput.value.trim();
        
        console.log('Performing search with query:', query); // Debug log
        
        if (!query) {
            searchResults.innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`/api/classes/search?query=${encodeURIComponent(query)}`);
            console.log('Search response:', response); // Debug log
            
            if (!response.ok) throw new Error('Search failed');

            const data = await response.json();
            console.log('Search results:', data); // Debug log
            
            displaySearchResults(data.classes, sectionId, searchResults);
        } catch (error) {
            console.error('Search error:', error);
            searchResults.innerHTML = '<li class="error">Search failed. Please try again.</li>';
        }
    }

    function displaySearchResults(classes, sectionId, searchResults) {
        console.log('Adding class with:', {
            courseId: courseId,
            sectionId: sectionId,
            classes: classes
        });

        searchResults.innerHTML = '';
        if (!classes.length) {
            searchResults.innerHTML = '<li>No classes found</li>';
            return;
        }

        classes.forEach(cls => {
            const li = document.createElement('li');
            li.innerHTML = `
                ${cls.class_number}: ${cls.class_name}
                <button class="add-class-button" 
                    data-class-id="${cls.id}" 
                    data-section-id="${sectionId}">Add</button>
            `;
            searchResults.appendChild(li);
        });

        // Update the event listeners for add buttons
        searchResults.querySelectorAll('.add-class-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const classId = button.dataset.classId;
                const sectionId = button.dataset.sectionId;
                
                console.log('Adding class:', {
                    courseId: courseId,
                    sectionId: sectionId,
                    classId: classId
                });

                try {
                    const response = await fetch(
                        `/api/courses/${courseId}/sections/${sectionId}/classes`, 
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ class_id: classId })
                        }
                    );

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to add class');
                    }

                    location.reload();
                } catch (error) {
                    console.error('Error adding class:', error);
                    alert(error.message);
                }
            });
        });
    }
});