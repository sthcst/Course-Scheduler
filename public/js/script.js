// Global variable to hold all courses for later filtering (e.g. religion courses)
let allCourses = [];

document.addEventListener('DOMContentLoaded', async () => {
  // --- Populate Dropdowns on Page Load ---
  try {
    const response = await fetch('/api/courses');
    if (!response.ok) {
      throw new Error(`Error fetching courses: ${response.statusText}`);
    }
    const courses = await response.json();
    // Save all courses for later use
    allCourses = courses;

    // Filter courses by type
    const majorCourses = courses.filter(course =>
      course.course_type && course.course_type.toLowerCase() === "major"
    );
    const minorCourses = courses.filter(course =>
      course.course_type && course.course_type.toLowerCase() === "minor"
    );

    // Populate Major and Minor dropdowns (using course IDs for these)
    const majorSelect = document.getElementById("major");
    const minor1Select = document.getElementById("minor1");
    const minor2Select = document.getElementById("minor2");

    majorSelect.innerHTML = `<option value="" disabled selected>Select Major</option>`;
    minor1Select.innerHTML = `<option value="" disabled selected>Select Minor 1</option>`;
    minor2Select.innerHTML = `<option value="" disabled selected>Select Minor 2</option>`;

    majorCourses.forEach(course => {
      const option = document.createElement('option');
      option.value = course.id;
      option.textContent = course.course_name;
      majorSelect.appendChild(option);
    });

    minorCourses.forEach(course => {
      const option = document.createElement('option');
      option.value = course.id;
      option.textContent = course.course_name;
      // Use cloneNode(true) to reuse the same option element for both dropdowns
      minor1Select.appendChild(option.cloneNode(true));
      minor2Select.appendChild(option.cloneNode(true));
    });

    // --- Populate English Level Dropdown ---
    // Use the course name as the option value so we can decide by name later.
    const englishCourses = courses.filter(course =>
      course.course_type && course.course_type.toLowerCase() === "eil/holokai"
    );
    const englishLevelSelect = document.getElementById("english-level");
    englishLevelSelect.innerHTML = ""; // Clear any existing options
    englishCourses.forEach(course => {
      const option = document.createElement("option");
      option.value = course.course_name; // e.g., "Academic English I" or "Academic English II"
      option.textContent = course.course_name;
      englishLevelSelect.appendChild(option);
    });

    console.log("Dropdowns populated successfully.");
  } catch (error) {
    console.error("Error populating dropdowns:", error);
  }

  // --- Helper Functions ---

  // extractClasses: extracts classes from program details (directly or from sections),
  // attaches a given category, and (if isMajor is true) marks each class as major.
  // For courses with sections, it also attaches the sectionId to each class.
  function extractClasses(programDetails, isMajor = false, category = '') {
    let classes = [];
    if (programDetails.classes) {
      classes = programDetails.classes;
    } else if (Array.isArray(programDetails.sections)) {
      let allClassesArr = [];
      programDetails.sections.forEach(section => {
        if (Array.isArray(section.classes)) {
          // Attach sectionId to each class from this section.
          const classesWithSection = section.classes.map(cls => ({ ...cls, sectionId: section.id }));
          allClassesArr = allClassesArr.concat(classesWithSection);
        }
      });
      classes = allClassesArr;
    }
    classes = classes.map(cls => ({ ...cls, category: category }));
    if (isMajor) {
      classes = classes.map(cls => ({ ...cls, isMajor: true }));
    }
    return classes;
  }

  // Simplified priority function:
  // Order: English (1), Religion (2), Major (3), Minor (4)
  function getPriority(cls) {
    if (cls.category === "english") return 1;
    if (cls.category === "religion") return 2;
    if (cls.category === "major") return 3;
    if (cls.category === "minor") return 4;
    return 10;
  }

  // filterElectivesFromCombined: given an array of combined classes, remove extra elective classes.
  // It groups elective classes (category "elective") by sectionId and retains only the first N (sorted by class_number),
  // where N is the allowed count (classes_to_choose) from that section.
  function filterElectivesFromCombined(combinedClasses) {
    const electiveGroups = {};
    // Group elective classes by sectionId.
    combinedClasses.forEach(cls => {
      if (cls.category === "elective" && cls.sectionId !== undefined) {
        if (!electiveGroups[cls.sectionId]) {
          electiveGroups[cls.sectionId] = [];
        }
        electiveGroups[cls.sectionId].push(cls);
      }
    });
    // For each group, sort numerically by class_number and keep only allowed number.
    let filteredElectives = [];
    for (let sectionId in electiveGroups) {
      let electives = electiveGroups[sectionId];
      electives.sort((a, b) => {
        const numA = parseInt(a.class_number.match(/\d+/)?.[0] || "0", 10);
        const numB = parseInt(b.class_number.match(/\d+/)?.[0] || "0", 10);
        return numA - numB;
      });
      // Determine allowed count for this elective section by looking up in allCourses.
      let allowedCount = 0;
      allCourses.forEach(course => {
        if (course.sections && Array.isArray(course.sections)) {
          course.sections.forEach(section => {
            if (!section.is_required && section.id == sectionId) {
              allowedCount = section.classes_to_choose || 0;
            }
          });
        }
      });
      filteredElectives.push(...electives.slice(0, allowedCount));
    }
    // Remove all elective classes from the combined array and add the filtered ones.
    const nonElectives = combinedClasses.filter(cls => cls.category !== "elective");
    return nonElectives.concat(filteredElectives);
  }

  // --- Generate Schedule Button Handler ---
  const generateButton = document.getElementById("calculate-schedule");
  if (generateButton) {
    generateButton.addEventListener('click', async (event) => {
      event.preventDefault(); // Prevent default behavior

      // Retrieve selected values from dropdowns and inputs
      const selectedMajorId = document.getElementById('major').value;
      const selectedMinor1Id = document.getElementById('minor1').value;
      const selectedMinor2Id = document.getElementById('minor2').value;
      // englishLevel is now a course name (e.g., "Academic English I" or "Academic English II")
      const englishLevel = document.getElementById("english-level").value;
      const startSemester = document.getElementById("start-semester").value;
      const majorClassLimit = parseInt(document.getElementById("major-class-limit").value, 10);
      const fallWinterCredits = parseInt(document.getElementById("fall-winter-credits").value, 10);
      const springCredits = parseInt(document.getElementById("spring-credits").value, 10);

      console.log("User selections:", {
        major: selectedMajorId,
        minor1: selectedMinor1Id,
        minor2: selectedMinor2Id,
        englishLevel,
        startSemester,
        majorClassLimit,
        fallWinterCredits,
        springCredits
      });

      // Convert selected IDs for Major and Minors to numbers
      const majorId = Number(selectedMajorId);
      const minor1Id = Number(selectedMinor1Id);
      const minor2Id = Number(selectedMinor2Id);

      try {
        // Fetch program details concurrently for Major, Minor 1, and Minor 2
        const [majorRes, minor1Res, minor2Res] = await Promise.all([
          fetch(`/api/courses/${majorId}`),
          fetch(`/api/courses/${minor1Id}`),
          fetch(`/api/courses/${minor2Id}`)
        ]);
        if (!majorRes.ok || !minor1Res.ok || !minor2Res.ok) {
          throw new Error("Error fetching one or more program details.");
        }
        const majorDetails = await majorRes.json();
        const minor1Details = await minor1Res.json();
        const minor2Details = await minor2Res.json();

        // --- Fetch English Level Course Details ---
        const selectedEnglishCourse = allCourses.find(course =>
          course.course_name === englishLevel
        );
        if (!selectedEnglishCourse) {
          throw new Error("Selected English Level course not found in allCourses.");
        }
        const englishRes = await fetch(`/api/courses/${selectedEnglishCourse.id}`);
        if (!englishRes.ok) {
          throw new Error("Error fetching English Level course details.");
        }
        const englishDetails = await englishRes.json();

        let englishClasses = [];
        if (englishLevel === "Academic English I") {
          const englishIClasses = extractClasses(englishDetails, false, "english");
          const englishII = allCourses.find(course =>
            course.course_name === "Academic English II"
          );
          if (!englishII) {
            throw new Error("Academic English II not found in allCourses.");
          }
          const englishIIRes = await fetch(`/api/courses/${englishII.id}`);
          if (!englishIIRes.ok) {
            throw new Error("Error fetching Academic English II details.");
          }
          const englishIIDetails = await englishIIRes.json();
          const englishIIClasses = extractClasses(englishIIDetails, false, "english");
          englishClasses = [...englishIClasses, ...englishIIClasses];
        } else {
          englishClasses = extractClasses(englishDetails, false, "english");
        }

        // --- Fetch Religion Courses Details ---
        const religionCoursesArray = allCourses.filter(course =>
          course.course_type && course.course_type.toLowerCase() === "religion"
        );
        const religionDetailsPromises = religionCoursesArray.map(course =>
          fetch(`/api/courses/${course.id}`)
        );
        const religionResponses = await Promise.all(religionDetailsPromises);
        religionResponses.forEach((res) => {
          if (!res.ok) {
            throw new Error("Error fetching a religion course detail.");
          }
        });
        const religionDetails = await Promise.all(religionResponses.map(res => res.json()));
        let religionClasses = [];
        religionDetails.forEach(detail => {
          const relClasses = extractClasses(detail, false, "religion");
          religionClasses = religionClasses.concat(relClasses);
        });

        // Extract classes from major and minor details with proper categories.
        const majorClasses = extractClasses(majorDetails, true, "major");
        const minor1Classes = extractClasses(minor1Details, false, "minor");
        const minor2Classes = extractClasses(minor2Details, false, "minor");

        // Combine classes in desired order: English, Religion, Major, Minor.
        let combinedClasses = [
          ...englishClasses,
          ...religionClasses,
          ...majorClasses,
          ...minor1Classes,
          ...minor2Classes
        ];

        // Mark prerequisite classes (for reference).
        const prereqSet = new Set();
        combinedClasses.forEach(cls => {
          if (cls.prerequisites && cls.prerequisites.length > 0) {
            cls.prerequisites.forEach(id => prereqSet.add(id));
          }
        });
        combinedClasses.forEach(cls => {
          cls.isPrereq = prereqSet.has(cls.id);
        });

        // Deduplicate combined classes.
        const uniqueClassesMap = new Map();
        combinedClasses.forEach(cls => {
          uniqueClassesMap.set(cls.id, cls);
        });
        combinedClasses = Array.from(uniqueClassesMap.values());
        console.log("Combined Unique Classes Array before elective filtering:", combinedClasses);

        // --- Filter Out Extra Elective Classes BEFORE Scheduling ---
        combinedClasses = filterElectivesFromCombined(combinedClasses);
        console.log("Combined Unique Classes Array after elective filtering:", combinedClasses);

        // --- Scheduling Algorithm ---
        const maxCreditsPerSemester = {
          Fall: fallWinterCredits,
          Winter: fallWinterCredits,
          Spring: springCredits
        };
        const semesterOrder = ["Winter", "Spring", "Fall"];
        const startParts = startSemester.split(" ");
        let currentSemesterType = startParts[0];
        let currentYear = parseInt(startParts[1], 10) || 2025;
        let semesterCounter = 0;
        const semesterSchedule = [];
        const scheduledClassIDs = [];
        const unscheduledClasses = combinedClasses.map(cls => ({ ...cls, scheduled: false }));

        while (unscheduledClasses.some(cls => !cls.scheduled)) {
          const maxCreditsAllowed = maxCreditsPerSemester[currentSemesterType];
          const semesterObj = {
            semester: currentSemesterType,
            year: currentYear,
            classes: [],
            totalCredits: 0,
            majorCount: 0
          };

          let availableClasses = unscheduledClasses.filter(cls =>
            !cls.scheduled &&
            Array.isArray(cls.semesters_offered) &&
            cls.semesters_offered.includes(currentSemesterType)
          );

          availableClasses.sort((a, b) => getPriority(a) - getPriority(b));

          for (let cls of availableClasses) {
            if (englishLevel === "Academic English I" && cls.class_number === "EIL 320" && semesterCounter !== 1) {
              continue;
            }
            if (cls.category === "religion" && semesterObj.classes.some(c => c.category === "religion")) {
              continue;
            }
            if (semesterObj.totalCredits + cls.credits > maxCreditsAllowed) continue;
            if (cls.prerequisites && cls.prerequisites.length > 0) {
              const prerequisitesMet = cls.prerequisites.every(reqId => scheduledClassIDs.includes(reqId));
              if (!prerequisitesMet) continue;
            }
            if (cls.corequisites && cls.corequisites.length > 0) {
              let group = [cls];
              let canGroup = true;
              for (let coreqId of cls.corequisites) {
                let coreqClass = unscheduledClasses.find(x =>
                  x.id === coreqId &&
                  !x.scheduled &&
                  Array.isArray(x.semesters_offered) &&
                  x.semesters_offered.includes(currentSemesterType)
                );
                if (!coreqClass) {
                  canGroup = false;
                  break;
                }
                if (coreqClass.prerequisites && coreqClass.prerequisites.length > 0) {
                  const coreqPrereqMet = coreqClass.prerequisites.every(reqId => scheduledClassIDs.includes(reqId));
                  if (!coreqPrereqMet) {
                    canGroup = false;
                    break;
                  }
                }
                if (!group.find(x => x.id === coreqClass.id)) {
                  group.push(coreqClass);
                }
              }
              if (englishLevel === "Academic English I" && group.some(item => item.class_number === "EIL 320") && semesterCounter !== 1) {
                continue;
              }
              if (!canGroup) continue;
              let groupTotalCredits = group.reduce((sum, item) => sum + item.credits, 0);
              let groupMajorCount = group.filter(item => item.isMajor).length;
              if (semesterObj.totalCredits + groupTotalCredits <= maxCreditsAllowed &&
                  semesterObj.majorCount + groupMajorCount <= majorClassLimit) {
                group.forEach(item => {
                  semesterObj.classes.push(item);
                  semesterObj.totalCredits += item.credits;
                  if (item.isMajor) semesterObj.majorCount++;
                  item.scheduled = true;
                });
                group.forEach(item => {
                  if (!scheduledClassIDs.includes(item.id)) {
                    scheduledClassIDs.push(item.id);
                  }
                });
              }
            } else {
              if (semesterObj.totalCredits + cls.credits <= maxCreditsAllowed) {
                if (cls.isMajor) {
                  if (semesterObj.majorCount < majorClassLimit) {
                    semesterObj.classes.push(cls);
                    semesterObj.totalCredits += cls.credits;
                    cls.scheduled = true;
                    semesterObj.majorCount++;
                    scheduledClassIDs.push(cls.id);
                  }
                } else {
                  semesterObj.classes.push(cls);
                  semesterObj.totalCredits += cls.credits;
                  cls.scheduled = true;
                  scheduledClassIDs.push(cls.id);
                }
              }
            }
          }

          // Sort classes within this semester numerically by digits in class_number.
          semesterObj.classes.sort((a, b) => {
            const numA = parseInt(a.class_number.match(/\d+/)?.[0] || "0", 10);
            const numB = parseInt(b.class_number.match(/\d+/)?.[0] || "0", 10);
            return numA - numB;
          });

          semesterSchedule.push(semesterObj);
          const currentIndex = semesterOrder.indexOf(currentSemesterType);
          if (currentIndex === semesterOrder.length - 1) {
            currentSemesterType = semesterOrder[0];
            currentYear++;
          } else {
            currentSemesterType = semesterOrder[currentIndex + 1];
          }
          semesterCounter++;
        }

        console.log("Semester Grouped Schedule:", semesterSchedule);

        // --- Update Summary Information ---
        const totalCredits = semesterSchedule.reduce((sum, sem) => sum + sem.totalCredits, 0);
        document.getElementById("total-credits").textContent = totalCredits;
        if (semesterSchedule.length > 0) {
          const lastSem = semesterSchedule[semesterSchedule.length - 1];
          document.getElementById("graduation-date").textContent = `${lastSem.semester} ${lastSem.year}`;
        } else {
          document.getElementById("graduation-date").textContent = "TBD";
        }
        document.getElementById("electives-needed").textContent = 120 - totalCredits;

        renderSchedule(semesterSchedule);
      } catch (error) {
        console.error("Error fetching program details:", error);
      }
    });
  } else {
    console.warn("Generate Schedule button not found.");
  }

  // --- Render Schedule ---
  function renderSchedule(semesterSchedule) {
    const scheduleDiv = document.getElementById("schedule");
    scheduleDiv.innerHTML = semesterSchedule.map(sem => `
      <div class="semester animated-box">
        <h3>${sem.semester} ${sem.year} - Credits: ${sem.totalCredits}</h3>
        <ul>
          ${sem.classes.map(cls => `<li>${cls.class_number}: ${cls.class_name}</li>`).join('')}
        </ul>
      </div>
    `).join('');
    document.getElementById('schedule-container').classList.remove('hidden');
    console.log("Schedule rendered on the page.");
  }
});
