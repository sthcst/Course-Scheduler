document.getElementById("calculate-schedule").addEventListener("click", async () => {
    try {
        const major = document.getElementById("major").value;
        const minor1 = document.getElementById("minor1").value;
        const minor2 = document.getElementById("minor2").value;

        // Fetch JSON data for the programs
        const fetchJson = async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        };

        const majorData = await fetchJson(major);
        const minor1Data = await fetchJson(minor1);
        const minor2Data = await fetchJson(minor2);

        // Combine all courses in sequential order
        let allCourses = [
            ...majorData.courses,
            ...minor1Data.courses,
            ...minor2Data.courses,
        ];

        console.log("All courses combined in order:", allCourses);

        const semesters = ["Fall", "Winter", "Spring"];
        const maxCredits = { Fall: 16, Winter: 16, Spring: 10 };

        let schedule = []; // Final schedule
        let semesterIndex = 0;

        // Process courses until all are scheduled
        while (allCourses.length > 0) {
            const semesterType = semesters[semesterIndex % 3];
            let currentSemester = {
                name: `Semester ${semesterIndex + 1} (${semesterType})`,
                credits: 0,
                courses: [],
            };

            // Iterate over courses in sequential order
            allCourses = allCourses.filter((course) => {
                if (
                    course.semesters_offered.includes(semesterType) &&
                    currentSemester.credits + course.credits <= maxCredits[semesterType]
                ) {
                    currentSemester.courses.push(`${course.course_number}: ${course.course_name}`);
                    currentSemester.credits += course.credits;
                    return false; // Remove scheduled course
                }
                return true; // Keep deferred courses
            });

            // Add the semester if it has courses
            if (currentSemester.courses.length > 0) {
                schedule.push(currentSemester);
            }

            semesterIndex++;
            if (semesterIndex > 100) {
                console.error("Exceeded maximum iterations. Check data integrity.");
                break;
            }
        }

        // Display the schedule
        const scheduleDiv = document.getElementById("schedule");
        scheduleDiv.innerHTML = schedule.map((sem) => `
            <h3>${sem.name} - Total Credits: ${sem.credits}</h3>
            <ul>${sem.courses.map((c) => `<li>${c}</li>`).join('')}</ul>
        `).join('');

    } catch (error) {
        console.error("Error during scheduling process:", error);
        document.getElementById("schedule").innerHTML = "<p>An error occurred while generating the schedule. Check the console for details.</p>";
    }
});
