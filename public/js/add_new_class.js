document.addEventListener('DOMContentLoaded', async () => {
    const addClassForm = document.getElementById('add-class-form');
    const formMessage = document.getElementById('form-message');
    const backLink = document.getElementById('back-link');
    const formTitle = document.getElementById('form-title');
    const mainHeading = document.getElementById('main-heading');
    const submitButton = document.getElementById('submit-button');

    // Extract course_id from the URL (if any)
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('course_id');

    // Update the "Back" link based on the presence of course_id
    if (courseId) {
        backLink.href = `course_details.html?course_id=${encodeURIComponent(courseId)}`;
        formTitle.textContent = 'Add New Class to Course';
        mainHeading.textContent = 'Add a New Class to This Course';
        submitButton.textContent = 'Add Class to Course';
    } else {
        backLink.href = 'search.html'; // Redirect to search if no course_id
        formTitle.textContent = 'Add New Class';
        mainHeading.textContent = 'Add a New Class';
        submitButton.textContent = 'Add Class';
    }

    // Elements for Prerequisites Autocomplete
    const prerequisitesInput = document.getElementById('prerequisites');
    const prerequisitesSuggestions = document.getElementById('prerequisites-suggestions');

    // Elements for Corequisites Autocomplete
    const corequisitesInput = document.getElementById('corequisites');
    const corequisitesSuggestions = document.getElementById('corequisites-suggestions');

    // Selected Prerequisites and Corequisites
    let selectedPrerequisites = [];
    let selectedCorequisites = [];

    // Function to create suggestion items
    function createSuggestionItem(text, handler) {
        const div = document.createElement('div');
        div.textContent = text;
        div.classList.add('suggestion-item');
        div.addEventListener('click', handler);
        return div;
    }

    // Debounce function to limit API calls
    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // Fetch suggestions for Prerequisites
    const fetchPrereqSuggestions = debounce(async () => {
        const query = prerequisitesInput.value.trim();
        if (query.length === 0) {
            prerequisitesSuggestions.innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`/api/classes/search?query=${encodeURIComponent(query)}&limit=10`);
            if (!response.ok) {
                throw new Error('Failed to fetch prerequisites');
            }
            const data = await response.json();
            displaySuggestions(data.classes, prerequisitesSuggestions, (classItem) => {
                if (!selectedPrerequisites.includes(classItem.id)) { // Assuming classItem has 'id'
                    selectedPrerequisites.push(classItem.id);
                    addSelectedItem(prerequisitesInput, selectedPrerequisites, `${classItem.class_number}: ${classItem.class_name}`, 'prereq');
                }
                prerequisitesSuggestions.innerHTML = '';
                prerequisitesInput.value = '';
            });
        } catch (error) {
            console.error(error);
        }
    }, 300);

    // Fetch suggestions for Corequisites
    const fetchCoreqSuggestions = debounce(async () => {
        const query = corequisitesInput.value.trim();
        if (query.length === 0) {
            corequisitesSuggestions.innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`/api/classes/search?query=${encodeURIComponent(query)}&limit=10`);
            if (!response.ok) {
                throw new Error('Failed to fetch corequisites');
            }
            const data = await response.json();
            displaySuggestions(data.classes, corequisitesSuggestions, (classItem) => {
                if (!selectedCorequisites.includes(classItem.id)) { // Assuming classItem has 'id'
                    selectedCorequisites.push(classItem.id);
                    addSelectedItem(corequisitesInput, selectedCorequisites, `${classItem.class_number}: ${classItem.class_name}`, 'coreq');
                }
                corequisitesSuggestions.innerHTML = '';
                corequisitesInput.value = '';
            });
        } catch (error) {
            console.error(error);
        }
    }, 300);

    // Display suggestions in the suggestions container
    function displaySuggestions(classes, container, onSelect) {
        container.innerHTML = '';
        classes.forEach(cls => {
            const item = createSuggestionItem(`${cls.class_number}: ${cls.class_name}`, () => onSelect(cls));
            container.appendChild(item);
        });
    }

    // Add selected item as a tag
    function addSelectedItem(inputElement, selectedArray, value, type) {
        const tag = document.createElement('span');
        tag.classList.add('selected-item');
        tag.textContent = value;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = 'x';
        removeBtn.addEventListener('click', () => {
            const classIdToRemove = value.split(':')[0].trim();
            selectedArray = selectedArray.filter(id => id !== classIdToRemove);
            tag.remove();
        });

        tag.appendChild(removeBtn);
        inputElement.parentElement.insertBefore(tag, inputElement);
    }

    // Event listeners for Prerequisites
    prerequisitesInput.addEventListener('input', fetchPrereqSuggestions);
    document.addEventListener('click', (e) => {
        if (!prerequisitesSuggestions.contains(e.target) && e.target !== prerequisitesInput) {
            prerequisitesSuggestions.innerHTML = '';
        }
    });

    // Event listeners for Corequisites
    corequisitesInput.addEventListener('input', fetchCoreqSuggestions);
    document.addEventListener('click', (e) => {
        if (!corequisitesSuggestions.contains(e.target) && e.target !== corequisitesInput) {
            corequisitesSuggestions.innerHTML = '';
        }
    });

    addClassForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const classNumberInput = document.getElementById('class-number').value.trim();
        const className = document.getElementById('class-name').value.trim();
        const credits = parseInt(document.getElementById('credits').value, 10);

        // Get selected Semesters Offered
        const semestersOffered = Array.from(document.querySelectorAll('input[name="semesters_offered"]:checked'))
            .map(input => input.value);

        // Get selected Days Offered
        const daysOffered = Array.from(document.querySelectorAll('input[name="days_offered"]:checked'))
            .map(input => input.value);

        const timesOfferedInput = document.getElementById('times-offered').value.trim();
        const times_offered = timesOfferedInput ? timesOfferedInput.split(',').map(s => s.trim()) : [];

        // Basic validation
        if (!classNumberInput || !className || isNaN(credits) || credits < 1) {
            formMessage.textContent = 'Please provide valid inputs for required fields.';
            formMessage.style.color = 'red';
            return;
        }

        try {
            const payload = {
                class_number: classNumberInput,
                class_name: className,
                credits: credits,
                semesters_offered: semestersOffered,
                prerequisites: selectedPrerequisites,
                corequisites: selectedCorequisites,
                days_offered: daysOffered,
                times_offered: times_offered
            };

            let response, resultMessage;

            if (courseId) {
                // Associate class with a course
                response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/classes`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });
                resultMessage = 'Class added successfully to the course!';
            } else {
                // Add class independently
                response = await fetch(`/api/classes`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });
                resultMessage = 'Class added successfully!';
            }

            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error || response.statusText;
                throw new Error(errorMessage);
            }

            const result = await response.json();
            formMessage.textContent = result.message || resultMessage;
            formMessage.style.color = 'green';
            addClassForm.reset();
            // Clear selected prerequisites and corequisites
            clearSelectedItems('prereq');
            clearSelectedItems('coreq');

            // Redirect based on scenario
            setTimeout(() => {
                if (courseId) {
                    window.location.href = `course_details.html?course_id=${encodeURIComponent(courseId)}`;
                } else {
                    window.location.href = 'search.html';
                }
            }, 1500);

        } catch (error) {
            console.error('Error:', error);
            formMessage.textContent = `Error: ${error.message}`;
            formMessage.style.color = 'red';
        }
    });

    /**
     * Helper function to clear selected items for prerequisites or corequisites
     */
    function clearSelectedItems(type) {
        if (type === 'prereq') {
            selectedPrerequisites = [];
            const tags = document.querySelectorAll('#prerequisites + .selected-item');
            tags.forEach(tag => {
                tag.remove();
            });
        } else if (type === 'coreq') {
            selectedCorequisites = [];
            const tags = document.querySelectorAll('#corequisites + .selected-item');
            tags.forEach(tag => {
                tag.remove();
            });
        }
    }
});