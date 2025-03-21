// Function to compute the depth map of class prerequisites
function computeDepthMap(classes) {
  // Create a map of classes by ID for quick lookups
  const classesById = {};
  classes.forEach(cls => {
    if (cls && cls.id) classesById[cls.id] = cls;
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
    cls.prerequisites.forEach(prereq => {
      const id = typeof prereq === 'object' ? (prereq.id || prereq.class_id) : prereq;
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
    if (cls && cls.id && depthMap[cls.id] === undefined) {
      calculateDepth(cls.id);
    }
  });
  
  return depthMap;
}

// Function to sort classes based on prerequisites depth - keep outside DOMContentLoaded
function sortClassesByPrerequisites(classes) {
  // First compute the depth map (how many levels of prerequisites deep)
  const depthMap = computeDepthMap(classes);
  
  // Sort classes by depth, then by level
  return [...classes].sort((a, b) => {
    // First priority: prerequisite depth
    const depthA = depthMap[a.id] || 0;
    const depthB = depthMap[b.id] || 0;
    if (depthA !== depthB) return depthA - depthB;
    
    // Second priority: class level
    const levelA = a.class_number ? parseInt(a.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
    const levelB = b.class_number ? parseInt(b.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
    return levelA - levelB;
  });
}

// Function to check if class and coreqs can be added
function canAddClassWithCorequisites(
  cls, 
  selectedClasses, 
  classesById, 
  corequisiteMap, 
  currentCredits, 
  majorClassesCount, 
  eilClassesCount, 
  creditLimit, 
  majorClassLimit
) {
  // Start with the class itself
  let requiredCredits = cls.credits || 3;
  let requiredMajorCount = cls.isMajor ? 1 : 0;
  let requiredEILCount = (cls.category === 'english' || 
    (cls.course_type && cls.course_type.toLowerCase().includes('eil'))) ? 1 : 0;
  
  // Get corequisites and handle missing ones gracefully
  const coreqs = corequisiteMap[cls.id] || [];
  const coreqClasses = [];
  
  for (const coreqId of coreqs) {
    const coreq = classesById[coreqId];
    if (coreq && !selectedClasses.includes(coreq)) {
      coreqClasses.push(coreq);
      requiredCredits += (coreq.credits || 3);
      if (coreq.isMajor) requiredMajorCount++;
      if (coreq.category === 'english' || 
          (coreq.course_type && coreq.course_type.toLowerCase().includes('eil'))) {
        requiredEILCount++;
      }
    } else if (!coreq) {
      // Missing corequisite - log a warning but continue
      console.warn(`Missing corequisite (ID: ${coreqId}) for class ${cls.id} (${cls.class_name || 'unnamed'})`);
    }
  }
  
  // Check if adding these classes would exceed limits
  if (currentCredits + requiredCredits > creditLimit) {
    return {
      canAdd: false,
      reason: "Credit limit exceeded",
      coreqClasses: []
    };
  }
  
  if (majorClassesCount + requiredMajorCount > majorClassLimit) {
    return {
      canAdd: false,
      reason: "Major class limit exceeded",
      coreqClasses: []
    };
  }
  
  if (eilClassesCount + requiredEILCount > 3) {
    return {
      canAdd: false,
      reason: "EIL class limit exceeded",
      coreqClasses: []
    };
  }
  
  return {
    canAdd: true,
    coreqClasses,
    addedCredits: requiredCredits,
    addedMajors: requiredMajorCount,
    addedEIL: requiredEILCount
  };
}

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
    
    // Track all class IDs for corequisite resolution
    const classesById = {};
    
    // First pass: collect all classes and build the classesById map
    selectedCourseData.forEach(course => {
      const isMajor = course.course_type && course.course_type.toLowerCase() === "major";
      const category = getCategory(course.course_type);
      
      // Extract classes and section info from the course
      const extractedData = extractClasses(course, isMajor, category);
      const courseClasses = extractedData.classes;
      
      // Add all classes to the lookup map
      courseClasses.forEach(cls => {
        if (cls && cls.id) {
          classesById[cls.id] = cls;
        }
      });
    });
    
    // Second pass: process classes and handle elective sections
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
            const id = typeof prereqId === 'object' ? (prereqId.id || prereq.class_id) : prereqId;
            if (id) prerequisiteIds.add(id);
          });
        }
      });
    });
    
    // NEW CODE: Collect corequisites for required classes
    const corequisitesToFetch = new Set();
    const requiredClassMap = {};
    
    // Track all required classes by ID for quick lookup
    allRequiredClasses.forEach(cls => {
      requiredClassMap[cls.id] = cls;
    });
    
    // Find corequisites we need to add
    allRequiredClasses.forEach(cls => {
      if (cls.corequisites && Array.isArray(cls.corequisites)) {
        cls.corequisites.forEach(coreqId => {
          const id = typeof coreqId === 'object' ? (coreqId.id || coreqId.class_id) : coreqId;
          
          // If corequisite isn't already in our required classes list, add it to fetch list
          if (id && !requiredClassMap[id] && !classesById[id]) {
            corequisitesToFetch.add(id);
          }
        });
      }
    });
    
    // Log the corequisites we need to fetch
    if (corequisitesToFetch.size > 0) {
      console.log("Required classes have corequisites that need to be fetched:", 
        Array.from(corequisitesToFetch));
    }
    
    return {
      requiredClasses: allRequiredClasses,
      electiveSections: allElectiveSections,
      prerequisiteIds: Array.from(prerequisiteIds),
      corequisiteIdsToFetch: Array.from(corequisitesToFetch)  // Add these to the return value
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
        const id = typeof prereqId === 'object' ? (prereqId.id || prereq.class_id) : prereqId;
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
    const { requiredClasses, electiveSections, prerequisiteIds, corequisiteIdsToFetch } = processedData;
    
    // Fetch corequisites for required classes (NEW CODE)
    const requiredCorequisites = [];
    if (corequisiteIdsToFetch && corequisiteIdsToFetch.length > 0) {
      for (const coreqId of corequisiteIdsToFetch) {
        try {
          const response = await fetch(`/api/classes/${coreqId}`);
          if (response.ok) {
            const coreq = await response.json();
            requiredCorequisites.push(coreq);
          } else {
            console.warn(`Required class corequisite ${coreqId} not found, scheduling may be incomplete`);
          }
        } catch (error) {
          console.warn(`Error fetching required class corequisite ${coreqId}: ${error.message}`);
        }
      }
    }
    
    // Add the fetched corequisites to the required classes list
    const allRequiredClasses = [...requiredClasses, ...requiredCorequisites];
    
    // Create a map to collect all selected elective classes (including their corequisites)
    const selectedElectiveClassesMap = new Map();
    
    // Step 1: Process each elective section independently 
    for (const section of electiveSections) {
      // *** NEW CODE: Filter out unschedulable classes (empty semesters_offered) ***
      const sectionClasses = section.classes.filter(cls => 
        cls.semesters_offered && Array.isArray(cls.semesters_offered) && cls.semesters_offered.length > 0
      );
      
      const creditsNeeded = section.creditsNeeded;
      let creditsSelected = 0;
      
      console.log(`Processing elective section: ${section.name} (${creditsNeeded} credits needed)`);
      console.log(`Found ${sectionClasses.length} schedulable classes out of ${section.classes.length} total`);
      
      // Create a temporary class map for this section
      const tempClassesById = {};
      sectionClasses.forEach(cls => {
        if (cls && cls.id) tempClassesById[cls.id] = cls;
      });
      
      // Process each class in the section in order
      for (const mainClass of sectionClasses) {
        // Skip if we've already met the credit requirement
        if (creditsSelected >= creditsNeeded) break;
        
        // Skip if this class has already been selected
        if (selectedElectiveClassesMap.has(mainClass.id)) continue;
        
        // Get the corequisite IDs for this class
        const coreqIds = mainClass.corequisites && Array.isArray(mainClass.corequisites)
          ? mainClass.corequisites.map(coreqId => 
              typeof coreqId === 'object' ? (coreqId.id || coreqId.class_id) : coreqId
            )
          : [];
        
        // Track corequisites we need to fetch that aren't already in this section
        const coreqsToFetch = [];
        
        // Calculate total credits for this class and its known corequisites
        let totalCredits = mainClass.credits || 3;
        
        // Look for corequisites within the section classes first
        coreqIds.forEach(coreqId => {
          const coreq = tempClassesById[coreqId];
          if (coreq) {
            totalCredits += (coreq.credits || 3);
          } else {
            // We'll need to fetch this corequisite
            coreqsToFetch.push(coreqId);
          }
        });
        
        // Fetch any needed corequisites
        const fetchedCoreqs = [];
        if (coreqsToFetch.length > 0) {
          // Fetch each corequisite and update total credits
          for (const coreqId of coreqsToFetch) {
            try {
              const response = await fetch(`/api/classes/${coreqId}`);
              if (response.ok) {
                const coreq = await response.json();
                
                // *** NEW CODE: Check if corequisite is schedulable ***
                if (!coreq.semesters_offered || !Array.isArray(coreq.semesters_offered) || 
                    coreq.semesters_offered.length === 0) {
                  console.log(`Skipping unschedulable corequisite ${coreq.id} (${coreq.class_name})`);
                  // Skip this main class entirely if a required corequisite isn't schedulable
                  continue;
                }
                
                fetchedCoreqs.push(coreq);
                totalCredits += (coreq.credits || 3);
              } else {
                console.warn(`Corequisite ${coreqId} not found for class ${mainClass.id} (${mainClass.class_name})`);
              }
            } catch (error) {
              console.warn(`Error fetching corequisite ${coreqId}: ${error.message}`);
            }
          }
          
          // If we have fewer coreqs than expected, some must be unschedulable - skip this class
          if (fetchedCoreqs.length < coreqsToFetch.length) {
            console.log(`Skipping ${mainClass.class_name} because some corequisites aren't schedulable`);
            continue;
          }
        }
        
        // Check if adding this class would get us closer to the credit requirement
        if ((creditsSelected + totalCredits <= creditsNeeded) || 
            (Math.abs((creditsSelected + totalCredits) - creditsNeeded) < 
             Math.abs(creditsSelected - creditsNeeded))) {
          
          // Select this main class
          selectedElectiveClassesMap.set(mainClass.id, mainClass);
          
          // Select its corequisites from the section
          coreqIds.forEach(coreqId => {
            const coreq = tempClassesById[coreqId];
            if (coreq) {
              selectedElectiveClassesMap.set(coreqId, coreq);
            }
          });
          
          // Add fetched corequisites
          fetchedCoreqs.forEach(coreq => {
            selectedElectiveClassesMap.set(coreq.id, coreq);
          });
          
          // Update selected credits
          creditsSelected += totalCredits;
          console.log(`Selected: ${mainClass.class_name} with corequisites (${totalCredits} cr)`);
        }
        
        // If we've met the credit requirement, stop selecting from this section
        if (creditsSelected >= creditsNeeded) {
          console.log(`Section ${section.name}: Met credit requirement with ${creditsSelected}/${creditsNeeded} credits`);
          break;
        }
      }
      
      if (creditsSelected < creditsNeeded) {
        console.log(`Section ${section.name}: Could only select ${creditsSelected}/${creditsNeeded} credits`);
      }
    }
    
    // Convert map to array of selected elective classes
    const selectedElectiveClasses = Array.from(selectedElectiveClassesMap.values());
    
    // Combine required classes and selected elective classes
    const combinedClasses = [...allRequiredClasses, ...selectedElectiveClasses];
    
    // Remove duplicates (in case a class appears in multiple collections)
    const uniqueClasses = [];
    const seenIds = new Set();
    combinedClasses.forEach(cls => {
      if (cls && cls.id && !seenIds.has(cls.id)) {
        uniqueClasses.push(cls);
        seenIds.add(cls.id);
      }
    });
    
    // Build corequisite map
    const corequisiteMap = buildCorequisiteMap(uniqueClasses);
    
    // Sort classes based on prerequisites
    const sortedClasses = sortClassesByPrerequisites(uniqueClasses);
    
    // Generate schedule
    const schedule = createSchedule(
      sortedClasses,
      startSemester, 
      majorClassLimit, 
      fallWinterCredits, 
      springCredits,
      corequisiteMap
    );
    
    return schedule;
  }

  // *** CRITICAL CHANGE: MODIFY BUILD COREQUISITE MAP - ONE DIRECTION ONLY ***
  function buildCorequisiteMap(classes) {
    const coreqMap = {};
    
    // ONLY direct corequisites as defined in the data - NO bidirectional relationships
    classes.forEach(cls => {
      if (cls.corequisites && Array.isArray(cls.corequisites) && cls.corequisites.length > 0) {
        coreqMap[cls.id] = cls.corequisites.map(coreqId => 
          typeof coreqId === 'object' ? (coreqId.id || coreqId.class_id) : coreqId
        );
      }
    });
    
    // NO second pass - NO bidirectional relationships
    return coreqMap;
  }

  // Create a schedule with classes assigned to semesters
  function createSchedule(sortedClasses, startSemester, majorClassLimit, fallWinterCredits, springCredits, corequisiteMap = {}) {
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
          earlyEilClasses,
          corequisiteMap
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
          majorClassLimit,
          corequisiteMap
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
          majorClassLimit,
          corequisiteMap
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
  function assignClassesToSemesterWithPriority(availableClasses, completedSemesters, creditLimit, majorClassLimit, priorityClasses, corequisiteMap = {}) {
    return assignClassesWithCorequisites(
      availableClasses, 
      completedSemesters, 
      creditLimit, 
      majorClassLimit, 
      priorityClasses,
      corequisiteMap
    );
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
function assignClassesToSemester(availableClasses, completedSemesters, creditLimit, majorClassLimit, corequisiteMap = {}) {
  return assignClassesWithCorequisites(
    availableClasses, 
    completedSemesters, 
    creditLimit, 
    majorClassLimit, 
    [], // No priority classes
    corequisiteMap
  );
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

// 4. Add new comprehensive function for class assignment with corequisites
function assignClassesWithCorequisites(
  availableClasses, 
  completedSemesters, 
  creditLimit, 
  majorClassLimit, 
  priorityClasses = [],
  corequisiteMap = {}
) {
  // Get eligible classes (prerequisites satisfied)
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
  
  // Find eligible priority classes
  const eligiblePriorityClasses = priorityClasses.filter(cls => 
    eligibleClasses.some(eligible => eligible.id === cls.id)
  );
  
  // Initialize counters and selected classes
  const selectedClasses = [];
  let currentCredits = 0;
  let majorClassesCount = 0;
  let eilClassesCount = 0;
  
  // Create a map to track all classes for corequisite lookup
  const classesById = {};
  availableClasses.forEach(cls => {
    if (cls && cls.id) classesById[cls.id] = cls;
  });
  
  // Process priority classes first
  for (const cls of eligiblePriorityClasses) {
    if (selectedClasses.includes(cls)) continue;
    
    const result = canAddClassWithCorequisites(
      cls, selectedClasses, classesById, corequisiteMap, 
      currentCredits, majorClassesCount, eilClassesCount, 
      creditLimit, majorClassLimit
    );
    
    if (!result.canAdd) continue;
    
    // Add the class and its corequisites
    selectedClasses.push(cls);
    selectedClasses.push(...result.coreqClasses);
    
    // Update counters
    currentCredits += result.addedCredits;
    majorClassesCount += result.addedMajors;
    eilClassesCount += result.addedEIL;
    
    if (currentCredits >= creditLimit) break;
  }
  
  // Process remaining eligible classes
  const remainingEligibleClasses = eligibleClasses.filter(cls => 
    !selectedClasses.some(selected => selected.id === cls.id)
  );
  
  // Sort normal classes by priority
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
  
  // Process remaining classes with their corequisites
  for (const cls of remainingEligibleClasses) {
    if (selectedClasses.includes(cls)) continue;
    
    const result = canAddClassWithCorequisites(
      cls, 
      selectedClasses, 
      classesById, 
      corequisiteMap, 
      currentCredits, 
      majorClassesCount, 
      eilClassesCount, 
      creditLimit, 
      majorClassLimit
    );
    
    if (!result.canAdd) continue;
    
    // Add the class and its corequisites
    selectedClasses.push(cls);
    selectedClasses.push(...result.coreqClasses);
    
    // Update counters
    currentCredits += result.addedCredits;
    majorClassesCount += result.addedMajors;
    eilClassesCount += result.addedEIL;
    
    if (currentCredits >= creditLimit) break;
  }
  
  return selectedClasses;
}

// Function to sort classes based on prerequisites depth
function sortClassesByPrerequisites(classes) {
  // First compute the depth map (how many levels of prerequisites deep)
  const depthMap = computeDepthMap(classes);
  
  // Create a map for quick class lookups
  const classesById = {};
  classes.forEach(cls => {
    if (cls && cls.id) classesById[cls.id] = cls;
  });
  
  // Sort classes by depth, then by level
  return [...classes].sort((a, b) => {
    // First priority: prerequisite depth
    const depthA = depthMap[a.id] || 0;
    const depthB = depthMap[b.id] || 0;
    if (depthA !== depthB) return depthA - depthB;
    
    // Second priority: class level
    const levelA = a.class_number ? parseInt(a.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
    const levelB = b.class_number ? parseInt(b.class_number.match(/\d+/)?.[0] || '0', 10) : 0;
    return levelA - levelB;
  });
}

// Update the assignClassesWithCorequisites function to use the improved canAddClassWithCorequisites
function assignClassesWithCorequisites(
  availableClasses, 
  completedSemesters, 
  creditLimit, 
  majorClassLimit, 
  priorityClasses = [],
  corequisiteMap = {}
) {
  // Get eligible classes (prerequisites satisfied)
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
  
  // Find eligible priority classes
  const eligiblePriorityClasses = priorityClasses.filter(cls => 
    eligibleClasses.some(eligible => eligible.id === cls.id)
  );
  
  // Initialize counters and selected classes
  const selectedClasses = [];
  let currentCredits = 0;
  let majorClassesCount = 0;
  let eilClassesCount = 0;
  
  // Create a map to track all classes for corequisite lookup
  const classesById = {};
  availableClasses.forEach(cls => {
    if (cls && cls.id) classesById[cls.id] = cls;
  });
  
  // Process priority classes first
  for (const cls of eligiblePriorityClasses) {
    if (selectedClasses.includes(cls)) continue;
    
    const result = canAddClassWithCorequisites(
      cls, selectedClasses, classesById, corequisiteMap, 
      currentCredits, majorClassesCount, eilClassesCount, 
      creditLimit, majorClassLimit
    );
    
    if (!result.canAdd) continue;
    
    // Add the class and its corequisites
    selectedClasses.push(cls);
    selectedClasses.push(...result.coreqClasses);
    
    // Update counters
    currentCredits += result.addedCredits;
    majorClassesCount += result.addedMajors;
    eilClassesCount += result.addedEIL;
    
    if (currentCredits >= creditLimit) break;
  }
  
  // Process remaining eligible classes
  const remainingEligibleClasses = eligibleClasses.filter(cls => 
    !selectedClasses.some(selected => selected.id === cls.id)
  );
  
  // Sort normal classes by priority
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
  
  // Process remaining classes with their corequisites
  for (const cls of remainingEligibleClasses) {
    if (selectedClasses.includes(cls)) continue;
    
    const result = canAddClassWithCorequisites(
      cls, 
      selectedClasses, 
      classesById, 
      corequisiteMap, 
      currentCredits, 
      majorClassesCount, 
      eilClassesCount, 
      creditLimit, 
      majorClassLimit
    );
    
    if (!result.canAdd) continue;
    
    // Add the class and its corequisites
    selectedClasses.push(cls);
    selectedClasses.push(...result.coreqClasses);
    
    // Update counters
    currentCredits += result.addedCredits;
    majorClassesCount += result.addedMajors;
    eilClassesCount += result.addedEIL;
    
    if (currentCredits >= creditLimit) break;
  }
  
  return selectedClasses;
}
