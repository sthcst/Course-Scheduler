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
      // Use cloneNode(true) so the same option can be used in both dropdowns
      minor1Select.appendChild(option.cloneNode(true));
      minor2Select.appendChild(option.cloneNode(true));
    });

    // --- Populate English Level Dropdown ---
    // Use the course name as the option value so we can decide by name later.
    const englishCourses = courses.filter(course =>
      course.course_type && course.course_type.toLowerCase() === "eil/holokai"
    );
    const englishLevelSelect = document.getElementById("english-level");
    englishLevelSelect.innerHTML = "";
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

  // extractClasses:
  // Extracts classes from program details (directly or from sections),
  // attaches a given category, and if isMajor is true, marks each class as major.
  // Also attaches sectionId for classes coming from a section.
  function extractClasses(programDetails, isMajor = false, category = '') {
    let classes = [];
    if (programDetails.classes) {
      classes = programDetails.classes;
    } else if (Array.isArray(programDetails.sections)) {
      let allClassesArr = [];
      programDetails.sections.forEach(section => {
        if (Array.isArray(section.classes)) {
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

  // getPriority:
  // Returns a numeric priority for scheduling: English (1), Religion (2), Major (3), Minor (4).
  function getPriority(cls) {
    if (cls.category === "english") return 1;
    if (cls.category === "religion") return 2;
    if (cls.category === "major") return 3;
    if (cls.category === "minor") return 4;
    return 10;
  }

  // getAllowedElectives:
  // Scans all courses for elective sections and returns an array of elective classes that are allowed.
  // Only the first N classes per section (sorted by class_number) are allowed, where N = section.classes_to_choose.
  function getAllowedElectives(allCourses) {
    let allowedElectives = [];
    allCourses.forEach(course => {
      if (course.sections && Array.isArray(course.sections)) {
        course.sections.forEach(section => {
          if (!section.is_required) {
            let candidates = (section.classes || []).filter(cls => cls.is_elective === true)
              .map(cls => ({ ...cls, category: "elective", sectionId: section.id }));
            candidates.sort((a, b) => {
              const numA = parseInt(a.class_number.match(/\d+/)?.[0] || "0", 10);
              const numB = parseInt(b.class_number.match(/\d+/)?.[0] || "0", 10);
              return numA - numB;
            });
            let allowedCount = section.classes_to_choose || 0;
            for (let i = 0; i < candidates.length; i++) {
              if (i < allowedCount) {
                candidates[i].allowed = true;
                allowedElectives.push(candidates[i]);
              } else {
                candidates[i].allowed = false;
              }
            }
          }
        });
      }
    });
    return allowedElectives;
  }

  // --- Generate Schedule Button Handler ---
  const generateButton = document.getElementById("calculate-schedule");
  if (generateButton) {
    generateButton.addEventListener('click', async (event) => {
      event.preventDefault();

      // Retrieve selected values
      const selectedMajorId = document.getElementById('major').value;
      const selectedMinor1Id = document.getElementById('minor1').value;
      const selectedMinor2Id = document.getElementById('minor2').value;
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

      const majorId = Number(selectedMajorId);
      const minor1Id = Number(selectedMinor1Id);
      const minor2Id = Number(selectedMinor2Id);

      try {
        // Fetch details concurrently for Major, Minor1, and Minor2
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

        // Fetch English Level details
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

        // Fetch Religion details
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

        // Extract classes from Major and Minor courses.
        const majorClasses = extractClasses(majorDetails, true, "major");
        const minor1Classes = extractClasses(minor1Details, false, "minor");
        const minor2Classes = extractClasses(minor2Details, false, "minor");

        // Combine required classes (excluding electives).
        let requiredClasses = [
          ...englishClasses,
          ...religionClasses,
          ...majorClasses,
          ...minor1Classes,
          ...minor2Classes
        ].filter(cls => !cls.is_elective);

        // Get allowed electives (only allowed ones based on classes_to_choose).
        const allowedElectives = getAllowedElectives(allCourses);
        console.log("Allowed elective classes:", allowedElectives);

        // Combine required classes with allowed electives.
        let combinedClasses = requiredClasses.concat(allowedElectives);

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
        console.log("Combined Unique Classes Array (with electives filtered):", combinedClasses);

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
        // Work with a duplicate of combinedClasses for scheduling.
        let unscheduledClasses = combinedClasses.map(cls => ({ ...cls }));

        // For each semester, loop repeatedly until no more classes can be scheduled.
        while (unscheduledClasses.length > 0) {
          const maxCreditsAllowed = maxCreditsPerSemester[currentSemesterType];
          const semesterObj = {
            semester: currentSemesterType,
            year: currentYear,
            classes: [],
            totalCredits: 0,
            majorCount: 0
          };

          let canAdd = true;
          while (canAdd) {
            canAdd = false;
            // Create an array of classes available for the current semester.
            let availableIndexes = [];
            for (let i = 0; i < unscheduledClasses.length; i++) {
              const cls = unscheduledClasses[i];
              if (
                cls.semesters_offered &&
                cls.semesters_offered.includes(currentSemesterType)
              ) {
                availableIndexes.push(i);
              }
            }
            // Sort available classes by priority.
            availableIndexes.sort((i, j) => {
              return getPriority(unscheduledClasses[i]) - getPriority(unscheduledClasses[j]);
            });
            // Attempt to schedule each available class (in order) if it fits.
            for (let index of availableIndexes) {
              let cls = unscheduledClasses[index];
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
              // Check corequisites as a group
              if (cls.corequisites && cls.corequisites.length > 0) {
                let group = [cls];
                let canGroup = true;
                for (let coreqId of cls.corequisites) {
                  let coreqIndex = unscheduledClasses.findIndex(x =>
                    x.id === coreqId &&
                    x.semesters_offered &&
                    x.semesters_offered.includes(currentSemesterType)
                  );
                  if (coreqIndex === -1) {
                    canGroup = false;
                    break;
                  }
                  let coreqClass = unscheduledClasses[coreqIndex];
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
                  // Add each class in the group to the semester and mark them as scheduled.
                  group.forEach(item => {
                    semesterObj.classes.push(item);
                    semesterObj.totalCredits += item.credits;
                    if (item.isMajor) semesterObj.majorCount++;
                    scheduledClassIDs.push(item.id);
                  });
                  // Remove all scheduled group members from unscheduledClasses.
                  unscheduledClasses = unscheduledClasses.filter(item => !group.find(g => g.id === item.id));
                  canAdd = true;
                  break;
                }
              } else {
                // For a single class
                semesterObj.classes.push(cls);
                semesterObj.totalCredits += cls.credits;
                if (cls.isMajor) {
                  semesterObj.majorCount++;
                }
                scheduledClassIDs.push(cls.id);
                // Remove this class from unscheduledClasses.
                unscheduledClasses.splice(index, 1);
                canAdd = true;
                break;
              }
            }
          } // End inner while; semester is filled as far as possible

          // Sort the classes within the semester numerically.
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
        document.getElementById("electives-needed").textContent = Math.max(120 - totalCredits, 0);

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
