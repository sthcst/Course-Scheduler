// Event listener for toggling EIL level dropdown
document.getElementById('include-all-extras').addEventListener('change', () => {
    const includeAll = document.getElementById('include-all-extras').checked;
    const eilDropdown = document.getElementById('eil-level');
    eilDropdown.disabled = !includeAll; // If not included, EIL level is disabled
});

// Event listener for generating the schedule
document.getElementById("calculate-single-schedule").addEventListener("click", async () => {
    try {
        document.getElementById('schedule-container').classList.add('hidden');

        const programSelect = document.getElementById("program-select");
        const selectedOption = programSelect.options[programSelect.selectedIndex];
        const programCode = selectedOption.getAttribute("course_name") || "";
        let programType = selectedOption.getAttribute("course_type") || "major";
        programType = programType.toLowerCase();

        const includeAll = document.getElementById("include-all-extras").checked;
        const eilLevel = document.getElementById("eil-level").value;

        const startSemester = document.getElementById("start-semester").value;
        const majorClassLimit = parseInt(document.getElementById("major-class-limit").value);
        const fallWinterCredits = parseInt(document.getElementById("fall-winter-credits").value);
        const springCredits = parseInt(document.getElementById("spring-credits").value);

        if (!programCode) {
            throw new Error("Please select a program.");
        }

        // Function to fetch courses
        const fetchCourses = async (queryParams = '') => {
            const response = await fetch(`/api/courses${queryParams}`);
            if (!response.ok) {
                throw new Error(`Error fetching courses: ${response.statusText}`);
            }
            const data = await response.json();
            console.log("fetchCourses() ->", queryParams, ":\n", data);
            return data;
        };

        // Extract classes from fetched courses
        const extractClasses = (courses, additionalTypes = []) => {
            const classes = [];
            courses.forEach(course => {
                if (course.classes && Array.isArray(course.classes)) {
                    course.classes.forEach(cls => {
                        cls.course_number = cls.class_number;
                        cls.course_name = cls.class_name;
                        cls.type = [...(cls.type || []), ...additionalTypes];
                        classes.push(cls);
                    });
                }
            });
            return classes;
        };

        // Fetch the chosen program
        const programCourses = await fetchCourses(`?course_name=${encodeURIComponent(programCode)}&course_type=${encodeURIComponent(programType)}`);
        let combinedCourses = extractClasses(programCourses, [programType]);

        if (includeAll) {
            const holokaiCourses = await fetchCourses('?course_name=holokai&course_type=holokai');
            console.log("Fetched Holokai Courses:", holokaiCourses);
            combinedCourses.push(...extractClasses(holokaiCourses, ["holokai"]));

            const religionCourses = await fetchCourses('?course_name=religion&course_type=religion');
            console.log("Fetched Religion Courses:", religionCourses);
            combinedCourses.push(...extractClasses(religionCourses, ["religion"]));

            const coreCourses = await fetchCourses('?course_name=core&course_type=core');
            console.log("Fetched Core Courses:", coreCourses);
            combinedCourses.push(...extractClasses(coreCourses, ["core"]));

            if (eilLevel === "academic-english-1" || eilLevel === "academic-english-2") {
                const eilCourses = await fetchCourses('?course_name=eil&course_type=eil');
                console.log("Fetched EIL Courses:", eilCourses);
                combinedCourses.push(...extractClasses(eilCourses, ["eil"]));
            }
        }

        // Deduplicate by course_number
        const courseMap = {};
        for (const course of combinedCourses) {
            if (courseMap[course.course_number]) {
                courseMap[course.course_number].type = [...new Set([...courseMap[course.course_number].type, ...course.type])];
            } else {
                courseMap[course.course_number] = { ...course };
            }
        }
        const allCourses = Object.values(courseMap);

        // ============================
        // Step 1: Build Mapping Dictionaries
        // ============================

        // Build a map from class_id to course_number
        const idToCourseNumber = {};

        allCourses.forEach(course => {
            // Assuming each course has a unique 'id' and 'course_number'
            if (course.id && course.course_number) {
                idToCourseNumber[course.id.toString()] = course.course_number;
            }
        });

        /**
         * Resolves a prerequisite or corequisite identifier (class_id) to its course_number.
         * @param {string} classId - The class_id as a string.
         * @returns {string|null} - Corresponding course_number or null if not found.
         */
        function resolveToCourseNumber(classId) {
            if (!classId) return null;
            return idToCourseNumber[classId] || null; // Returns null if classId not found
        }

        // ============================
        // Step 2: Process Prerequisites
        // ============================

        // Count prerequisites
        const prereqCounts = {};
        for (const course of allCourses) {
            if (course.prerequisites && Array.isArray(course.prerequisites)) {
                for (const prereq of course.prerequisites) {
                    const resolvedPrereq = resolveToCourseNumber(prereq);
                    if (resolvedPrereq) {
                        prereqCounts[resolvedPrereq] = (prereqCounts[resolvedPrereq] || 0) + 1;
                    }
                }
            }
        }

        // ============================
        // Step 3: Sort Courses by Priority
        // ============================

        // Sort courses by priority
        allCourses.sort((a, b) => {
            // Senior courses last
            if (a.isSeniorCourse && !b.isSeniorCourse) return 1;
            if (!a.isSeniorCourse && b.isSeniorCourse) return -1;

            // Prerequisite count
            const aCount = prereqCounts[a.course_number] || 0;
            const bCount = prereqCounts[b.course_number] || 0;
            if (bCount !== aCount) {
                return bCount - aCount;
            }

            // Priority by type
            const typePriority = { holokai: 1, eil: 2, major: 3, minor1: 4, minor2: 4, core: 5, religion: 6 };
            const aType = Math.min(...(a.type || []).map(t => typePriority[t] || 8));
            const bType = Math.min(...(b.type || []).map(t => typePriority[t] || 8));
            if (aType !== bType) {
                return aType - bType;
            }

            // Earliest semester
            const semesterOrder = { "Fall": 1, "Winter": 2, "Spring": 3 };
            const aEarliest = Math.min(...(a.semesters_offered || []).map(s => semesterOrder[s] || 4));
            const bEarliest = Math.min(...(b.semesters_offered || []).map(s => semesterOrder[s] || 4));
            return aEarliest - bEarliest;
        });

        // ============================
        // Step 4: Scheduling Logic
        // ============================

        // Scheduling logic
        const semesterOrder = ["Fall", "Winter", "Spring"];
        let startYear = parseInt(startSemester.split(" ")[1]);
        let currentSemesterIndex = semesterOrder.indexOf(startSemester.split(" ")[0]);
        const maxCredits = { Fall: fallWinterCredits, Winter: fallWinterCredits, Spring: springCredits };

        let schedule = [];
        let completedCourses = new Set();

        const eilCoursesList = allCourses.filter(course => course.type.includes("eil"));
        let eilSemestersUsed = 0;

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
                eilCount: 0,
            };

            let coursesScheduledThisSemester = false;

            // Holokai in first semester
            if (includeAll && schedule.length === 0) {
                const holokaiCourse = allCourses.find(course => course.type.includes("holokai") && !course.scheduled);
                if (holokaiCourse) {
                    currentSemester.courses.push(holokaiCourse);
                    currentSemester.credits += holokaiCourse.credits || 3;
                    holokaiCourse.scheduled = true;
                    coursesScheduledThisSemester = true;
                }
            }

            // Religion (1 per semester)
            if (includeAll) {
                const availableRelCourses = allCourses.filter(course =>
                    course.type.includes("religion") &&
                    !course.scheduled &&
                    course.semesters_offered.includes(semesterType)
                );
                if (currentSemester.relCount < 1 && availableRelCourses.length > 0) {
                    const relCourse = availableRelCourses[0];
                    currentSemester.courses.push(relCourse);
                    currentSemester.credits += relCourse.credits || 3;
                    relCourse.scheduled = true;
                    currentSemester.relCount++;
                    coursesScheduledThisSemester = true;
                }
            }

            // EIL if not fluent
            if (includeAll && eilLevel !== "fluent" && eilSemestersUsed < 4 && eilCoursesList.length > 0) {
                for (const course of eilCoursesList) {
                    if (
                        !course.scheduled &&
                        course.semesters_offered.includes(semesterType) &&
                        currentSemester.credits + (course.credits || 3) <= maxCredits[semesterType]
                    ) {
                        currentSemester.courses.push(course);
                        currentSemester.credits += course.credits || 3;
                        course.scheduled = true;
                        currentSemester.eilCount++;
                        coursesScheduledThisSemester = true;
                    }
                }
                eilSemestersUsed++;
            }

            // Non-senior program or core
            for (const course of allCourses) {
                if (
                    course.scheduled ||
                    course.isSeniorCourse ||
                    course.type.includes("religion") ||
                    course.type.includes("eil") ||
                    course.type.includes("holokai") ||
                    (course.type.includes("core") && !includeAll)
                ) {
                    continue;
                }

                // Resolve and check prerequisites
                let prereqsMet = true;
                if (Array.isArray(course.prerequisites)) {
                    prereqsMet = course.prerequisites.every(prereq => {
                        const resolvedPrereq = resolveToCourseNumber(prereq);
                        return resolvedPrereq ? completedCourses.has(resolvedPrereq) : false;
                    });
                }

                const isMajorLimitExceeded = course.type.includes("major") && currentSemester.majorCount >= majorClassLimit;

                if (
                    prereqsMet &&
                    course.semesters_offered.includes(semesterType) &&
                    currentSemester.credits + (course.credits || 3) <= maxCredits[semesterType] &&
                    !isMajorLimitExceeded
                ) {
                    currentSemester.courses.push(course);
                    currentSemester.credits += course.credits || 3;
                    course.scheduled = true;
                    if (course.type.includes("major")) {
                        currentSemester.majorCount++;
                    }
                    coursesScheduledThisSemester = true;

                    // Corequisites
                    if (Array.isArray(course.corequisites)) {
                        for (const coReq of course.corequisites) {
                            const resolvedCoReq = resolveToCourseNumber(coReq);
                            const coReqCourse = allCourses.find(c => c.course_number === resolvedCoReq && !c.scheduled);
                            if (
                                coReqCourse &&
                                coReqCourse.semesters_offered.includes(semesterType) &&
                                currentSemester.credits + (coReqCourse.credits || 3) <= maxCredits[semesterType]
                            ) {
                                currentSemester.courses.push(coReqCourse);
                                currentSemester.credits += coReqCourse.credits || 3;
                                coReqCourse.scheduled = true;
                            }
                        }
                    }
                }
            }

            // If includeAll, attempt a core course
            if (includeAll && currentSemester.credits < maxCredits[semesterType]) {
                const availableCoreCourses = allCourses.filter(course =>
                    course.type.includes("core") &&
                    !course.scheduled &&
                    course.semesters_offered.includes(semesterType)
                );
                for (const coreCourse of availableCoreCourses) {
                    if (currentSemester.credits + (coreCourse.credits || 3) <= maxCredits[semesterType]) {
                        currentSemester.courses.push(coreCourse);
                        currentSemester.credits += coreCourse.credits || 3;
                        coreCourse.scheduled = true;
                        coursesScheduledThisSemester = true;
                        break;
                    }
                }
            }

            // Senior courses in last 3 semesters
            const seniorCourses = allCourses.filter(course => course.isSeniorCourse && !course.scheduled);
            const totalCoursesLeft = allCourses.filter(course => !course.scheduled).length;
            const estimatedTotalSemesters = schedule.length + Math.ceil(totalCoursesLeft / Math.max(fallWinterCredits, springCredits));
            const semestersLeft = estimatedTotalSemesters - schedule.length;
            if (semestersLeft <= 3 && seniorCourses.length > 0) {
                for (const seniorCourse of seniorCourses) {
                    const prereqsMet = Array.isArray(seniorCourse.prerequisites)
                      ? seniorCourse.prerequisites.every(prereq => {
                          const resolvedPrereq = resolveToCourseNumber(prereq);
                          return resolvedPrereq ? completedCourses.has(resolvedPrereq) : false;
                        })
                      : true;
                    if (
                        prereqsMet &&
                        seniorCourse.semesters_offered.includes(semesterType) &&
                        currentSemester.credits + (seniorCourse.credits || 3) <= maxCredits[semesterType]
                    ) {
                        currentSemester.courses.push(seniorCourse);
                        currentSemester.credits += seniorCourse.credits || 3;
                        seniorCourse.scheduled = true;
                        coursesScheduledThisSemester = true;
                    }
                }
            }

            // Finalize
            if (coursesScheduledThisSemester) {
                for (const course of currentSemester.courses) {
                    completedCourses.add(course.course_number);
                }
                schedule.push(currentSemester);
            } else {
                schedule.push(currentSemester);
            }

            currentSemesterIndex++;
            if (schedule.length > 100) {
                throw new Error("Scheduling exceeded 100 semesters. Please review course prerequisites and availability.");
            }
        }

        // Summaries
        let totalCredits = schedule.reduce((sum, sem) => sum + sem.credits, 0);
        let graduationDate = schedule[schedule.length - 1].name.match(/\(([^)]+)\)/)[1]; // Extract semester label
        let electiveCreditsNeeded = Math.max(0, 120 - totalCredits);

        document.getElementById('total-credits').innerText = totalCredits;
        document.getElementById('graduation-date').innerText = graduationDate;
        document.getElementById('electives-needed').innerText = electiveCreditsNeeded;
        document.getElementById('schedule-container').classList.remove('hidden');

        const scheduleDiv = document.getElementById("schedule");
        scheduleDiv.innerHTML = schedule.map(sem => `
            <div class="semester animated-box">
                <h3>${sem.name} - Total Credits: ${sem.credits}</h3>
                <ul>
                    ${sem.courses.map(c => `<li class="${getTypeColorClass(c.type)}">${c.course_number}: ${c.course_name}</li>`).join('')}
                </ul>
            </div>
        `).join('');
    } catch (error) {
        console.error("Error during scheduling process:", error);
        document.getElementById('schedule-container').classList.add('hidden');
        document.getElementById("schedule").innerHTML = `<p>An error occurred: ${error.message}</p>`;
    }
});

// Color class logic
function getTypeColorClass(types) {
    const priority = { holokai: 1, eil: 2, major: 3, minor1: 4, minor2: 4, core: 5, religion: 6 };
    let chosenType = null;
    let chosenPriority = Infinity;
    for (const t of types) {
        const p = priority[t] || 8;
        if (p < chosenPriority) {
            chosenPriority = p;
            chosenType = t;
        }
    }
    if (chosenType === "minor1" || chosenType === "minor2") chosenType = "minor";
    return `type-${chosenType}`;
}

console.log("Fetched Program Courses:", programCourses);
// ...existing code...