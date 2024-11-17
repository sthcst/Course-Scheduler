document.getElementById("calculate-schedule").addEventListener("click", async () => {
    const major = document.getElementById("major").value;
    const minor1 = document.getElementById("minor1").value;
    const minor2 = document.getElementById("minor2").value;

    // Load the JSON data
    const majorData = await fetch(major).then(res => res.json());
    const minor1Data = await fetch(minor1).then(res => res.json());
    const minor2Data = await fetch(minor2).then(res => res.json());

    // Combine all course requirements
    const allRequirements = [
        ...majorData.requirements,
        ...minor1Data.requirements,
        ...minor2Data.requirements,
    ];

    const semesters = ["Fall", "Winter", "Spring"];
    const maxCredits = { Fall: 16, Winter: 16, Spring: 10 };

    let schedule = []; // Final schedule
    let completedCourses = new Set(); // Track completed courses
    let deferredCourses = []; // Courses deferred due to unmet prerequisites

    // Collect all available course numbers for prerequisite checking
    const availableCourses = new Set();
    allRequirements.forEach(requirement =>
        requirement.courses.forEach(course => availableCourses.add(course.course_number))
    );

    // Helper to check if prerequisites are met or not part of the program
    const prerequisitesMet = (course) =>
        course.prerequisites.every(prereq => completedCourses.has(prereq) || !availableCourses.has(prereq));

    for (let i = 0; i < 10; i++) {
        let currentSemester = { 
            name: `Semester ${i + 1} (${semesters[i % 3]})`, 
            credits: 0, 
            courses: [] 
        };

        // Attempt to schedule deferred courses first
        deferredCourses = deferredCourses.filter(course => {
            if (
                course.semesters_offered.includes(semesters[i % 3]) &&
                prerequisitesMet(course) &&
                currentSemester.credits + course.credit_hours <= maxCredits[semesters[i % 3]]
            ) {
                currentSemester.courses.push(course.name);
                currentSemester.credits += course.credit_hours;
                completedCourses.add(course.course_number);
                return false; // Remove from deferred
            }
            return true; // Keep in deferred
        });

        for (let requirement of allRequirements) {
            for (let course of requirement.courses) {
                if (
                    course.semesters_offered.includes(semesters[i % 3]) &&
                    prerequisitesMet(course) &&
                    !completedCourses.has(course.course_number) &&
                    currentSemester.credits + course.credit_hours <= maxCredits[semesters[i % 3]]
                ) {
                    currentSemester.courses.push(course.name);
                    currentSemester.credits += course.credit_hours;
                    completedCourses.add(course.course_number);
                } else if (!completedCourses.has(course.course_number)) {
                    deferredCourses.push(course); // Add to deferred if prerequisites are unmet
                }
            }
        }

        schedule.push(currentSemester);
    }

    // Display the schedule
    const scheduleDiv = document.getElementById("schedule");
    scheduleDiv.innerHTML = schedule.map((sem) => `
        <h3>${sem.name} - Total Credits: ${sem.credits}</h3>
        <ul>${sem.courses.map((c) => `<li>${c}</li>`).join('')}</ul>
    `).join('');
});
