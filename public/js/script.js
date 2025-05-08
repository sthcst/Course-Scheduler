// Global variables to store data
let allClassesData = []; // Will store ALL classes from the API
let basicCourses = []; // Lightweight course data for dropdowns

// Track selected Holokai sections
let selectedHolokai = {
  major: null,
  minor1: null,
  minor2: null
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Fetch basic course data for dropdowns
    const basicResponse = await fetch('/api/courses/basic');
    if (!basicResponse.ok) {
      throw new Error(`Error fetching basic courses: ${basicResponse.statusText}`);
    }
    basicCourses = await basicResponse.json();
    console.log("Fetched basic courses for dropdowns:", basicCourses);
    
    // Filter and sort majors and minors alphabetically
    const majors = basicCourses
      .filter(course => course.course_type && course.course_type.toLowerCase() === "major")
      .sort((a, b) => a.course_name.localeCompare(b.course_name));
    
    const minors = basicCourses
      .filter(course => course.course_type && course.course_type.toLowerCase() === "minor")
      .sort((a, b) => a.course_name.localeCompare(b.course_name));

    // Populate dropdowns
    populateDropdowns(majors, minors, basicCourses);
    
    // UPDATED: Fetch classes from the proper endpoint
    try {
      // Try fetching without parameters first
      const allClassesResponse = await fetch('/api/classes');
      if (!allClassesResponse.ok) {
        throw new Error(`Error fetching classes: ${allClassesResponse.statusText}`);
      }
      allClassesData = await allClassesResponse.json();
    } catch (classError) {
      console.warn("Error fetching from /api/classes, trying alternate endpoint", classError);
      
      // Alternative: If fetching all classes at once doesn't work, 
      // fetch them by course ID when needed
      allClassesData = [];
      console.log("Will fetch classes by course ID when needed");
    }
    
    console.log(`Loaded ${allClassesData.length} classes for scheduling`);
    
    // Create lookup maps if we have data
    if (allClassesData.length > 0) {
      createClassLookupMaps();
    }

    // When page loads, disable minor dropdowns and Generate Schedule button
    disableCustomDropdown("minor1Select");
    disableCustomDropdown("minor2Select");
    updateGenerateButtonState();
    
    // Set up the 10 Semester Path checkbox
    setupTenSemesterPath();
    
  } catch (error) {
    console.error("Error during initialization:", error);
  }

  // Set up the schedule generation button
  const generateButton = document.getElementById("calculate-schedule");
  if (generateButton) {
    generateButton.addEventListener('click', generateScheduleFromSelections);
  }
});

// Maps for fast lookups
let classesById = {};
let classesByCourseId = {};
let prerequisiteMap = {};
let corequisiteMap = {};

// Create lookup maps for faster access to class data
function createClassLookupMaps() {
  // Map classes by ID
  classesById = allClassesData.reduce((map, cls) => {
    if (cls.id) map[cls.id] = cls;
    return map;
  }, {});
  
  // Group classes by course_id (for filtering by selected courses)
  classesByCourseId = allClassesData.reduce((map, cls) => {
    if (cls.course_id) {
      if (!map[cls.course_id]) map[cls.course_id] = [];
      map[cls.course_id].push(cls);
    }
    return map;
  }, {});
  
  // Create prerequisite relationships map
  prerequisiteMap = {};
  allClassesData.forEach(cls => {
    if (cls.prerequisites && Array.isArray(cls.prerequisites) && cls.prerequisites.length > 0) {
      prerequisiteMap[cls.id] = cls.prerequisites.map(prereq => 
        typeof prereq === 'object' ? prereq.id || prereq.class_id : prereq
      );
    }
  });
  
  // Create corequisite relationships map
  corequisiteMap = {};
  allClassesData.forEach(cls => {
    if (cls.corequisites && Array.isArray(cls.corequisites) && cls.corequisites.length > 0) {
      corequisiteMap[cls.id] = cls.corequisites.map(coreq => 
        typeof coreq === 'object' ? coreq.id || coreq.class_id : coreq
      );
    }
  });
}

// Add this function to determine holokai type class
function getHolokaiClass(holokaiType) {
  if (!holokaiType) return 'no-holokai';
  
  const type = holokaiType.toLowerCase();
  if (type.includes('arts') || type.includes('humanities')) {
    return 'arts-humanities';
  } else if (type.includes('professional')) {
    return 'professional-studies';
  } else if (type.includes('math') || type.includes('sciences')) {
    return 'math-sciences';
  }
  return 'no-holokai';
}

// Modified function to create styled custom dropdowns instead of using regular selects
function populateDropdowns(majors, minors, courses) {
  // Save original data for refiltering later
  const originalMajors = [...majors];
  const originalMinors = [...minors];
  
  // Create custom dropdown for Major
  createCustomDropdown("majorSelect", "selectedMajor", majors, "Select a Major", option => {
    // On selection handler
    document.getElementById("majorHolokai").textContent = option.dataset.holokai || '';
    selectedHolokai.major = option.dataset.holokai || null;
    
    // Enable minor dropdowns when a major is selected
    if (option.dataset.value) {
      enableCustomDropdown("minor1Select");
      enableCustomDropdown("minor2Select");
    } else {
      // If major is deselected, disable minor dropdowns
      disableCustomDropdown("minor1Select");
      disableCustomDropdown("minor2Select");
    }
    
    // Reset minor selections
    resetCustomDropdown("minor1Select", "selectedMinor1", "minor1Holokai");
    resetCustomDropdown("minor2Select", "selectedMinor2", "minor2Holokai");
    selectedHolokai.minor1 = null;
    selectedHolokai.minor2 = null;
    
    // Update minors with incompatible options
    updateCustomDropdownsWithIncompatible("minor1Select", "minor2Select", originalMinors);
    
    // Update Generate button state
    updateGenerateButtonState();
  });
  
  // Modified minor1 selection handler
  createCustomDropdown("minor1Select", "selectedMinor1", minors, "Select Your First Minor", option => {
    // Check if selected option is incompatible with major
    if (option.classList.contains('incompatible')) {
      alert("This minor is from the same Holokai section as your major. Please choose a different Holokai section.");
      resetCustomDropdown("minor1Select", "selectedMinor1", "minor1Holokai");
      return;
    }
    
    // Get the new Holokai type for minor1
    const newMinor1Holokai = option.dataset.holokai || null;
    
    // Update UI and state
    document.getElementById("minor1Holokai").textContent = newMinor1Holokai || '';
    selectedHolokai.minor1 = newMinor1Holokai;
    
    // Check if we need to reset minor2 (only if there's now a conflict)
    if (selectedHolokai.minor2 && selectedHolokai.minor2 === newMinor1Holokai) {
      console.log("Minor2 has same Holokai as newly selected Minor1, resetting Minor2");
      resetCustomDropdown("minor2Select", "selectedMinor2", "minor2Holokai");
      selectedHolokai.minor2 = null;
    }
    
    // Always update minor2 dropdown to reflect the new incompatible options
    updateCustomDropdownWithIncompatible("minor2Select", originalMinors);
    
    // Update Generate button state
    updateGenerateButtonState();
  }, option => {
    // Check if incompatible with major
    return selectedHolokai.major && option.holokai === selectedHolokai.major;
  });
  
  // Modified minor2 selection handler 
  createCustomDropdown("minor2Select", "selectedMinor2", minors, "Select Your Second Minor", option => {
    // Check if selected option is incompatible
    if (option.classList.contains('incompatible')) {
      alert("This minor is from the same Holokai section as your major or first minor. Please choose a different Holokai section.");
      resetCustomDropdown("minor2Select", "selectedMinor2", "minor2Holokai");
      return;
    }
    
    // Get the new Holokai type for minor2
    const newMinor2Holokai = option.dataset.holokai || null;
    
    // Update UI and state
    document.getElementById("minor2Holokai").textContent = newMinor2Holokai || '';
    selectedHolokai.minor2 = newMinor2Holokai;
    
    // Check if we need to reset minor1 (only if there's now a conflict)
    if (selectedHolokai.minor1 && selectedHolokai.minor1 === newMinor2Holokai) {
      console.log("Minor1 has same Holokai as newly selected Minor2, resetting Minor1");
      resetCustomDropdown("minor1Select", "selectedMinor1", "minor1Holokai");
      selectedHolokai.minor1 = null;
      
      // Update minor1 dropdown to reflect the new incompatible options
      updateCustomDropdownWithIncompatible("minor1Select", originalMinors);
    }
    
    // Update Generate button state
    updateGenerateButtonState();
  }, option => {
    // Check if incompatible with major or minor1
    return (selectedHolokai.major && option.holokai === selectedHolokai.major) ||
           (selectedHolokai.minor1 && option.holokai === selectedHolokai.minor1);
  });
  
  // Populate English Level Dropdown (unchanged)
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

// Create a custom dropdown with colored dots and incompatible styling
function createCustomDropdown(selectId, hiddenInputId, options, placeholder, onSelect, isIncompatibleFn = null) {
  const originalSelect = document.getElementById(selectId);
  if (!originalSelect) return;
  
  // Clear any existing containers
  if (originalSelect.parentElement.classList.contains('custom-dropdown-container')) {
    originalSelect.parentElement.parentElement.replaceChild(originalSelect, originalSelect.parentElement);
  }
  
  // Create container
  const container = document.createElement('div');
  container.className = 'custom-dropdown-container';
  originalSelect.parentNode.insertBefore(container, originalSelect);
  container.appendChild(originalSelect);
  
  // Hide original select
  originalSelect.style.display = 'none';
  
  // Create custom dropdown elements
  const dropdownDisplay = document.createElement('div');
  dropdownDisplay.className = 'dropdown-display';
  dropdownDisplay.textContent = placeholder;
  
  const dropdownList = document.createElement('div');
  dropdownList.className = 'dropdown-list';
  dropdownList.style.display = 'none';
  
  // Add placeholder option
  const placeholderItem = document.createElement('div');
  placeholderItem.className = 'dropdown-item';
  placeholderItem.dataset.value = '';
  placeholderItem.textContent = placeholder;
  dropdownList.appendChild(placeholderItem);
  
  // Add options with colored dots
  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.dataset.value = opt.id;
    
    // Store holokai data
    if (opt.holokai) {
      item.dataset.holokai = opt.holokai;
    }
    
    // Check if incompatible
    const isIncompatible = isIncompatibleFn ? isIncompatibleFn(opt) : false;
    if (isIncompatible) {
      item.classList.add('incompatible');
    }
    
    // Create colored dot
    const holokaiClass = getHolokaiClass(opt.holokai);
    
    const dot = document.createElement('span');
    dot.className = `holokai-indicator ${holokaiClass}`;
    
    // Append dot and text
    item.appendChild(dot);
    item.appendChild(document.createTextNode(' ' + opt.course_name));
    
    dropdownList.appendChild(item);
  });
  
  // Add elements to DOM
  container.appendChild(dropdownDisplay);
  container.appendChild(dropdownList);
  
  // Add event listeners
  dropdownDisplay.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Check if dropdown is disabled
    if (dropdownDisplay.dataset.disabled === "true") {
      return; // Don't open if disabled
    }
    
    const isOpen = dropdownList.style.display === 'block';
    
    // Close all other dropdowns
    document.querySelectorAll('.dropdown-list').forEach(list => {
      list.style.display = 'none';
    });
    
    // Toggle this dropdown
    dropdownList.style.display = isOpen ? 'none' : 'block';
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    dropdownList.style.display = 'none';
  });
  
  dropdownList.addEventListener('click', (e) => {
    e.stopPropagation();
    // Skip if dropdown is disabled
    if (dropdownDisplay.dataset.disabled === "true") {
      return;
    }
    
    if (e.target.classList.contains('dropdown-item')) {
      const value = e.target.dataset.value;
      const text = e.target.textContent.trim();
      
      // Update display
      if (value) {
        const dot = e.target.querySelector('.holokai-indicator');
        if (dot) {
          const clonedDot = dot.cloneNode(true);
          dropdownDisplay.innerHTML = '';
          dropdownDisplay.appendChild(clonedDot);
          dropdownDisplay.appendChild(document.createTextNode(' ' + text));
        } else {
          dropdownDisplay.textContent = text;
        }
      } else {
        dropdownDisplay.textContent = placeholder;
      }
      
      // Update hidden input
      document.getElementById(hiddenInputId).value = value;
      
      // Call selection handler
      onSelect(e.target);
      
      // Enable minor dropdowns when major is selected
      if (selectId === "majorSelect" && value) {
        enableCustomDropdown("minor1Select");
        enableCustomDropdown("minor2Select");
      }
      
      // Update Generate button state
      updateGenerateButtonState();
      
      // Close dropdown
      dropdownList.style.display = 'none';
    }
  });
}

// Reset a custom dropdown to its initial state
function resetCustomDropdown(selectId, hiddenInputId, holokaiDisplayId) {
  const container = document.getElementById(selectId).parentElement;
  const display = container.querySelector('.dropdown-display');
  const placeholder = display.textContent.includes('Select') ? 
                      display.textContent : `Select Your ${selectId.replace('Select', '')}`;
  
  // Reset display text
  display.textContent = placeholder;
  
  // Reset hidden input
  document.getElementById(hiddenInputId).value = '';
  
  // Reset holokai display
  document.getElementById(holokaiDisplayId).textContent = '';
}

// Update custom dropdowns with incompatible options
function updateCustomDropdownsWithIncompatible(minor1Id, minor2Id, originalMinors) {
  updateCustomDropdownWithIncompatible(minor1Id, originalMinors);
  updateCustomDropdownWithIncompatible(minor2Id, originalMinors);
}

// Update a single custom dropdown with incompatible options
function updateCustomDropdownWithIncompatible(selectId, originalMinors) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const container = select.parentElement;
  const list = container.querySelector('.dropdown-list');
  
  // Clear existing items (except placeholder)
  while (list.children.length > 1) {
    list.removeChild(list.lastChild);
  }
  
  // Add options with proper incompatible styling
  originalMinors.forEach(minor => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.dataset.value = minor.id;
    
    // Store holokai data
    if (minor.holokai) {
      item.dataset.holokai = minor.holokai;
    }
    
    // Check if incompatible
    let isIncompatible = false;
    
    if (selectId === "minor1Select") {
      isIncompatible = selectedHolokai.major && minor.holokai === selectedHolokai.major;
    } else if (selectId === "minor2Select") {
      isIncompatible = (selectedHolokai.major && minor.holokai === selectedHolokai.major) ||
                      (selectedHolokai.minor1 && minor.holokai === selectedHolokai.minor1);
    }
    
    if (isIncompatible) {
      item.classList.add('incompatible');
    }
    
    // Create colored dot
    const holokaiClass = getHolokaiClass(minor.holokai);
    
    const dot = document.createElement('span');
    dot.className = `holokai-indicator ${holokaiClass}`;
    
    // Append dot and text
    item.appendChild(dot);
    item.appendChild(document.createTextNode(' ' + minor.course_name));
    
    list.appendChild(item);
  });
}

// Main function to send user preferences to the AI scheduler
async function generateScheduleFromSelections(event) {
  event.preventDefault();
  console.log("Starting schedule generation with AI...");

  // Show loading indicator
  const generateButton = document.getElementById("calculate-schedule");
  generateButton.textContent = "Generating...";
  generateButton.disabled = true;

  try {
    // Get selected course IDs
    const selectedMajor = Number(document.getElementById("selectedMajor").value);
    const selectedMinor1 = Number(document.getElementById("selectedMinor1").value);
    const selectedMinor2 = Number(document.getElementById("selectedMinor2").value);
    const selectedCourseIds = [selectedMajor, selectedMinor1, selectedMinor2].filter(id => !isNaN(id));
    
    // Get other settings
    const englishLevel = document.getElementById("english-level").value;
    const startSemester = document.getElementById("start-semester").value;
    const majorClassLimit = parseInt(document.getElementById("major-class-limit").value, 10);
    const fallWinterCredits = parseInt(document.getElementById("fall-winter-credits").value, 10);
    const springCredits = parseInt(document.getElementById("spring-credits").value, 10);
    const tenSemesterPath = document.getElementById("ten-semester-path")?.checked || false;
    
    console.log("Sending user preferences to AI scheduler:", { 
      selectedCourseIds, 
      englishLevel, 
      startSemester,
      majorClassLimit,
      fallWinterCredits,
      springCredits,
      tenSemesterPath
    });

    // Send preferences to new AI scheduler endpoint
    const response = await fetch('/api/generate-schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        selectedCourses: selectedCourseIds,
        englishLevel: englishLevel,
        startSemester: startSemester,
        majorClassLimit: majorClassLimit,
        fallWinterCredits: fallWinterCredits,
        springCredits: springCredits,
        tenSemesterPath: tenSemesterPath
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("API error response:", errorText);
      throw new Error(`API returned status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log("AI-generated schedule received:", result);
    
    // Render the returned schedule
    renderSchedule(result.schedule);

    // Add improvements explanation if available
    if (result.improvements && result.improvements.length > 0) {
      const improvementsContainer = document.createElement('div');
      improvementsContainer.className = 'improvements-container';
      improvementsContainer.innerHTML = '<h3>Schedule Insights</h3><ul>' +
        result.improvements.map(improvement => `<li>${improvement}</li>`).join('') +
        '</ul>';
        
      // Add to page after the schedule is rendered
      document.getElementById('schedule-container').appendChild(improvementsContainer);
    }

    // Add export button
    const scheduleJson = JSON.stringify(result.schedule, null, 2);
    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export Schedule JSON';
    exportButton.className = 'export-button';
    exportButton.addEventListener('click', () => {
      const blob = new Blob([scheduleJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'schedule.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Add button after the schedule
    document.getElementById('schedule-container').appendChild(exportButton);

  } catch (error) {
    console.error("Error generating schedule:", error);
    alert("There was an error generating your schedule. Please try again.");
  } finally {
    // Reset button
    generateButton.textContent = "Generate Schedule";
    generateButton.disabled = false;
  }
}

// Render the schedule to the UI
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
  
  // Calculate total semesters
  const totalSemesters = schedule.length;
  
  // Create summary items (unchanged)
  summaryBox.innerHTML = `
    <div class="summary-item animated-box" id="total-credits-box">
      <p>Total Credits Taken</p>
      <h2 id="total-credits">${totalCredits}</h2>
    </div>
    <div class="summary-item animated-box" id="electives-needed-box">
      <p>Elective Credits Needed</p>
      <h2 id="electives-needed">${electiveCreditsNeeded}</h2>
    </div>
    <div class="summary-item animated-box" id="total-semesters-box">
      <p>Total Semesters</p>
      <h2 id="total-semesters">${totalSemesters}</h2>
    </div>
    <div class="summary-item animated-box" id="graduation-date-box">
      <p>Graduation Date</p>
      <h2 id="graduation-date">${graduationSemester}</h2>
    </div>
  `;
  
  // Add summary box to the container
  scheduleContainer.appendChild(summaryBox);
  
  // Create schedule display
  const scheduleTable = document.createElement('div');
  scheduleTable.className = 'schedule-table';
  
  // Add each semester
  schedule.forEach((semester, index) => {
    const semesterDiv = document.createElement('div');
    semesterDiv.className = 'semester-card';
    
    // Add 'over-limit' class if this is past the 10th semester
    const isTenSemesterPath = document.getElementById('ten-semester-path')?.checked;
    if (isTenSemesterPath && index >= 10) {
      semesterDiv.classList.add('over-limit');
    }
    
    // Semester header
    const semesterHeader = document.createElement('div');
    semesterHeader.className = 'semester-header';
    semesterHeader.textContent = semester.name;
    semesterDiv.appendChild(semesterHeader);
    
    // Add warning if over 10 semesters
    if (isTenSemesterPath && index >= 10) {
      const warningDiv = document.createElement('div');
      warningDiv.className = 'over-limit-warning';
      warningDiv.textContent = 'Past 10 semester goal';
      semesterDiv.appendChild(warningDiv);
    }
    
    // Semester classes
    const classesList = document.createElement('ul');
    classesList.className = 'classes-list';
    
    // NEW: Create a set to track displayed class numbers to avoid duplicates
    const displayedClassNumbers = new Set();
    
    semester.classes.forEach(cls => {
      // NEW: Skip classes with duplicate class numbers in the same semester
      const classNumber = cls.class_number || '';
      if (classNumber && displayedClassNumbers.has(classNumber)) {
        console.log(`Preventing duplicate display of ${classNumber} in ${semester.name}`);
        return;
      }
      
      // If we have a class number, mark it as displayed
      if (classNumber) {
        displayedClassNumbers.add(classNumber);
      }
      
      const classItem = document.createElement('li');
      classItem.className = 'class-item';
      
      // Class type indicator (major, minor, etc)
      const categoryTag = cls.isMajor ? 'major' : 
                          (cls.category === 'english' ? 'english' :
                          (cls.category === 'religion' ? 'religion' : 'minor'));
      
      classItem.innerHTML = `
        <span class="class-tag ${categoryTag}">${categoryTag.charAt(0).toUpperCase() + categoryTag.slice(1)}</span>
        <span class="class-number">${classNumber}</span>
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

// Add these functions for enabling/disabling custom dropdowns
function disableCustomDropdown(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const container = select.parentElement;
  if (!container.classList.contains('custom-dropdown-container')) return;
  
  const display = container.querySelector('.dropdown-display');
  if (display) {
    display.classList.add('disabled');
    display.dataset.disabled = "true";
  }
}

function enableCustomDropdown(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const container = select.parentElement;
  if (!container.classList.contains('custom-dropdown-container')) return;
  
  const display = container.querySelector('.dropdown-display');
  if (display) {
    display.classList.remove('disabled');
    display.dataset.disabled = "false";
  }
}

// Function to check if all Holokai sections are different and enable/disable Generate button
function updateGenerateButtonState() {
  const generateButton = document.getElementById("calculate-schedule");
  
  // Get selected holokai values
  const majorHolokai = selectedHolokai.major;
  const minor1Holokai = selectedHolokai.minor1;
  const minor2Holokai = selectedHolokai.minor2;
  
  // Check if all three sections are selected
  const majorSelected = !!document.getElementById("selectedMajor").value;
  const minor1Selected = !!document.getElementById("selectedMinor1").value;
  const minor2Selected = !!document.getElementById("selectedMinor2").value;
  
  const allSelected = majorSelected && minor1Selected && minor2Selected;
  
  // If any are not selected, disable the button
  if (!allSelected) {
    generateButton.disabled = true;
    generateButton.classList.add("disabled");
    return;
  }
  
  // Check if we have three unique Holokai sections
  const uniqueHolokai = new Set([majorHolokai, minor1Holokai, minor2Holokai]);
  const hasThreeSections = uniqueHolokai.size === 3;
  
  // Enable/disable button based on whether we have three unique sections
  if (hasThreeSections) {
    generateButton.disabled = false;
    generateButton.classList.remove("disabled");
  } else {
    generateButton.disabled = true;
    generateButton.classList.add("disabled");
  }
}

// Function to handle 10 Semester Path checkbox
function setupTenSemesterPath() {
  const checkbox = document.getElementById('ten-semester-path');
  if (!checkbox) return;
  
  // Get the three dropdowns we need to control
  const majorClassLimitDropdown = document.getElementById('major-class-limit');
  const fallWinterCreditsDropdown = document.getElementById('fall-winter-credits');
  const springCreditsDropdown = document.getElementById('spring-credits');
  
  // Store original values to restore when unchecked
  let originalValues = {
    majorLimit: majorClassLimitDropdown.value,
    fallWinter: fallWinterCreditsDropdown.value,
    spring: springCreditsDropdown.value
  };
  
  checkbox.addEventListener('change', function() {
    if (this.checked) {
      // Store current values before overriding
      originalValues = {
        majorLimit: majorClassLimitDropdown.value,
        fallWinter: fallWinterCreditsDropdown.value,
        spring: springCreditsDropdown.value
      };
      
      // Set to maximum values
      majorClassLimitDropdown.value = '4';
      fallWinterCreditsDropdown.value = '18';
      springCreditsDropdown.value = '12';
      
      // Disable the dropdowns
      majorClassLimitDropdown.disabled = true;
      fallWinterCreditsDropdown.disabled = true;
      springCreditsDropdown.disabled = true;
    } else {
      // Restore original values
      majorClassLimitDropdown.value = originalValues.majorLimit;
      fallWinterCreditsDropdown.value = originalValues.fallWinter;
      springCreditsDropdown.value = originalValues.spring;
      
      // Enable the dropdowns
      majorClassLimitDropdown.disabled = false;
      fallWinterCreditsDropdown.disabled = false;
      springCreditsDropdown.disabled = false;
    }
  });
}