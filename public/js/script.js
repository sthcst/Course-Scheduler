document.addEventListener('DOMContentLoaded', async () => {
    // --- Populate Dropdowns on Page Load ---
    try {
      const response = await fetch('/api/courses');
      if (!response.ok) {
        throw new Error(`Error fetching courses: ${response.statusText}`);
      }
      const courses = await response.json();
  
      // Filter courses by type (ensuring course_type exists)
      const majorCourses = courses.filter(course => course.course_type && course.course_type.toLowerCase() === "major");
      const minorCourses = courses.filter(course => course.course_type && course.course_type.toLowerCase() === "minor");
  
      // Get dropdown elements
      const majorSelect = document.getElementById("major");
      const minor1Select = document.getElementById("minor1");
      const minor2Select = document.getElementById("minor2");
  
      // Set default options
      majorSelect.innerHTML = `<option value="" disabled selected>Select Major</option>`;
      minor1Select.innerHTML = `<option value="" disabled selected>Select Minor 1</option>`;
      minor2Select.innerHTML = `<option value="" disabled selected>Select Minor 2</option>`;
  
      // Populate the Major dropdown
      majorCourses.forEach(course => {
        const option = document.createElement('option');
        option.value = course.id;
        option.textContent = course.course_name;
        majorSelect.appendChild(option);
      });
  
      // Populate both Minor dropdowns
      minorCourses.forEach(course => {
        const option = document.createElement('option');
        option.value = course.id;
        option.textContent = course.course_name;
        minor1Select.appendChild(option.cloneNode(true));
        minor2Select.appendChild(option.cloneNode(true));
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
          const extractClasses = (programDetails) => {
            if (programDetails.classes) {
              return programDetails.classes;
            } else if (Array.isArray(programDetails.sections)) {
              let allClasses = [];
              programDetails.sections.forEach(section => {
                if (Array.isArray(section.classes)) {
                  allClasses = allClasses.concat(section.classes);
                }
              });
              return allClasses;
            }
            return [];
          };
  
          const majorClasses = extractClasses(majorDetails);
          const minor1Classes = extractClasses(minor1Details);
          const minor2Classes = extractClasses(minor2Details);
  
          // Combine classes from Major, Minor 1, and Minor 2 into one array
          let combinedClasses = [...majorClasses, ...minor1Classes, ...minor2Classes];
  
          // --- Deduplicate combinedClasses by unique id ---
          const uniqueClassesMap = new Map();
          combinedClasses.forEach(cls => {
            uniqueClassesMap.set(cls.id, cls);
          });
          combinedClasses = Array.from(uniqueClassesMap.values());
          console.log("Combined Unique Classes Array:", combinedClasses);
  
          // --- Group Classes by Semester Using Actual Credits and Enforcing Major Limit ---
          const maxCreditsPerSemester = {
            Fall: fallWinterCredits,
            Winter: fallWinterCredits,
            Spring: springCredits
          };
  
          // Define the semester order (cycle through Winter, Spring, Fall)
          const semesterOrder = ["Winter", "Spring", "Fall"];
          const startParts = startSemester.split(" ");
          let currentSemesterType = startParts[0]; // e.g., "Winter"
          let currentYear = parseInt(startParts[1], 10) || 2025;
  
          const semesterSchedule = [];
          // Create a working copy of the combined classes to mark as scheduled
          const unscheduledClasses = combinedClasses.map(cls => ({ ...cls, scheduled: false }));
  
          while (unscheduledClasses.some(cls => !cls.scheduled)) {
            // Maximum credits allowed for the current semester
            const maxCreditsAllowed = maxCreditsPerSemester[currentSemesterType];
            const semesterObj = {
              semester: currentSemesterType,
              year: currentYear,
              classes: [],
              totalCredits: 0,
              majorCount: 0
            };
  
            // Filter unscheduled classes that are offered in the current semester
            const availableClasses = unscheduledClasses.filter(cls =>
              !cls.scheduled &&
              Array.isArray(cls.semesters_offered) &&
              cls.semesters_offered.includes(currentSemesterType)
            );
  
            // Add classes one by one until the credit limit is reached
            for (let cls of availableClasses) {
              // Check if adding this class will exceed the allowed credits
              if (semesterObj.totalCredits + cls.credits <= maxCreditsAllowed) {
                // If it's a major class, enforce the major class limit
                if (cls.course_type && cls.course_type.toLowerCase() === "major") {
                  if (semesterObj.majorCount < majorClassLimit) {
                    semesterObj.classes.push(cls);
                    semesterObj.totalCredits += cls.credits;
                    cls.scheduled = true;
                    semesterObj.majorCount++;
                  }
                } else {
                  // Otherwise, add the class normally
                  semesterObj.classes.push(cls);
                  semesterObj.totalCredits += cls.credits;
                  cls.scheduled = true;
                }
              }
            }
  
            // Add the current semester object to the schedule
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
  
          // --- Render the Schedule ---
          renderSchedule(semesterSchedule);
  
        } catch (error) {
          console.error("Error fetching program details:", error);
        }
      });
    } else {
      console.warn("Generate Schedule button not found.");
    }
  
    /**
     * Renders the semesterSchedule array into the schedule grid container.
     * Each semester box displays the semester name, year, total credits, and a list of classes (class number and class name).
     * @param {Array} semesterSchedule - Array of semester objects.
     */
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
      // Reveal the schedule container
      document.getElementById('schedule-container').classList.remove('hidden');
      console.log("Schedule rendered on the page.");
    }
  });
  