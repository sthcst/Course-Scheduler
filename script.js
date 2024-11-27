document.getElementById("calculate-schedule").addEventListener("click", async () => {
    try {
        const major = document.getElementById("major").value;
        const minor1 = document.getElementById("minor1").value;
        const minor2 = document.getElementById("minor2").value;
        const startSemester = document.getElementById("start-semester").value;
        const majorClassLimit = parseInt(document.getElementById("major-class-limit").value);
        const fallWinterCredits = parseInt(document.getElementById("fall-winter-credits").value);
        const springCredits = parseInt(document.getElementById("spring-credits").value);

        // Fetch JSON data for the programs
        const fetchJson = async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        };

        const majorData = await fetchJson(major);
        const minor1Data = await fetchJson(minor1);
        const minor2Data = await fetchJson(minor2);
        const religionData = await fetchJson("religion/religion.json");
        const coreData = await fetchJson("core/core.json"); // Fetch core courses

        // Add core courses to allCourses
        const allCourses = [
            ...religionData.courses.map(course => ({ ...course, type: "religion" })),
            ...majorData.courses.map(course => ({ ...course, type: "major" })),
            ...minor1Data.courses.map(course => ({ ...course, type: "minor1" })),
            ...minor2Data.courses.map(course => ({ ...course, type: "minor2" })),
            ...coreData.courses.map(course => ({ ...course, type: "core" })), // Core courses
        ];

        // Shuffle the courses to randomize the order
        const shuffleArray = (array) => {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
        };
        shuffleArray(allCourses);

        // Calculate the number of times each course is a prerequisite
        const prereqCounts = {};
        for (const course of allCourses) {
            for (const prereq of course.prerequisites) {
                prereqCounts[prereq] = (prereqCounts[prereq] || 0) + 1;
            }
        }

        // Sort courses based on their type and how many times they are prerequisites
        allCourses.sort((a, b) => {
            // Core courses have the lowest priority
            if (a.type === "core" && b.type !== "core") return 1;
            if (a.type !== "core" && b.type === "core") return -1;

            // Prioritize courses that are prerequisites for many others
            const aCount = prereqCounts[a.course_number] || 0;
            const bCount = prereqCounts[b.course_number] || 0;
            return bCount - aCount;
        });

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

            let coursesScheduledThisSemester = false;

            // Schedule non-core courses first
            while (currentSemester.credits < maxCredits[semesterType]) {
                let courseScheduledInThisIteration = false;

                for (const course of allCourses) {
                    if (course.scheduled || course.type === "core") continue;

                    const prereqsMet = course.prerequisites.every(prereq =>
                        completedCourses.has(prereq)
                    );

                    const isMajorLimitExceeded =
                        course.type === "major" &&
                        currentSemester.majorCount >= majorClassLimit;

                    const isRelLimitExceeded =
                        course.type === "religion" &&
                        currentSemester.relCount >= 1;

                    if (
                        prereqsMet &&
                        course.semesters_offered.includes(semesterType) &&
                        currentSemester.credits + course.credits <= maxCredits[semesterType] &&
                        !isMajorLimitExceeded &&
                        !isRelLimitExceeded
                    ) {
                        currentSemester.courses.push(`${course.course_number}: ${course.course_name}`);
                        currentSemester.credits += course.credits;
                        course.scheduled = true;
                        coursesScheduledThisSemester = true;
                        courseScheduledInThisIteration = true;

                        if (course.type === "major") currentSemester.majorCount++;
                        if (course.type === "religion") currentSemester.relCount++;
                    }

                    if (currentSemester.credits >= maxCredits[semesterType]) break;
                }

                // If no non-core courses were scheduled in this iteration, break to schedule core courses
                if (!courseScheduledInThisIteration) break;
            }

            // Schedule core courses if there is still room
            if (currentSemester.credits < maxCredits[semesterType]) {
                let coreCourseScheduled = false;

                for (const course of allCourses) {
                    if (course.scheduled || course.type !== "core") continue;

                    const prereqsMet = course.prerequisites.every(prereq =>
                        completedCourses.has(prereq)
                    );

                    if (
                        prereqsMet &&
                        course.semesters_offered.includes(semesterType) &&
                        currentSemester.credits + course.credits <= maxCredits[semesterType]
                    ) {
                        currentSemester.courses.push(`${course.course_number}: ${course.course_name}`);
                        currentSemester.credits += course.credits;
                        course.scheduled = true;
                        coursesScheduledThisSemester = true;
                        coreCourseScheduled = true;
                    }

                    if (currentSemester.credits >= maxCredits[semesterType]) break;
                }
            }

            if (coursesScheduledThisSemester) {
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

        // Display the schedule
        const scheduleDiv = document.getElementById("schedule");
        scheduleDiv.innerHTML = schedule.map(sem => `
            <div class="semester">
                <h3>${sem.name} - Total Credits: ${sem.credits}</h3>
                <ul>
                    ${sem.courses.map(c => `<li>${c}</li>`).join('')}
                </ul>
            </div>
        `).join('');

    } catch (error) {
        console.error("Error during scheduling process:", error);
        document.getElementById("schedule").innerHTML = "<p>An error occurred while generating the schedule. Check the console for details.</p>";
    }
});
