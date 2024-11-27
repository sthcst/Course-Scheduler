document.getElementById("calculate-schedule").addEventListener("click", async () => {
    try {
        // ... (your existing code to fetch data and initialize variables)

        const semesterOrder = ["Fall", "Winter", "Spring"];
        let startYear = parseInt(startSemester.split(" ")[1]);
        let currentSemesterIndex = semesterOrder.indexOf(startSemester.split(" ")[0]);
        const maxCredits = { Fall: fallWinterCredits, Winter: fallWinterCredits, Spring: springCredits };

        let schedule = []; // Final schedule
        let completedCourses = new Set();

        while (allCourses.some(course => !course.scheduled)) {
            const semesterType = semesterOrder[currentSemesterIndex % 3];
            const currentYear = startYear + Math.floor(currentSemesterIndex / 3);
            const semesterLabel = `${semesterType} ${currentYear}`;
            const currentSemester = {
                name: `Semester ${schedule.length + 1} (${semesterLabel})`,
                credits: 0,
                courses: [],
                majorCount: 0,
                relCount: 0,
            };

            // Schedule REL classes first
            const relCourse = allCourses.find(course =>
                course.type === "religion" &&
                !course.scheduled &&
                course.semesters_offered.includes(semesterType)
            );

            if (relCourse && currentSemester.relCount < 1 && currentSemester.credits + relCourse.credits <= maxCredits[semesterType]) {
                currentSemester.courses.push(`${relCourse.course_number}: ${relCourse.course_name}`);
                currentSemester.credits += relCourse.credits;
                relCourse.scheduled = true;
                // Do not add to completedCourses yet
                currentSemester.relCount++;
            }

            // Schedule other courses
            for (const course of allCourses) {
                if (course.scheduled || course.type === "religion") continue;

                const prereqsMet = course.prerequisites.every(prereq =>
                    completedCourses.has(prereq)
                );

                const isMajorLimitExceeded =
                    course.type === "major" &&
                    currentSemester.majorCount >= majorClassLimit;

                if (
                    prereqsMet &&
                    course.semesters_offered.includes(semesterType) &&
                    currentSemester.credits + course.credits <= maxCredits[semesterType] &&
                    !isMajorLimitExceeded
                ) {
                    currentSemester.courses.push(`${course.course_number}: ${course.course_name}`);
                    currentSemester.credits += course.credits;
                    course.scheduled = true;

                    if (course.type === "major") currentSemester.majorCount++;
                }

                if (currentSemester.credits >= maxCredits[semesterType]) break;
            }

            // Add the semester if it has courses
            if (currentSemester.courses.length > 0) {
                schedule.push(currentSemester);

                // At the end of the semester, add scheduled courses to completedCourses
                for (const course of allCourses) {
                    if (course.scheduled && !completedCourses.has(course.course_number)) {
                        completedCourses.add(course.course_number);
                    }
                }
            } else {
                // No courses could be scheduled; possible issue with prerequisites or course availability
                console.error(`No courses could be scheduled in ${semesterLabel}.`);
                break;
            }

            currentSemesterIndex++;
            if (schedule.length > 100) {
                console.error("Exceeded maximum semesters. Check prerequisites or course data.");
                break;
            }
        }

        // ... (your existing code to display the schedule)

    } catch (error) {
        console.error("Error during scheduling process:", error);
        document.getElementById("schedule").innerHTML = "<p>An error occurred while generating the schedule. Check the console for details.</p>";
    }
});
