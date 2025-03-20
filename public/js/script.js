// Global variables to store only necessary data
let allClassesMap = {}; // Will be populated on-demand
let basicCourses = []; // Lightweight course data for dropdowns

document.addEventListener('DOMContentLoaded', async () => {
  // --- Only load basic course data for dropdowns ---
  try {
    const response = await fetch('/api/courses/basic');
    if (!response.ok) {
      throw new Error(`Error fetching courses: ${response.statusText}`);
    }
    const courses = await response.json();
    console.log("Fetched basic courses:", courses);
    basicCourses = courses;
    
    // Filter and sort majors and minors alphabetically
    const majors = courses
      .filter(course => course.course_type && course.course_type.toLowerCase() === "major")
      .sort((a, b) => a.course_name.localeCompare(b.course_name));
    
    const minors = courses
      .filter(course => course.course_type && course.course_type.toLowerCase() === "minor")
      .sort((a, b) => a.course_name.localeCompare(b.course_name));

    // Populate dropdowns (existing code)
    populateDropdowns(majors, minors, courses);
  } catch (error) {
    console.error("Error populating dropdowns:", error);
  }

  // --- Main Scheduling Process ---
  const generateButton = document.getElementById("calculate-schedule");
  if (generateButton) {
    generateButton.addEventListener('click', async (event) => {
      event.preventDefault();
      console.log("User selections starting schedule generation...");

      // Show loading indicator
      document.getElementById("calculate-schedule").textContent = "Generating...";
      document.getElementById("calculate-schedule").disabled = true;

      try {
        // Get selected course IDs from the hidden inputs
        const selectedMajor = Number(document.getElementById("selectedMajor").value);
        const selectedMinor1 = Number(document.getElementById("selectedMinor1").value);
        const selectedMinor2 = Number(document.getElementById("selectedMinor2").value);
        const selectedCourseIds = [selectedMajor, selectedMinor1, selectedMinor2].filter(id => !isNaN(id));
        
        const englishLevel = document.getElementById("english-level").value;
        const startSemester = document.getElementById("start-semester").value;
        const majorClassLimit = parseInt(document.getElementById("major-class-limit").value, 10);
        const fallWinterCredits = parseInt(document.getElementById("fall-winter-credits").value, 10);
        const springCredits = parseInt(document.getElementById("spring-credits").value, 10);
        
        console.log("User selections:", { selectedCourseIds, englishLevel, startSemester });

        // 1. Fetch only selected course details including their classes
        const selectedCourseData = await fetchSelectedCourseData(selectedCourseIds, englishLevel);
        
        // 2. Process the selected courses' data
        const processedData = processSelectedCourses(selectedCourseData);
        
        // 3. Generate schedule with only the relevant classes
        const schedule = await generateSchedule(
          processedData, 
          startSemester, 
          majorClassLimit, 
          fallWinterCredits, 
          springCredits
        );
        
        // 4. Display the schedule
        renderSchedule(schedule);
      } catch (error) {
        console.error("Error generating schedule:", error);
        alert("There was an error generating your schedule. Please try again.");
      } finally {
        // Reset button
        document.getElementById("calculate-schedule").textContent = "Generate Schedule";
        document.getElementById("calculate-schedule").disabled = false;
      }
    });
  }

  // --- New Helper Functions ---
  
  // Populate dropdowns with majors, minors and English levels
  function populateDropdowns(majors, minors, courses) {
    // Populate Major Dropdown
    const majorSelect = document.getElementById("majorSelect");
    if (majorSelect) {
      majorSelect.innerHTML = "<option value=''>Select a Major</option>";
      majors.forEach(major => {
        const option = document.createElement("option");
        option.value = major.id;
        option.textContent = major.course_name;
        majorSelect.appendChild(option);
      });
      
      majorSelect.addEventListener('change', () => {
        document.getElementById("selectedMajor").value = majorSelect.value;
      });
    }
    
    // Populate Minor 1 Dropdown
    const minor1Select = document.getElementById("minor1Select");
    if (minor1Select) {
      minor1Select.innerHTML = "<option value=''>Select Your First Minor</option>";
      minors.forEach(minor => {
        const option = document.createElement("option");
        option.value = minor.id;
        option.textContent = minor.course_name;
        minor1Select.appendChild(option);
      });
      
      minor1Select.addEventListener('change', () => {
        document.getElementById("selectedMinor1").value = minor1Select.value;
      });
    }
    
    // Populate Minor 2 Dropdown
    const minor2Select = document.getElementById("minor2Select");
    if (minor2Select) {
      minor2Select.innerHTML = "<option value=''>Select Your Second Minor</option>";
      minors.forEach(minor => {
        const option = document.createElement("option");
        option.value = minor.id;
        option.textContent = minor.course_name;
        minor2Select.appendChild(option);
      });
      
      minor2Select.addEventListener('change', () => {
        document.getElementById("selectedMinor2").value = minor2Select.value;
      });
    }
    
    // Populate English Level Dropdown
    const englishCourses = courses.filter(course =>
      course.course_type && course.course_type.toLowerCase() === "eil/holokai"
    );
    const englishLevelSelect = document.getElementById("english-level");
    if (englishLevelSelect) {
      englishLevelSelect.innerHTML = "";
      englishCourses.forEach(course => {
        const option = document.createElement("option");
        option.value = course.course_name;
        option.textContent = course.course_name;
        englishLevelSelect.appendChild(option);
      });
    }
  }
  
  // Fetch only the course data for selected courses and English level
  async function fetchSelectedCourseData(selectedCourseIds, englishLevel) {
    // Find the English course ID from basicCourses
    const selectedEnglishCourse = basicCourses.find(course => 
      course.course_name === englishLevel
    );
    
    if (!selectedEnglishCourse) {
      throw new Error("Selected English Level course not found");
    }

    // Add the English course ID to the list of selected courses
    const allSelectedIds = [...selectedCourseIds, selectedEnglishCourse.id];
    
    // Also fetch religion courses (if not already included)
    const religionCourses = basicCourses.filter(course => 
      course.course_type && course.course_type.toLowerCase() === "religion"
    );
    
    religionCourses.forEach(course => {
      if (!allSelectedIds.includes(course.id)) {
        allSelectedIds.push(course.id);
      }
    });
    
    console.log("Fetching data for selected courses:", allSelectedIds);
    
    // Fetch complete course data for selected courses
    const selectedCourseDetailsPromises = allSelectedIds.map(id => 
      fetch(`/api/courses/${id}`).then(res => {
        if (!res.ok) throw new Error(`Error fetching course ${id}: ${res.statusText}`);
        return res.json();
      })
    );
    
    return await Promise.all(selectedCourseDetailsPromises);
  }

  // Process the selected course data into classes for scheduling
  function processSelectedCourses(selectedCourseData) {
    let allRequiredClasses = [];
    let allElectiveSections = []; // Track elective sections
    let prerequisiteIds = new Set();
    
    // Process each course to extract classes and identify prerequisites
    selectedCourseData.forEach(course => {
      const isMajor = course.course_type && course.course_type.toLowerCase() === "major";
      const category = getCategory(course.course_type);
      
      // Extract classes and section info from the course
      const extractedData = extractClasses(course, isMajor, category);
      const courseClasses = extractedData.classes;
      const sections = extractedData.sections;
      
      // Add course ID to each class for reference
      const classesWithCourseId = courseClasses.map(cls => ({...cls, course_id: course.id}));
      
      // Separate required and elective classes
      const requiredClasses = classesWithCourseId.filter(cls => 
        cls.is_required_section === true || cls.is_required === true);
      
      const electiveClasses = classesWithCourseId.filter(cls => 
        cls.is_required_section === false && cls.is_required !== true);
      
      // Group elective classes by section for selection
      const electiveSectionMap = {};
      electiveClasses.forEach(cls => {
        if (!cls.sectionId) return;
        
        if (!electiveSectionMap[cls.sectionId]) {
          const sectionInfo = sections.find(s => s.id === cls.sectionId) || {
            creditsNeeded: 0,
            name: cls.sectionName
          };
          
          electiveSectionMap[cls.sectionId] = {
            id: cls.sectionId,
            name: cls.sectionName,
            creditsNeeded: sectionInfo.creditsNeeded,
            classes: []
          };
        }
        
        electiveSectionMap[cls.sectionId].classes.push(cls);
      });
      
      // Add to our collections
      allRequiredClasses = [...allRequiredClasses, ...requiredClasses];
      
      // Add elective sections to our collection
      Object.values(electiveSectionMap).forEach(section => {
        if (section.creditsNeeded > 0 && section.classes.length > 0) {
          allElectiveSections.push(section);
        }
      });
      
      // Identify prerequisites
      requiredClasses.forEach(cls => {
        if (cls.prerequisites && cls.prerequisites.length > 0) {
          cls.prerequisites.forEach(prereqId => {
            const id = typeof prereqId === 'object' ? (prereqId.id || prereqId.class_id) : prereqId;
            if (id) prerequisiteIds.add(id);
          });
        }
      });
    });
    
    return {
      requiredClasses: allRequiredClasses,
      electiveSections: allElectiveSections,
      prerequisiteIds: Array.from(prerequisiteIds)
    };
  }
  
  function getCategory(courseType) {
    if (!courseType) return '';
    const type = courseType.toLowerCase();
    if (type === "major") return "major";
    if (type === "minor") return "minor";
    if (type === "religion") return "religion";
    if (type === "eil/holokai") return "english";
    return type;
  }

  // Extract classes from a course object, handling sections correctly
  function extractClasses(course, isMajor = false, category = '') {
    let classes = [];
    let sectionInfo = []; // Track section requirements
    
    // Handle courses with direct classes array
    if (Array.isArray(course.classes)) {
      // If no sections, treat all direct classes as required
      classes = [...course.classes];
      classes.forEach(cls => {
        cls.is_required = true; // Mark as required
        cls.sectionName = "Main";
      });
    } 
    // Handle courses with sections containing classes
    else if (Array.isArray(course.sections)) {
      course.sections.forEach(section => {
        if (Array.isArray(section.classes)) {
          const isRequired = section.is_required === true;
          const creditsNeeded = section.credits_needed_to_take || 0;
          
          // Add section info to classes
          const sectionClasses = section.classes.map(cls => ({
            ...cls,
            sectionId: section.id,
            sectionName: section.section_name || section.name || "Unnamed Section",
            is_required_section: isRequired,
            section_credits_needed: creditsNeeded
          }));
          
          // Add section metadata to our tracker
          sectionInfo.push({
            id: section.id,
            name: section.section_name || section.name || "Unnamed Section",
            isRequired: isRequired,
            creditsNeeded: creditsNeeded,
            totalClasses: sectionClasses.length,
            totalCredits: sectionClasses.reduce((sum, cls) => sum + (cls.credits || 3), 0)
          });
          
          classes = [...classes, ...sectionClasses];
        }
      });
    }
    
    // Enrich classes with additional metadata
    return {
      classes: classes.map(cls => ({
        ...cls,
        isMajor: isMajor,
        category: category,
        course_name: course.course_name,
        course_type: course.course_type
      })),
      sections: sectionInfo
    };
  }

  // Add this helper function for computing class dependencies
  function computeDepthMap(classes) {
    // Create a map of classes by ID for quick lookups
    const classesById = {};
    classes.forEach(cls => {
      classesById[cls.id] = cls;
    });
    
    // Calculate depth (how many prerequisites deep each class is)
    const depthMap = {};
    
    function calculateDepth(classId) {
      // Return cached result if already calculated
      if (depthMap[classId] !== undefined) {
        return depthMap[classId];
      }
      
      const cls = classesById[classId];
      if (!cls) {
        return 0; // Class not found
      }
      
      // No prerequisites means depth 0
      if (!cls.prerequisites || !Array.isArray(cls.prerequisites) || cls.prerequisites.length === 0) {
        depthMap[classId] = 0;
        return 0;
      }
      
      // Calculate maximum depth of prerequisites + 1
      let maxPrereqDepth = -1;
      cls.prerequisites.forEach(prereqId => {
        const id = typeof prereqId === 'object' ? (prereqId.id || prereqId.class_id) : prereqId;
        if (id) {
          const depth = calculateDepth(id);
          maxPrereqDepth = Math.max(maxPrereqDepth, depth);
        }
      });
      
      depthMap[classId] = maxPrereqDepth + 1;
      return depthMap[classId];
    }
    
    // Calculate depth for all classes
    classes.forEach(cls => {
      if (cls.id && depthMap[cls.id] === undefined) {
        calculateDepth(cls.id);
      }
    });
    
    return depthMap;
  }

  // Your existing helper functions (isReligionClass, extractClasses, etc.)
  // ...

  // Generate schedule with only relevant classes
  async function generateSchedule(
    processedData, 
    startSemester,
    majorClassLimit,
    fallWinterCredits,
    springCredits
  ) {
    const { requiredClasses, electiveSections, prerequisiteIds } = processedData;
    
    // Choose elective classes from sections based on prerequisites and credit requirements
    let selectedElectiveClasses = [];
    
    // First, fetch any missing prerequisites
    const missingPrereqs = prerequisiteIds.filter(id => 
      !requiredClasses.some(cls => cls.id === id) && 
      !selectedElectiveClasses.some(cls => cls.id === id)
    );
    
    // Fetch missing prerequisites (using existing code)
    // ...
    
    // Process elective sections - select classes to meet credit requirements
    electiveSections.forEach(section => {
      const sectionClasses = [...section.classes];
      const creditsNeeded = section.creditsNeeded;
      let creditsSelected = 0;
      
      // Sort electives by level (higher level first, assume more specialized/advanced)
      sectionClasses.sort((a, b) => {
        const aLevel = a.class_number ? parseInt(a.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
        const bLevel = b.class_number ? parseInt(b.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
        return bLevel - aLevel;
      });
      
      // Select classes until we meet the credit requirement
      for (const cls of sectionClasses) {
        if (creditsSelected >= creditsNeeded) break;
        
        const credits = cls.credits || 3;
        selectedElectiveClasses.push(cls);
        creditsSelected += credits;
      }
    });
    
    // Combine required and selected elective classes for scheduling
    const combinedClasses = [...requiredClasses, ...selectedElectiveClasses];
    
    // Build a map of all classes for quick lookup
    let classMap = {};
    combinedClasses.forEach(cls => {
      classMap[cls.id] = cls;
    });
    
    // Sort classes based on prerequisites
    const sortedClasses = sortClassesByPrerequisites(combinedClasses, classMap);
    
    // Generate schedule with existing createSchedule function
    const schedule = createSchedule(
      sortedClasses,
      startSemester, 
      majorClassLimit, 
      fallWinterCredits, 
      springCredits
    );
    
    return schedule;
  }
  
  // Helper function to sort classes based on prerequisites
  function sortClassesByPrerequisites(classes, classMap) {
    // Create a graph representation with classes as nodes
    const graph = {};
    classes.forEach(cls => {
      graph[cls.id] = {
        class: cls,
        dependents: [],
        prereqCount: 0
      };
    });
    
    // Track prerequisites and their dependents
    classes.forEach(cls => {
      if (cls.prerequisites && Array.isArray(cls.prerequisites)) {
        cls.prerequisites.forEach(prereqId => {
          const id = typeof prereqId === 'object' ? (prereqId.id || prereqId.class_id) : prereqId;
          if (id && graph[id]) {
            graph[id].dependents.push(cls.id);
            graph[cls.id].prereqCount++;
          }
        });
      }
    });
    
    // Topologically sort classes based on prerequisites
    const result = [];
    const noPrereqs = Object.values(graph)
      .filter(node => node.prereqCount === 0)
      .map(node => node.class);
    
    // Start with classes that have no prerequisites
    const queue = [...noPrereqs];
    
    // Process classes one by one
    while (queue.length > 0) {
      const currentClass = queue.shift();
      result.push(currentClass);
      
      // Remove this class as a prerequisite for others
      const node = graph[currentClass.id];
      if (node && node.dependents) {
        node.dependents.forEach(dependentId => {
          graph[dependentId].prereqCount--;
          if (graph[dependentId].prereqCount === 0) {
            queue.push(graph[dependentId].class);
          }
        });
      }
    }
    
    // Add any remaining classes (for circular dependencies)
    classes.forEach(cls => {
      if (!result.includes(cls)) {
        result.push(cls);
      }
    });
    
    return result;
  }
  
  // Create a schedule with classes assigned to semesters
  function createSchedule(sortedClasses, startSemester, majorClassLimit, fallWinterCredits, springCredits) {
    const semesters = [];
    let currentSemester = startSemester;
    
    // Group classes into semesters based on prerequisites and credit limits
    let remainingClasses = [...sortedClasses];
    
    // Set a reasonable limit to prevent infinite loops
    const MAX_SEMESTERS = 20;
    
    // Extract and prioritize EIL/English classes
    const eilClasses = remainingClasses.filter(cls => 
      cls.category === 'english' || 
      (cls.course_type && cls.course_type.toLowerCase().includes('eil'))
    );
    
    // EIL classes that must be scheduled in first 3 semesters
    const earlyEilClasses = [...eilClasses];
    
    // Continue until all classes are scheduled or we hit the maximum semester limit
    while (remainingClasses.length > 0 && semesters.length < MAX_SEMESTERS) {
      const semType = getSemesterType(currentSemester);
      const creditLimit = semType === 'Spring' ? springCredits : fallWinterCredits;
      
      // Special handling for first 3 semesters - prioritize EIL classes
      if (semesters.length < 3 && earlyEilClasses.length > 0) {
        const classesForSemester = assignClassesToSemesterWithPriority(
          remainingClasses,
          semesters,
          creditLimit,
          majorClassLimit,
          earlyEilClasses
        );
        
        // Remove scheduled EIL classes from the priority list
        classesForSemester.forEach(cls => {
          const eilIndex = earlyEilClasses.findIndex(eilCls => eilCls.id === cls.id);
          if (eilIndex !== -1) {
            earlyEilClasses.splice(eilIndex, 1);
          }
        });
        
        // Add semester to schedule
        semesters.push({
          name: currentSemester,
          type: semType,
          classes: classesForSemester
        });
        
        // Remove scheduled classes from remaining
        remainingClasses = remainingClasses.filter(
          cls => !classesForSemester.includes(cls)
        );
      } 
      // Force any remaining EIL classes in semester 3 if needed - BUT ONLY IF PREREQUISITES ARE MET
      else if (semesters.length === 3 && earlyEilClasses.length > 0) {
        // Get all previously completed classes for prerequisite checking
        const completedClasses = semesters.flatMap(sem => sem.classes);
        const completedClassIds = new Set(completedClasses.map(cls => cls.id));
        
        // Filter EIL classes whose prerequisites have been met
        const eligibleEilClasses = earlyEilClasses.filter(cls => {
          if (!cls.prerequisites || !Array.isArray(cls.prerequisites) || cls.prerequisites.length === 0) {
            return true;
          }
          
          return cls.prerequisites.every(prereq => {
            const prereqId = typeof prereq === 'object' ? (prereq.id || prereq.class_id) : prereq;
            return completedClassIds.has(prereqId);
          });
        });
        
        // Get classes we can take this semester (normally)
        let classesForSemester = assignClassesToSemester(
          remainingClasses.filter(cls => !eligibleEilClasses.includes(cls)),
          semesters,
          creditLimit - (eligibleEilClasses.reduce((sum, cls) => sum + (cls.credits || 3), 0)),
          majorClassLimit
        );
        
        // Only force add eligible EIL classes
        classesForSemester = [...classesForSemester, ...eligibleEilClasses];
        
        // Add semester to schedule
        semesters.push({
          name: currentSemester,
          type: semType,
          classes: classesForSemester,
          hasForced: eligibleEilClasses.length > 0
        });
        
        // Remove scheduled classes from remaining
        remainingClasses = remainingClasses.filter(
          cls => !classesForSemester.includes(cls)
        );
        
        // Remove scheduled EIL classes from the priority list
        eligibleEilClasses.forEach(cls => {
          const eilIndex = earlyEilClasses.findIndex(eilCls => eilCls.id === cls.id);
          if (eilIndex !== -1) {
            earlyEilClasses.splice(eilIndex, 1);
          }
        });
      }
      // Normal scheduling for remaining semesters
      else {
        const classesForSemester = assignClassesToSemester(
          remainingClasses,
          semesters,
          creditLimit,
          majorClassLimit
        );
        
        // If we couldn't assign any classes, break to avoid infinite loop
        if (classesForSemester.length === 0 && remainingClasses.length > 0) {
          console.warn("Could not schedule any more classes - possible prerequisite issue");
          break;
        }
        
        semesters.push({
          name: currentSemester,
          type: semType,
          classes: classesForSemester
        });
        
        remainingClasses = remainingClasses.filter(
          cls => !classesForSemester.includes(cls)
        );
      }
      
      // Advance to next semester
      currentSemester = getNextSemester(currentSemester);
    }
    
    // If we hit the semester limit and still have classes, show warning
    if (remainingClasses.length > 0) {
      console.warn(`Schedule generation stopped after ${MAX_SEMESTERS} semesters with ${remainingClasses.length} classes unscheduled`);
      
      // Add unscheduled classes to a final semester
      semesters.push({
        name: "Unscheduled Classes",
        type: "Warning",
        classes: remainingClasses,
        isWarning: true
      });
    }
    
    return semesters;
  }
  
  // New function to assign classes with priority items
  function assignClassesToSemesterWithPriority(availableClasses, completedSemesters, creditLimit, majorClassLimit, priorityClasses) {
    // Get eligible classes as in the original function
    const completedClasses = completedSemesters.flatMap(sem => sem.classes);
    const completedClassIds = new Set(completedClasses.map(cls => cls.id));
    
    // Filter eligible classes whose prerequisites have been met
    const eligibleClasses = availableClasses.filter(cls => {
      if (!cls.prerequisites || !Array.isArray(cls.prerequisites) || cls.prerequisites.length === 0) {
        return true;
      }
      
      return cls.prerequisites.every(prereq => {
        const prereqId = typeof prereq === 'object' ? (prereq.id || prereq.class_id) : prereq;
        return completedClassIds.has(prereqId);
      });
    });
    
    // First, find eligible priority classes (EIL classes with prerequisites met)
    const eligiblePriorityClasses = priorityClasses.filter(cls => 
      eligibleClasses.some(eligible => eligible.id === cls.id)
    );
    
    // Start with priority classes BUT limit to 3 EIL classes
    const selectedClasses = [];
    let currentCredits = 0;
    let majorClassesCount = 0;
    let eilClassesCount = 0; // Track EIL/English classes count
    
    // Process priority classes first (with EIL limit)
    for (const cls of eligiblePriorityClasses) {
      if (eilClassesCount >= 3) break; // Stop adding EIL classes once we hit 3
      
      const credits = cls.credits || 3;
      
      // Skip if adding this class would exceed credit limit
      if (currentCredits + credits > creditLimit) {
        continue;
      }
      
      // Add class to semester
      selectedClasses.push(cls);
      currentCredits += credits;
      eilClassesCount++; // Increment EIL count (all priority classes are EIL)
      
      // Increment major class count if applicable
      if (cls.isMajor) {
        majorClassesCount++;
      }
      
      // Stop if we've reached credit limit
      if (currentCredits >= creditLimit) {
        break;
      }
    }
    
    // If we have space, fill with other classes
    const remainingEligibleClasses = eligibleClasses.filter(cls => 
      !selectedClasses.some(selected => selected.id === cls.id)
    );
    
    // Sort normal classes by same priority as original function
    remainingEligibleClasses.sort((a, b) => {
      // First priority: Required vs elective
      if (a.is_elective !== b.is_elective) {
        return a.is_elective ? 1 : -1;
      }
      
      // Second priority: Major vs others
      if (a.isMajor !== b.isMajor) {
        return a.isMajor ? -1 : 1;
      }
      
      // Third priority: Level (higher number courses typically harder/deeper)
      const aLevel = a.class_number ? parseInt(a.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
      const bLevel = b.class_number ? parseInt(b.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
      return bLevel - aLevel;
    });
    
    // Fill remaining slots
    for (const cls of remainingEligibleClasses) {
      const credits = cls.credits || 3;
      
      // Skip if adding this class would exceed credit limit
      if (currentCredits + credits > creditLimit) {
        continue;
      }
      
      // Skip if this is a major class and we've reached the major class limit
      if (cls.isMajor && majorClassesCount >= majorClassLimit) {
        continue;
      }
      
      // Skip if this is an English/EIL class and we've reached the limit
      if ((cls.category === 'english' || 
          (cls.course_type && cls.course_type.toLowerCase().includes('eil'))) && 
          eilClassesCount >= 3) {
        continue;
      }
      
      // Add class to semester
      selectedClasses.push(cls);
      currentCredits += credits;
      
      // Increment counters
      if (cls.isMajor) {
        majorClassesCount++;
      }
      if (cls.category === 'english' || 
          (cls.course_type && cls.course_type.toLowerCase().includes('eil'))) {
        eilClassesCount++;
      }
      
      // Stop if we've reached credit limit
      if (currentCredits >= creditLimit) {
        break;
      }
    }
    
    return selectedClasses;
  }
  
  // Add renderSchedule function
  function renderSchedule(schedule) {
    const scheduleContainer = document.getElementById('schedule-container');
    if (!scheduleContainer) return;
    
    // Remove the 'hidden' class to make the schedule visible
    scheduleContainer.classList.remove('hidden');
    
    // Clear previous schedule
    scheduleContainer.innerHTML = '';
    
    if (schedule.length === 0) {
      scheduleContainer.innerHTML = '<div class="empty-schedule">No classes to schedule. Please select a major or minor.</div>';
      return;
    }
    
    // Create the summary boxes
    const summaryBox = document.createElement('div');
    summaryBox.className = 'summary-box';
    summaryBox.id = 'summary';
    
    // Calculate total credits
    const totalCredits = schedule.reduce((sum, semester) => {
      return sum + semester.classes.reduce((semSum, cls) => semSum + (cls.credits || 3), 0);
    }, 0);
    
    // Get graduation date (last semester)
    const graduationSemester = schedule[schedule.length - 1].name;
    
    // Calculate elective credits (assuming 120 credits are needed to graduate)
    const requiredCredits = 120;
    const electiveCreditsNeeded = Math.max(0, requiredCredits - totalCredits);
    
    // Create summary items
    summaryBox.innerHTML = `
      <div class="summary-item animated-box" id="total-credits-box">
        <p>Total Credits Taken</p>
        <h2 id="total-credits">${totalCredits}</h2>
      </div>
      <div class="summary-item animated-box" id="graduation-date-box">
        <p>Graduation Date</p>
        <h2 id="graduation-date">${graduationSemester}</h2>
      </div>
      <div class="summary-item animated-box" id="electives-needed-box">
        <p>Elective Credits Needed</p>
        <h2 id="electives-needed">${electiveCreditsNeeded}</h2>
      </div>
    `;
    
    // Add summary box to the container
    scheduleContainer.appendChild(summaryBox);
    
    // Create schedule display
    const scheduleTable = document.createElement('div');
    scheduleTable.className = 'schedule-table';
    
    // Add each semester
    schedule.forEach(semester => {
      const semesterDiv = document.createElement('div');
      semesterDiv.className = semester.isWarning ? 'semester-card warning' : 'semester-card';
      
      // Semester header
      const semesterHeader = document.createElement('div');
      semesterHeader.className = 'semester-header';
      semesterHeader.textContent = semester.name;
      semesterDiv.appendChild(semesterHeader);
      
      // Add warning message if applicable
      if (semester.isWarning) {
        const warningMsg = document.createElement('div');
        warningMsg.className = 'warning-message';
        warningMsg.textContent = "Some classes couldn't be scheduled due to complex prerequisites or schedule constraints.";
        semesterDiv.appendChild(warningMsg);
      }
      
      // Add note if we forced EIL classes into this semester
      if (semester.hasForced) {
        const noteMsg = document.createElement('div');
        noteMsg.className = 'note-message';
        noteMsg.textContent = "Note: EIL/English classes prioritized in early semesters.";
        semesterDiv.appendChild(noteMsg);
      }
      
      // Semester classes
      const classesList = document.createElement('ul');
      classesList.className = 'classes-list';
      
      semester.classes.forEach(cls => {
        const classItem = document.createElement('li');
        classItem.className = 'class-item';
        
        // Class type indicator (major, minor, etc)
        const categoryTag = cls.isMajor ? 'major' : 
                           (cls.category === 'english' ? 'english' :
                           (cls.category === 'religion' ? 'religion' : 'minor'));
        
        classItem.innerHTML = `
          <span class="class-tag ${categoryTag}">${categoryTag.charAt(0).toUpperCase() + categoryTag.slice(1)}</span>
          <span class="class-number">${cls.class_number || ''}</span>
          <span class="class-name">${cls.class_name}</span>
          <span class="class-credits">${cls.credits || 3} cr</span>
        `;
        
        classesList.appendChild(classItem);
      });
      
      semesterDiv.appendChild(classesList);
      
      // Add semester credits
      const semesterCredits = semester.classes.reduce((sum, cls) => sum + (cls.credits || 3), 0);
      const creditsDiv = document.createElement('div');
      creditsDiv.className = 'semester-credits';
      creditsDiv.textContent = `Total: ${semesterCredits} credits`;
      semesterDiv.appendChild(creditsDiv);
      
      scheduleTable.appendChild(semesterDiv);
    });
    
    scheduleContainer.appendChild(scheduleTable);
  }
});

// Get the type of semester (Fall, Winter, Spring)
function getSemesterType(semesterName) {
  if (semesterName.includes('Fall')) return 'Fall';
  if (semesterName.includes('Winter')) return 'Winter';
  if (semesterName.includes('Spring')) return 'Spring';
  return 'Unknown';
}

// Get the next semester in sequence
function getNextSemester(currentSemester) {
  const parts = currentSemester.split(' ');
  const currentType = parts[0];
  let year = parseInt(parts[1], 10);
  
  switch(currentType) {
    case 'Fall':
      return `Winter ${year + 1}`;
    case 'Winter':
      return `Spring ${year}`;
    case 'Spring':
      return `Fall ${year}`;
    default:
      return `Fall ${year}`;
  }
}

// Assign classes to semester (normal algorithm)
function assignClassesToSemester(availableClasses, completedSemesters, creditLimit, majorClassLimit) {
  // Get eligible classes (prerequisites satisfied)
  const completedClasses = completedSemesters.flatMap(sem => sem.classes);
  const completedClassIds = new Set(completedClasses.map(cls => cls.id));
  
  // Filter classes whose prerequisites have been met
  const eligibleClasses = availableClasses.filter(cls => {
    if (!cls.prerequisites || !Array.isArray(cls.prerequisites) || cls.prerequisites.length === 0) {
      return true;
    }
    
    return cls.prerequisites.every(prereq => {
      const prereqId = typeof prereq === 'object' ? (prereq.id || prereq.class_id) : prereq;
      return completedClassIds.has(prereqId);
    });
  });
  
  // Sort classes by priority (required before elective, major before minor, higher level first)
  eligibleClasses.sort((a, b) => {
    // First priority: Required vs elective
    if (a.is_elective !== b.is_elective) {
      return a.is_elective ? 1 : -1;
    }
    
    // Second priority: Major vs others
    if (a.isMajor !== b.isMajor) {
      return a.isMajor ? -1 : 1;
    }
    
    // Third priority: Level (higher number courses typically harder/deeper)
    const aLevel = a.class_number ? parseInt(a.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
    const bLevel = b.class_number ? parseInt(b.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
    return bLevel - aLevel;
  });
  
  // Fill the semester following constraints
  const selectedClasses = [];
  let currentCredits = 0;
  let majorClassesCount = 0;
  let eilClassesCount = 0; // Track EIL/English classes count
  
  for (const cls of eligibleClasses) {
    const credits = cls.credits || 3;
    
    // Skip if adding this class would exceed credit limit
    if (currentCredits + credits > creditLimit) {
      continue;
    }
    
    // Skip if this is a major class and we've reached the major class limit
    if (cls.isMajor && majorClassesCount >= majorClassLimit) {
      continue;
    }
    
    // Skip if this is an English/EIL class and we've reached the limit
    if ((cls.category === 'english' || 
        (cls.course_type && cls.course_type.toLowerCase().includes('eil'))) && 
        eilClassesCount >= 3) {
      continue;
    }
    
    // Add class to semester
    selectedClasses.push(cls);
    currentCredits += credits;
    
    // Increment counters
    if (cls.isMajor) {
      majorClassesCount++;
    }
    if (cls.category === 'english' || 
       (cls.course_type && cls.course_type.toLowerCase().includes('eil'))) {
      eilClassesCount++;
    }
    
    // Stop if we've reached credit limit
    if (currentCredits >= creditLimit) {
      break;
    }
  }
  
  return selectedClasses;
}

// Close search results when clicking outside
document.addEventListener('click', function(event) {
    // Check if the click was outside the search groups
    const isClickInsideMajorSearch = 
        document.getElementById('major-search-group')?.contains(event.target) || false;
    const isClickInsideMinor1Search = 
        document.getElementById('minor1-search-group')?.contains(event.target) || false;
    const isClickInsideMinor2Search = 
        document.getElementById('minor2-search-group')?.contains(event.target) || false;
    
    // If click was outside all search areas
    if (!isClickInsideMajorSearch && !isClickInsideMinor1Search && !isClickInsideMinor2Search) {
        // Hide all search results
        const majorResults = document.getElementById('majorSearchResults');
        const minor1Results = document.getElementById('minor1SearchResults');
        const minor2Results = document.getElementById('minor2SearchResults');
        
        if (majorResults) majorResults.style.display = 'none';
        if (minor1Results) minor1Results.style.display = 'none';
        if (minor2Results) minor2Results.style.display = 'none';
    }
});

/* Add click-outside functionality with JavaScript */
document.addEventListener('click', function(event) {
  // Check if click was outside search groups
  const searchGroups = [
      'major-search-group', 
      'minor1-search-group', 
      'minor2-search-group'
  ];
  
  // If click wasn't inside any search group
  const isClickInsideSearchGroup = searchGroups.some(id => {
      const element = document.getElementById(id);
      return element && element.contains(event.target);
  });
  
  if (!isClickInsideSearchGroup) {
      // Hide all search results
      for (const id of ['majorSearchResults', 'minor1SearchResults', 'minor2SearchResults']) {
          const results = document.getElementById(id);
          if (results) results.style.display = 'none';
      }
  }
});

// Modify your existing search functions to show results
function setupSearchInputs() {
    // For each search input (majorSearchInput, minor1SearchInput, etc.)
    // When input changes, show search results
    const searchInputs = [
        { input: 'majorSearchInput', results: 'majorSearchResults' },
        { input: 'minor1SearchInput', results: 'minor1SearchResults' },
        { input: 'minor2SearchInput', results: 'minor2SearchResults' }
    ];
    
    searchInputs.forEach(search => {
        const input = document.getElementById(search.input);
        const resultsList = document.getElementById(search.results);
        
        if (input && resultsList) {
            input.addEventListener('input', function() {
                // Show results below input when typing
                if (this.value.trim() !== '') {
                    resultsList.style.display = 'block';
                    // Your existing search logic
                } else {
                    resultsList.style.display = 'none';
                }
            });
        }
    });
}
