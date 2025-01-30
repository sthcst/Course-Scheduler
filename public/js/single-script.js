document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch all programs from the API
        const response = await fetch('/api/courses');
        if (!response.ok) {
            throw new Error(`Error fetching programs: ${response.statusText}`);
        }
        const programs = await response.json();

        const programSelect = document.getElementById("program-select");

        // Populate the program select dropdown
        programs.forEach(program => {
            const option = document.createElement('option');
            option.value = program.id; // Use the unique ID as the value
            option.textContent = program.course_name;
            programSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading programs:", error);
        const programSelect = document.getElementById("program-select");
        programSelect.innerHTML = `<option value="" disabled selected>Error loading programs</option>`;
    }

    // Handle button click instead of form submission
    const generateButton = document.getElementById('calculate-single-schedule');
    if (generateButton) {
        generateButton.addEventListener('click', async (event) => {
            event.preventDefault(); // Prevent any default button behavior

            const selectedProgramId = document.getElementById('program-select').value;

            if (!selectedProgramId) {
                displayMessage('Please select a program.', 'error');
                return;
            }

            try {
                // Fetch details of the selected program
                const response = await fetch(`/api/courses/${selectedProgramId}`);
                if (!response.ok) {
                    throw new Error(`Error fetching program details: ${response.statusText}`);
                }
                const programDetails = await response.json();

                // Data Cleaning: Handle 'None' in prerequisites and corequisites
                programDetails.classes.forEach(cls => {
                    // Replace 'None' with empty array in prerequisites
                    if (Array.isArray(cls.prerequisites)) {
                        if (cls.prerequisites.includes("None")) {
                            cls.prerequisites = [];
                        }
                    } else {
                        cls.prerequisites = [];
                    }

                    // Replace 'None' with empty array in corequisites
                    if (Array.isArray(cls.corequisites)) {
                        if (cls.corequisites.includes("None")) {
                            cls.corequisites = [];
                        }
                    } else {
                        cls.corequisites = [];
                    }
                });

                // Filter out classes with null class_name or class_number
                programDetails.classes = programDetails.classes.filter(cls => cls.class_name && cls.class_number);

                // Proceed with scheduling
                await generateSchedule(programDetails);
                displayMessage('Program selected successfully!', 'success');

            } catch (error) {
                console.error("Error fetching program details:", error);
                displayMessage(`Error: ${error.message}`, 'error');
            }
        });
    }

    /**
 * Generates the schedule based on the selected program details.
 * @param {Object} programDetails - The details of the selected program.
 */
    async function generateSchedule(programDetails) {
        try {
            console.log("Starting schedule generation...");
            document.getElementById('schedule-container').classList.add('hidden');

            // Retrieve user selections
            const includeAll = document.getElementById("include-all-extras").checked;
            const eilLevel = document.getElementById("eil-level").value;

            const startSemesterInput = document.getElementById("start-semester").value;
            const majorClassLimit = parseInt(document.getElementById("major-class-limit").value, 10);
            const fallWinterCredits = parseInt(document.getElementById("fall-winter-credits").value, 10);
            const springCredits = parseInt(document.getElementById("spring-credits").value, 10);

            console.log("Program Details:", programDetails);
            console.log("Include All Extras:", includeAll);
            console.log("EIL Level:", eilLevel);
            console.log("Start Semester:", startSemesterInput);
            console.log("Major Class Limit:", majorClassLimit);
            console.log("Fall/Winter Credits:", fallWinterCredits);
            console.log("Spring Credits:", springCredits);

            // Initialize Scheduling Parameters
            const maxCreditsPerSemester = {
                Fall: fallWinterCredits,
                Winter: fallWinterCredits,
                Spring: springCredits
            };

            const semesters = ["Fall", "Winter", "Spring"];
            let currentSemesterIndex = 0;
            let currentYear = parseInt(startSemesterInput.split(" ")[1], 10) || 2024;
            let schedule = [];
            let totalCredits = 0;
            let electiveCreditsNeeded = 120; // Assuming 120 total credits required for graduation

            // Clone and prepare classes
            let allCourses = programDetails.classes.map(cls => ({
                ...cls,
                scheduled: false,
                prerequisites: cls.prerequisites || [],
                corequisites: cls.corequisites || []
            }));

            // Helper function to check if prerequisites are met
            const prerequisitesMet = (course) => {
                return course.prerequisites.every(prereq => {
                    return schedule.some(sem => 
                        sem.courses.some(c => c.class_number === prereq && c.scheduledYear <= currentYear)
                    );
                });
            };

            // Schedule Generation Logic
            while (allCourses.some(course => !course.scheduled)) {
                const semesterType = semesters[currentSemesterIndex % semesters.length];
                const semesterYear = currentYear + Math.floor(currentSemesterIndex / semesters.length);
                let semesterCredits = 0;
                let semesterCourses = [];

                console.log(`Scheduling for ${semesterType} ${semesterYear}`);

                for (let course of allCourses) {
                    if (
                        !course.scheduled &&
                        course.semesters_offered.includes(semesterType) &&
                        prerequisitesMet(course) &&
                        semesterCredits + 3 <= maxCreditsPerSemester[semesterType] // Assuming each course is 3 credits
                    ) {
                        semesterCourses.push({
                            ...course,
                            scheduledYear: semesterYear,
                            scheduledSemester: semesterType
                        });
                        semesterCredits += 3;
                        course.scheduled = true;
                        electiveCreditsNeeded -= 3;
                        totalCredits += 3;
                    }
                }

                if (semesterCourses.length === 0) {
                    console.warn(`No courses scheduled for ${semesterType} ${semesterYear}. Advancing to next semester.`);
                }

                schedule.push({
                    name: `Semester ${schedule.length + 1} (${semesterType} ${semesterYear})`,
                    semester: semesterType,
                    year: semesterYear,
                    credits: semesterCredits,
                    courses: semesterCourses
                });

                currentSemesterIndex++;
            }

            console.log("Schedule generated:", schedule);
            console.log("Total Credits:", totalCredits);
            console.log("Elective Credits Needed:", electiveCreditsNeeded);

            // Determine Graduation Date
            const lastSemester = schedule[schedule.length - 1];
            const graduationDate = `${lastSemester.semester} ${lastSemester.year}`;

            // Update the DOM with Summaries
            document.getElementById('total-credits').innerText = totalCredits;
            document.getElementById('graduation-date').innerText = graduationDate;
            document.getElementById('electives-needed').innerText = electiveCreditsNeeded;
            document.getElementById('schedule-container').classList.remove('hidden');

            // Render the Schedule
            const scheduleDiv = document.getElementById("schedule");
            scheduleDiv.innerHTML = schedule.map(sem => `
                <div class="semester animated-box">
                    <h3>${sem.name} - Total Credits: ${sem.credits}</h3>
                    <ul>
                        ${sem.courses.map(c => `<li class="${getTypeColorClass([c.course_type])}">${c.class_number}: ${c.class_name}</li>`).join('')}
                    </ul>
                </div>
            `).join('');

            console.log("Schedule rendered on the page.");

        } catch (error) {
            console.error("Error during schedule generation:", error);
            displayMessage(`An error occurred: ${error.message}`, 'error');
            document.getElementById('schedule-container').classList.add('hidden');
            document.getElementById("schedule").innerHTML = `<p>An error occurred: ${error.message}</p>`;
        }
    }
    // Utility function to display messages to the user
    function displayMessage(message, type) {
        const messageDiv = document.getElementById('form-message');
        if (messageDiv) {
            messageDiv.textContent = message;
            messageDiv.className = type; // You can style messages based on type (e.g., 'success', 'error')
        }
    }

    // Color class logic
    function getTypeColorClass(types) {
        const priority = { Holokai: 1, EIL: 2, Major: 3, Core: 4, Religion: 5 };
        let chosenType = null;
        let chosenPriority = Infinity;
        for (const t of types) {
            const p = priority[t] || 6;
            if (p < chosenPriority) {
                chosenPriority = p;
                chosenType = t;
            }
        }
        if (chosenType === "minor1" || chosenType === "minor2") chosenType = "minor";
        return `type-${chosenType}`;
    }

    // Enable/Disable EIL Level Dropdown based on 'Include All Extras' Checkbox
    const includeAllExtrasCheckbox = document.getElementById("include-all-extras");
    const eilLevelSelect = document.getElementById("eil-level");

    includeAllExtrasCheckbox.addEventListener('change', () => {
        if (includeAllExtrasCheckbox.checked) {
            eilLevelSelect.disabled = false;
        } else {
            eilLevelSelect.disabled = true;
        }
    });
});