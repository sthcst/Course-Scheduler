document.addEventListener('DOMContentLoaded', async () => {
  // --- Populate Dropdowns on Page Load ---
  try {
    const response = await fetch('/api/courses');
    if (!response.ok) {
      throw new Error(`Error fetching courses: ${response.statusText}`);
    }
    const courses = await response.json();

    // Filter courses by type
    const majorCourses = courses.filter(course =>
      course.course_type && course.course_type.toLowerCase() === "major"
    );
    const minorCourses = courses.filter(course =>
      course.course_type && course.course_type.toLowerCase() === "minor"
    );

    // Populate Major and Minor dropdowns
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
    const englishCourses = courses.filter(course =>
      course.course_type && course.course_type.toLowerCase() === "eil/holokai"
    );
    const englishLevelSelect = document.getElementById("english-level");
    englishLevelSelect.innerHTML = ""; // Clear any existing options
    englishCourses.forEach(course => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = course.course_name;
      englishLevelSelect.appendChild(option);
    });

    console.log("Dropdowns populated successfully.");
  } catch (error) {
    console.error("Error populating dropdowns:", error);
  }

  // --- Generate Schedule Button Handler ---
  const generateButton = document.getElementById("calculate-schedule");
  if (generateButton) {
    generateButton.addEventListener('click', async (event) => {
      event.preventDefault(); // Prevent default button behavior

      // Retrieve selected values from dropdowns and inputs
      const selectedMajorId = document.getElementById('major').value;
      const selectedMinor1Id = document.getElementById('minor1').value;
      const selectedMinor2Id = document.getElementById('minor2').value;
      const englishLevel = document.getElementById("english-level").value;
      const startSemester = document.getElementById("start-semester").value;
      const majorClassLimit = parseInt(document.getElementById("major-class-limit").value, 10);
      const fallWinterCredits = parseInt(document.getElementById("fall-winter-credits").value, 10);
      const springCredits = parseInt(document.getElementById("spring-credits").value, 10);

      console.log("User selections:");
      console.log("Major:", selectedMajorId);
      console.log("Minor 1:", selectedMinor1Id);
      console.log("Minor 2:", selectedMinor2Id);
      console.log("English Level:", englishLevel);
      console.log("Start Semester:", startSemester);
      console.log("Major Class Limit:", majorClassLimit);
      console.log("Fall/Winter Credits:", fallWinterCredits);
      console.log("Spring Credits:", springCredits);

      // Convert selected IDs to numbers
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

        // Helper function: extract classes from program details (direct array or nested in sections)
        // The second parameter "isMajor" tags the extracted classes as major if true.
        const extractClasses = (programDetails, isMajor = false) => {
          let classes = [];
          if (programDetails.classes) {
            classes = programDetails.classes;
          } else if (Array.isArray(programDetails.sections)) {
            let allClasses = [];
            programDetails.sections.forEach(section => {
              if (Array.isArray(section.classes)) {
                allClasses = allClasses.concat(section.classes);
              }
            });
            classes = allClasses;
          }
          if (isMajor) {
            classes = classes.map(cls => ({ ...cls, isMajor: true }));
          }
          return classes;
        };

        const majorClasses = extractClasses(majorDetails, true);
        const minor1Classes = extractClasses(minor1Details, false);
        const minor2Classes = extractClasses(minor2Details, false);

        // Combine classes from Major, Minor 1, and Minor 2 into one array
        let combinedClasses = [...majorClasses, ...minor1Classes, ...minor2Classes];

        // Deduplicate combinedClasses by unique id
        const uniqueClassesMap = new Map();
        combinedClasses.forEach(cls => {
          uniqueClassesMap.set(cls.id, cls);
        });
        combinedClasses = Array.from(uniqueClassesMap.values());
        console.log("Combined Unique Classes Array:", combinedClasses);

        // Group Classes by Semester (enforcing credits, major limit, prerequisites, and corequisites)
        const maxCreditsPerSemester = {
          Fall: fallWinterCredits,
          Winter: fallWinterCredits,
          Spring: springCredits
        };

        const semesterOrder = ["Winter", "Spring", "Fall"];
        const startParts = startSemester.split(" ");
        let currentSemesterType = startParts[0];
        let currentYear = parseInt(startParts[1], 10) || 2025;

        const semesterSchedule = [];
        // Maintain a list of class IDs that have been scheduled in previous semesters
        const scheduledClassIDs = [];
        // Create a working copy of the combined classes to mark as scheduled
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

          // Filter unscheduled classes offered in the current semester
          const availableClasses = unscheduledClasses.filter(cls =>
            !cls.scheduled &&
            Array.isArray(cls.semesters_offered) &&
            cls.semesters_offered.includes(currentSemesterType)
          );

          for (let cls of availableClasses) {
            if (semesterObj.totalCredits + cls.credits > maxCreditsAllowed) continue;

            // Check prerequisite constraints
            if (cls.prerequisites && cls.prerequisites.length > 0) {
              const prerequisitesMet = cls.prerequisites.every(reqId => scheduledClassIDs.includes(reqId));
              if (!prerequisitesMet) continue;
            }

            // Handle corequisites: group the class with its corequisites to schedule together
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
              // Normal scheduling for classes without corequisites
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

          semesterSchedule.push(semesterObj);
          // Advance to the next semester in the cycle
          const currentIndex = semesterOrder.indexOf(currentSemesterType);
          if (currentIndex === semesterOrder.length - 1) {
            currentSemesterType = semesterOrder[0];
            currentYear++;
          } else {
            currentSemesterType = semesterOrder[currentIndex + 1];
          }
        }

        console.log("Semester Grouped Schedule:", semesterSchedule);
        renderSchedule(semesterSchedule);
      } catch (error) {
        console.error("Error fetching program details:", error);
      }
    });
  } else {
    console.warn("Generate Schedule button not found.");
  }

  // Render schedule into the schedule container
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
