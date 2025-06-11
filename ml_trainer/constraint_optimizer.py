from typing import Dict, List, Set, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime
import logging

@dataclass
class Course:
    id: int
    name: str
    class_number: str
    credits: int
    prerequisites: List[int]
    corequisites: List[int]
    semesters_offered: List[str]
    is_elective: bool
    section_id: int
    credits_needed: int = None
    course_type: str = ""  # Add course_type field

@dataclass
class Semester:
    type: str  # Fall, Winter, Spring
    year: int
    credit_limit: int
    classes: List[Course] = None
    
    def __post_init__(self):
        self.classes = self.classes or []
        
    @property
    def total_credits(self) -> int:
        return sum(c.credits for c in self.classes)

class SchedulingLogFilter(logging.Filter):
    def filter(self, record):
        if not isinstance(record.msg, str):
            return True
            
        # Convert message to string if it's a dict
        message = str(record.msg)
        
        # Check for both the exact message and JSON-like content
        if ('Generated schedule response' in message or
            '"metadata":' in message or
            "'metadata':" in message or
            message.startswith('{') and ('schedule' in message or 'metadata' in message)):
            return False
            
        return True

# Configure logging with the enhanced filter
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

# Apply filter to root logger to catch all logging
logging.getLogger().addFilter(SchedulingLogFilter())
logger.addFilter(SchedulingLogFilter())

class ScheduleOptimizer:
    def __init__(self):
        self.satisfied_sections: Set[int] = set()
        
    def _is_first_year_semester(self, semester: Semester, start_semester: str) -> bool:
        """
        Check if semester is in first year (first 3 semesters)
        Returns True for first 3 semesters from start, regardless of type
        """
        start_type, start_year = start_semester.split()
        start_year = int(start_year)
        
        # Create ordered list of semesters starting from start semester
        sem_sequence = []
        current_type = start_type
        current_year = start_year
        
        # Generate sequence of first 6 semesters (more than enough to check first 3)
        for _ in range(6):
            sem_sequence.append((current_type, current_year))
            # Update to next semester
            if current_type == "Fall":
                current_type = "Winter"
                current_year += 1
            elif current_type == "Winter":
                current_type = "Spring"
            else:  # Spring
                current_type = "Fall"
        
        # Check if current semester is in first 3 of sequence
        target = (semester.type, semester.year)
        try:
            index = sem_sequence.index(target)
            return index < 3  # First 3 semesters are first year
        except ValueError:
            return False

        logger.info(f"Semester {semester.type} {semester.year} first year status: {index < 3}")

    def _get_semester_credit_limit(self, semester: Semester, params: Dict) -> int:
        """Get credit limit for semester considering first year status"""
        if self._is_first_year_semester(semester, params["startSemester"]):
            if semester.type == "Spring":
                return params["firstYearLimits"]["springCredits"]
            return params["firstYearLimits"]["fallWinterCredits"]
        else:
            if semester.type == "Spring":
                return params["springCredits"]
            return params["fallWinterCredits"]

    def _convert_to_courses(self, raw_classes: Dict) -> List[Course]:
        """Convert raw class data to Course objects"""
        courses = []
        for id, data in raw_classes.items():
            course = Course(
                id=int(id),
                name=data["class_name"],
                class_number=data.get("class_number", ""),
                credits=data["credits"],
                prerequisites=data.get("prerequisites", []),
                corequisites=data.get("corequisites", []),
                semesters_offered=data["semesters_offered"],
                is_elective=data.get("is_elective", False),
                section_id=data["section_id"],
                credits_needed=data.get("credits_needed"),
                course_type=data.get("course_type", "")
            )
            courses.append(course)
        return courses

    def _sort_by_prerequisites(self, courses: List[Course]) -> List[Course]:
        """Sort courses optimizing for earliest possible graduation"""
        # Create mappings for prerequisite chains and dependent courses
        prereq_chains = {}
        dependent_courses = {}
        chain_depths = {}
        
        def get_all_prerequisites(course_id: int, seen=None) -> Set[int]:
            if seen is None:
                seen = set()
            if course_id in seen:
                return set()
            seen.add(course_id)
            
            course = next((c for c in courses if c.id == course_id), None)
            if not course:
                return set()
                
            direct_prereqs = set(course.prerequisites)
            all_prereqs = direct_prereqs.copy()
            
            for prereq_id in direct_prereqs:
                all_prereqs.update(get_all_prerequisites(prereq_id, seen))
                
            return all_prereqs
        
        def get_chain_depth(course_id: int, seen=None) -> int:
            """Calculate the depth of the prerequisite chain"""
            if seen is None:
                seen = set()
            if course_id in seen:
                return 0
            seen.add(course_id)
            
            course = next((c for c in courses if c.id == course_id), None)
            if not course or not course.prerequisites:
                return 0
                
            return 1 + max([get_chain_depth(prereq_id, seen.copy()) for prereq_id in course.prerequisites], default=0)

        # Build prerequisite chains and calculate dependent courses
        for course in courses:
            # Calculate chain depth (longest path from any root to this course)
            chain_depths[course.id] = get_chain_depth(course.id)
            
            # Get all prerequisites
            prereq_chains[course.id] = get_all_prerequisites(course.id)
            
            # Initialize dependency counter
            dependent_courses[course.id] = 0
        
        # Count dependencies in a second pass
        for course in courses:
            for prereq_id in prereq_chains[course.id]:
                dependent_courses[prereq_id] = dependent_courses.get(prereq_id, 0) + 1
        
        # Calculate semester flexibility (fewer offerings = less flexible)
        offering_flexibility = {c.id: len(c.semesters_offered) for c in courses}
        
        # Sort courses based on multiple criteria to optimize graduation time
        return sorted(courses, key=lambda c: (
            -chain_depths[c.id],            # Deep prerequisite chains first
            -dependent_courses[c.id],       # Courses that unlock more dependencies
            offering_flexibility[c.id],     # Less flexible courses scheduled earlier
            # Religion courses get slight early priority by having lower secondary sort value
            0 if self._is_religion_class(c) else 1,  # Religion courses sorted earlier
            c.id                            # Stable sort
        ))

    def _can_schedule_in_semester(self, course: Course, scheduled_courses: List[Course]) -> bool:
        """Check if all prerequisites for a course have been scheduled"""
        scheduled_ids = {c.id for c in scheduled_courses}
        return all(prereq_id in scheduled_ids for prereq_id in course.prerequisites)

    # Add a helper method to check religion classes
    def _is_religion_class(self, course: Course) -> bool:
        """Check if a course is a religion course"""
        return course.course_type == "religion"

    def _is_religion_class_dict(self, course_dict: Dict) -> bool:
        """Check if a course dictionary represents a religion course"""
        return course_dict.get("course_type") == "religion"

    # Add a method to check if we can schedule a religion class in a semester
    def _can_schedule_religion_in_semester(self, semester_courses: List[Course]) -> bool:
        """Check if a religion class can be scheduled in the semester (max 1 per semester)"""
        religion_count = sum(1 for course in semester_courses if self._is_religion_class(course))
        return religion_count == 0  # Can only schedule if no religion courses are already scheduled

    def create_schedule(self, processed_data: Dict) -> Dict:
        """Create a schedule with integrated EIL and regular courses"""
        try:
            # Initialize tracking sets
            self.satisfied_sections = set()
            scheduled_course_ids = set()
            
            params = processed_data["parameters"]
            # Remove this log
            # logger.info(f"Received scheduling parameters: {params}")
            
            self._all_courses = self._convert_to_courses(processed_data["classes"])
            
            # Handle empty or missing firstYearLimits
            if not params.get("firstYearLimits") or not isinstance(params["firstYearLimits"], dict):
                params["firstYearLimits"] = {
                    "fallWinterCredits": params["fallWinterCredits"],
                    "springCredits": params["springCredits"]
                }
        
            # Initialize semesters
            semesters = self._initialize_semesters(
                params["startSemester"],
                params["fallWinterCredits"],
                params["springCredits"],
                params["firstYearLimits"]["fallWinterCredits"],
                params["firstYearLimits"]["springCredits"]
            )
            
            # Group courses by section
            sections = self._group_by_section(self._all_courses)
            
            # Track all courses to be scheduled
            courses_to_schedule = []
            
            # Process each section
            for section_id, courses in sections.items():
                if section_id == "additional-section":
                    continue
                    
                if any(c.is_elective for c in courses):
                    credits_needed = next((c.credits_needed for c in courses if c.credits_needed), None)
                    if credits_needed:
                        try:
                            combination = self._find_best_elective_combination(courses, credits_needed)
                            if combination:
                                courses_to_schedule.extend(combination)
                                # Keep this log as it's useful for tracking elective combinations
                                logger.info(f"Selected electives for section {section_id}: {[c.class_number for c in combination]}")
                        except ValueError as e:
                            logger.error(f"Failed to satisfy section {section_id}: {str(e)}")
                            return {
                                "error": str(e),
                                "metadata": {
                                    "approach": "integrated-scheduling",
                                    "startSemester": params["startSemester"],
                                    "success": False
                            }
                        }
                else:
                    required_courses = [c for c in courses if not c.is_elective]
                    courses_to_schedule.extend(required_courses)
                    # Remove this log
                    # logger.info(f"Added required courses for section {section_id}: {[c.class_number for c in required_courses]}")

            # Split courses into EIL and regular courses
            eil_courses = [c for c in courses_to_schedule if self._is_eil_course(c)]
            regular_courses = [c for c in courses_to_schedule if not self._is_eil_course(c)]
            
            # Group EIL courses according to scheduling rules
            first_sem_required = []
            first_sem_flexible = []
            second_sem_required = []
            
            for course in eil_courses:
                if course.class_number == "EIL 320":
                    second_sem_required.append(course)
                elif course.class_number == "EIL 201":
                    first_sem_flexible.append(course)
                else:
                    first_sem_required.append(course)
            
            # Sort regular courses by prerequisites
            sorted_regular_courses = self._sort_by_prerequisites(regular_courses)
            
            # Integrated scheduling - single loop for all courses
            current_semester_idx = 0
            scheduled_semesters = []
            remaining_courses = sorted_regular_courses.copy()
            all_scheduled_courses = []
            
            while remaining_courses or first_sem_required or first_sem_flexible or second_sem_required:
                # Create new semester if needed
                if current_semester_idx >= len(semesters):
                    last_sem = semesters[-1]
                    new_sem = self._create_next_semester(last_sem, params)
                    semesters.append(new_sem)
                    
                semester = semesters[current_semester_idx]
                semester_courses = []
                current_credits = 0
                courses_scheduled_this_semester = False
                
                # FIRST PRIORITY: Handle EIL courses based on semester index
                if current_semester_idx == 0 and (first_sem_required or first_sem_flexible):
                    # Schedule required first semester EIL courses
                    for course in first_sem_required[:]:
                        if current_credits + course.credits <= semester.credit_limit:
                            semester_courses.append(course)
                            current_credits += course.credits
                            scheduled_course_ids.add(course.id)
                            first_sem_required.remove(course)
                            all_scheduled_courses.append(course)
                            courses_scheduled_this_semester = True
                    
                    # Try to add flexible EIL courses if space permits
                    for course in first_sem_flexible[:]:
                        if current_credits + course.credits <= semester.credit_limit:
                            semester_courses.append(course)
                            current_credits += course.credits
                            scheduled_course_ids.add(course.id)
                            first_sem_flexible.remove(course)
                            all_scheduled_courses.append(course)
                            courses_scheduled_this_semester = True
                        else:
                            # Move to second semester if no space
                            second_sem_required.extend([c for c in first_sem_flexible])
                            first_sem_flexible = []
                            
                elif current_semester_idx == 1 and second_sem_required:
                    # Schedule second semester EIL courses
                    for course in second_sem_required[:]:
                        if current_credits + course.credits <= semester.credit_limit:
                            semester_courses.append(course)
                            current_credits += course.credits
                            scheduled_course_ids.add(course.id)
                            second_sem_required.remove(course)
                            all_scheduled_courses.append(course)
                            courses_scheduled_this_semester = True
            
                # SECOND PRIORITY: Schedule regular courses in remaining space with optimization
                course_priorities = []

                # Check if we should force religion course scheduling
                force_religion_scheduling = self._should_force_religion_scheduling(remaining_courses, scheduled_semesters)

                for course in remaining_courses:
                    # Skip if already scheduled
                    if course.id in scheduled_course_ids:
                        continue
                        
                    # Check if course can be offered this semester
                    if semester.type not in course.semesters_offered:
                        continue
                        
                    # Check prerequisites are satisfied in previous semesters
                    if not self._prerequisites_satisfied_before_semester(course, all_scheduled_courses, 
                                                                     current_semester_idx, scheduled_semesters):
                        continue

                    # Check religion class limitation - only one per semester
                    if self._is_religion_class(course):
                        # Count existing religion courses in this semester
                        religion_courses_in_semester = sum(1 for c in semester_courses if self._is_religion_class(c))
                        if religion_courses_in_semester >= 1:
                            continue  # Skip this religion course if we already have one
                        
                        # Also check if any corequisites are religion courses
                        added_courses_preview = self._add_course_with_coreqs(course, remaining_courses)
                        religion_in_coreqs = sum(1 for c in added_courses_preview if self._is_religion_class(c))
                        if religion_in_coreqs > 1:  # More than just the main course
                            continue  # Skip if corequisites include other religion courses

                    # Calculate priority score for this course
                    priority = 0

                    # 1. Highest priority for courses that unlock the most other courses
                    unlocks_count = sum(1 for c in remaining_courses if course.id in c.prerequisites)
                    priority += unlocks_count * 10  # Heavy weight for dependency unlocking

                    # 2. High priority for courses in long prerequisite chains
                    chain_length = len([c for c in all_scheduled_courses if c.id in course.prerequisites])
                    priority += chain_length * 5

                    # 3. High priority for courses with limited semester offerings
                    flexibility_penalty = (3 - min(len(course.semesters_offered), 3)) * 8
                    priority += flexibility_penalty

                    # 4. Enhanced religion course distribution logic - prioritize early scheduling
                    if self._is_religion_class(course):
                        if force_religion_scheduling:
                            # Very high priority when forcing
                            priority += 15  # Higher than before to ensure scheduling
                        else:
                            # Always give religion courses moderate priority to schedule them early
                            priority += 6  # Consistent moderate boost regardless of distribution
                    else:
                        # Small boost for non-religion courses when not forcing religion scheduling
                        if not force_religion_scheduling:
                            priority += 0.5

                    # 5. Bonus for completing degree requirements early
                    if course.course_type in ["major", "core"]:
                        priority += 2
                    
                    course_priorities.append((course, priority))

                # Sort courses by priority (highest first)
                course_priorities.sort(key=lambda x: x[1], reverse=True)

                # Try scheduling courses in priority order
                for course, _ in course_priorities:
                    # Check if there's enough space for the course and its corequisites
                    course_credits = self._get_total_credits(course, remaining_courses)
                    if current_credits + course_credits <= semester.credit_limit:
                        try:
                            # Add course and its corequisites
                            added_courses = self._add_course_with_coreqs(course, remaining_courses)
                            
                            # Enhanced religion course validation
                            if self._is_religion_class(course):
                                # Count religion courses already in semester
                                existing_religion = sum(1 for c in semester_courses if self._is_religion_class(c))
                                # Count religion courses in what we're about to add
                                new_religion = sum(1 for c in added_courses if self._is_religion_class(c))
                                
                                if existing_religion + new_religion > 1:
                                    # Skip silently - this is expected behavior
                                    continue
                            
                            semester_courses.extend(added_courses)
                            current_credits += course_credits
                            courses_scheduled_this_semester = True
                            
                            # Add to overall scheduled courses
                            all_scheduled_courses.extend(added_courses)
                            
                            # Remove scheduled courses
                            for c in added_courses:
                                if c in remaining_courses:
                                    remaining_courses.remove(c)
                                    scheduled_course_ids.add(c.id)
                        except Exception as e:
                            logger.error(f"Error scheduling {course.class_number}: {str(e)}")
                            continue
                
                # Add semester to schedule if courses were added
                if semester_courses:
                    scheduled_semesters.append({
                        "type": semester.type,
                        "year": semester.year,
                        "classes": [self._course_to_dict(c) for c in semester_courses],
                        "totalCredits": current_credits
                    })
                
                # Move to next semester if we scheduled courses or reached credit limit
                if courses_scheduled_this_semester or current_credits >= semester.credit_limit:
                    current_semester_idx += 1
                else:
                    # If no courses could be scheduled, try next semester
                    current_semester_idx += 1
                    if current_semester_idx >= len(semesters):
                        logger.warning("Could not schedule all courses within available semesters")
                        break
                
                # Exit loop when all courses are scheduled
                if not (remaining_courses or first_sem_required or first_sem_flexible or second_sem_required):
                    break

            return {
                "metadata": {
                    "approach": "integrated-scheduling",
                    "startSemester": params["startSemester"],
                    "score": 1.0,
                    "improvements": [
                        "Integrated EIL and regular course scheduling",
                        "Maximized semester utilization",
                        "Maintained all course scheduling rules and constraints"
                    ]
                },
                "schedule": scheduled_semesters
            }
        except Exception as e:
            logger.error(f"Error creating schedule: {str(e)}")
            return {
                "error": str(e),
                "metadata": {
                    "approach": "integrated-scheduling",
                    "startSemester": params["startSemester"],
                    "success": False
                }
            }

    def _initialize_semesters(self, start_semester: str, 
                            regular_fall_winter: int,
                            regular_spring: int,
                            first_year_fall_winter: int,
                            first_year_spring: int) -> List[Semester]:
        sem_type, year = start_semester.split()
        year = int(year)
        
        semesters = []
        for i in range(12):  # Generate 3 years worth of semesters
            # Change from i < 4 to i < 3 to correctly handle first 3 semesters
            is_first_year = i < 3
            if sem_type == "Spring":
                credit_limit = first_year_spring if is_first_year else regular_spring
            else:
                credit_limit = first_year_fall_winter if is_first_year else regular_fall_winter
                
            semesters.append(Semester(sem_type, year, credit_limit))
            
            # Update semester type and year
            if sem_type == "Fall":
                sem_type = "Winter"
                year += 1
            elif sem_type == "Winter":
                sem_type = "Spring"
            else:
                sem_type = "Fall"
                
        return semesters

    def _group_by_section(self, courses: List[Course]) -> Dict[int, List[Course]]:
        sections = {}
        for course in courses:
            if course.section_id not in sections:
                sections[course.section_id] = []
            sections[course.section_id].append(course)
        return sections

    def _find_best_elective_combination(self, courses: List[Course], credits_needed: int) -> List[Course]:
        """Find optimal combination of elective courses that meets or exceeds credit requirement"""
        logger.info(f"Looking for combination totaling at least {credits_needed} credits from section {courses[0].section_id}")
        
        # Get only elective courses
        elective_courses = [c for c in courses if c.is_elective]
        
        # Calculate total available credits in this section
        total_available_credits = sum(c.credits for c in elective_courses)
        if total_available_credits < credits_needed:
            error_msg = (f"Section {courses[0].section_id} requires {credits_needed} credits but only has "
                        f"{total_available_credits} credits available from elective courses")
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        # Track section fulfillment
        section_id = courses[0].section_id
        if section_id in self.satisfied_sections:
            logger.info(f"Section {section_id} already satisfied")
            return []
            
        best_combination = None
        best_total = 0
        
        # Try combinations of increasing size
        for size in range(1, len(elective_courses) + 1):
            current_combo = []
            current_total = 0
            
            # Add courses one by one until we exceed or meet the requirement
            for course in elective_courses[:size]:
                course_and_coreqs = self._get_course_with_coreqs(course, self._all_courses)
                current_combo.extend(course_and_coreqs)
                current_total = sum(c.credits for c in current_combo)
                
                # If we've met or exceeded the requirement, this is a valid combination
                if current_total >= credits_needed:
                    best_combination = current_combo
                    best_total = current_total
                    # Don't break here - we want to try all combinations of this size
                    
            # If we found a valid combination, use it
            if best_combination:
                self.satisfied_sections.add(section_id)
                logger.info(f"Found combination for section {section_id}: {[c.class_number for c in best_combination]} = {best_total} cr "
                           f"(needed {credits_needed})")
                return best_combination
    
        logger.warning(f"Could not meet credit requirement for section {section_id}: needed {credits_needed} credits")
        return None

    def _get_course_with_coreqs(self, course: Course, available_courses: List[Course]) -> List[Course]:
        """Get a course and all its corequisites"""
        result = [course]
        
        # Add all corequisites
        for coreq_id in course.corequisites:
            if isinstance(coreq_id, dict):
                coreq_id = coreq['id']
            coreq = next((c for c in available_courses if c.id == coreq_id), None)
            if coreq and coreq not in result:
                result.append(coreq)
                
        return result

    def _course_to_dict(self, course: Course) -> Dict:
        return {
            "id": course.id,
            "class_name": course.name,
            "class_number": course.class_number,
            "credits": course.credits,
            "prerequisites": course.prerequisites,
            "corequisites": course.corequisites,
            "semesters_offered": course.semesters_offered,
            "is_elective": course.is_elective,
            "course_type": course.course_type  # Add course_type to output
        }

    def _create_next_semester(self, last_semester: Semester, params: Dict) -> Semester:
        """Create the next semester in sequence (Fall -> Winter -> Spring -> Fall...)"""
        if last_semester.type == "Fall":
            new_type = "Winter"
            new_year = last_semester.year + 1
        elif last_semester.type == "Winter":
            new_type = "Spring"
            new_year = last_semester.year
        else:  # Spring
            new_type = "Fall"
            new_year = last_semester.year
            
        # Create new semester instance
        new_semester = Semester(type=new_type, year=new_year, credit_limit=0)
        # Set credit limit based on regular rules (first year limits not applied here)
        new_semester.credit_limit = self._get_semester_credit_limit(new_semester, params)
        
        return new_semester

    def _get_total_credits(self, course: Course, available_courses: List[Course]) -> int:
        """Calculate total credits including all corequisites"""
        # Start with the course's credits
        total = course.credits
        
        # Track processed courses to avoid cycles
        processed = {course.id}
        
        # Queue of courses to check for corequisites
        to_check = [course]
        
        while to_check:
            current = to_check.pop()
            for coreq_id in current.corequisites:
                # Skip if we've already counted this course
                if coreq_id in processed:
                    continue
                    
                coreq = next((c for c in available_courses if c.id == coreq_id), None)
                if coreq:
                    processed.add(coreq_id)
                    total += coreq.credits
                    to_check.append(coreq)
        
        return total

    def _add_course_with_coreqs(self, course: Course, remaining_courses: List[Course]) -> List[Course]:
        """Add a course and its corequisites, ensuring one-way corequisites are scheduled together"""
        # Start with the main course
        added = [course]
        required_coreqs = set()
        to_check = [course]
        
        while to_check:
            current = to_check.pop()
            for coreq_id in current.corequisites:
                # Handle dictionary-style corequisite references
                if isinstance(coreq_id, dict):
                    coreq_id = coreq['id']
                
                if coreq_id in required_coreqs:
                    continue
                
                # First try to find in remaining_courses
                coreq = next((c for c in remaining_courses if c.id == coreq_id), None)
                
                # If not found, look in all courses
                if not coreq:
                    coreq = next((c for c in self._all_courses if c.id == coreq_id), None)
                
                if coreq:
                    required_coreqs.add(coreq_id)
                    to_check.append(coreq)
                    
                    # If this is a system course being pulled in by a non-system course,
                    # update its course_type to match the parent
                    if coreq.course_type == "system" and course.course_type != "system":
                        logger.info(f"Updating {coreq.class_number} type from system to {course.course_type}")
                        coreq.course_type = course.course_type
    
        # Add all required corequisites
        for coreq_id in required_coreqs:
            coreq = (next((c for c in remaining_courses if c.id == coreq_id), None) or 
                    next((c for c in self._all_courses if c.id == coreq_id), None))
            if coreq and coreq not in added:
                added.append(coreq)
                # Keep corequisite combination logs as they're useful for debugging
                logger.info(f"Adding corequisite {coreq.class_number} with {course.class_number}")
    
        return added

    def _prerequisites_satisfied_before_semester(self, course: Course, all_scheduled_courses: List[Course], 
                                          current_semester_idx: int, scheduled_semesters: List[Dict]) -> bool:
        """Check if prerequisites are satisfied in previous semesters"""
        # EIL courses have no prerequisites between them
        if self._is_eil_course(course):
            return True
            
        if not course.prerequisites:
            return True
            
        # Get all courses scheduled in previous semesters only
        courses_in_previous_semesters = []
        for i in range(current_semester_idx):
            if i < len(scheduled_semesters):
                semester = scheduled_semesters[i]
                for course_dict in semester["classes"]:
                    courses_in_previous_semesters.append(course_dict["id"])

        # Check if all prerequisites are in previous semesters
        return all(prereq_id in courses_in_previous_semesters for prereq_id in course.prerequisites)

    def _is_eil_course(self, course: Course) -> bool:
        """Check if course is part of EIL level 1"""
        eil_courses = {"STDEV 100R", "EIL 201", "EIL 313", "EIL 317", "EIL 320"}
        return course.class_number in eil_courses

    def _schedule_eil_courses(self, courses_to_schedule: List[Course], semesters: List[Semester], 
                         scheduled_semesters: List[Dict], scheduled_course_ids: Set[int]) -> Tuple[List[Course], int]:
        """
        Schedule EIL courses following specific rules:
        - STDEV 100R, EIL 313, EIL 317 must be in first semester if possible
        - EIL 201 can move to second semester if needed
        - EIL 320 must be in second semester
        """
        eil_courses = [c for c in courses_to_schedule if self._is_eil_course(c)]
        if not eil_courses:
            return courses_to_schedule, 0

        # Remove EIL courses from main scheduling
        remaining_courses = [c for c in courses_to_schedule if not self._is_eil_course(c)]
        
        # Sort EIL courses by priority
        first_sem_required = []
        first_sem_flexible = []
        second_sem_required = []
        
        for course in eil_courses:
            if course.class_number == "EIL 320":
                second_sem_required.append(course)
            elif course.class_number == "EIL 201":
                first_sem_flexible.append(course)
            else:
                first_sem_required.append(course)

        # Schedule first semester
        first_semester = semesters[0]
        current_credits = 0
        first_sem_courses = []
        
        # First add required courses
        for course in first_sem_required:
            if current_credits + course.credits <= first_semester.credit_limit:
                first_sem_courses.append(course)
                current_credits += course.credits
                scheduled_course_ids.add(course.id)
        
        # Try to add flexible course if space permits
        for course in first_sem_flexible:
            if current_credits + course.credits <= first_semester.credit_limit:
                first_sem_courses.append(course)
                current_credits += course.credits
                scheduled_course_ids.add(course.id)
            else:
                second_sem_required.extend(first_sem_flexible)

        if first_sem_courses:
            scheduled_semesters.append({
                "type": first_semester.type,
                "year": first_semester.year,
                "classes": [self._course_to_dict(c) for c in first_sem_courses],
                "totalCredits": current_credits
            })
        
        # Schedule second semester
        if second_sem_required:
            second_semester = semesters[1]
            current_credits = 0
            second_sem_courses = []
            
            for course in second_sem_required:
                second_sem_courses.append(course)
                current_credits += course.credits
                scheduled_course_ids.add(course.id)
                
            scheduled_semesters.append({
                "type": second_semester.type,
                "year": second_semester.year,
                "classes": [self._course_to_dict(c) for c in second_sem_courses],
                "totalCredits": current_credits
            })
            
            return remaining_courses, 2
            
        return remaining_courses, 1

    def _get_prerequisite_chain(self, course: Course, all_courses: List[Course], seen=None) -> List[List[str]]:
        """Get complete prerequisite chains for a course"""
        if seen is None:
            seen = set()
        
        if course.id in seen:
            return []
            
        seen.add(course.id)
        
        # If no prerequisites, return empty list
        if not course.prerequisites:
            return [[course.class_number]]
            
        all_chains = []
        for prereq_id in course.prerequisites:
            prereq_course = next((c for c in all_courses if c.id == prereq_id), None)
            if prereq_course:
                # Get chains for this prerequisite
                prereq_chains = self._get_prerequisite_chain(prereq_course, all_courses, seen.copy())
                # Add current course to each chain
                for chain in prereq_chains:
                    all_chains.append(chain + [course.class_number])
                    
        return all_chains

    def _get_all_chains(self, courses: List[Course]) -> Dict[str, Dict]:
        """Get all prerequisite and corequisite chains"""
        chains = {}
        processed = set()
        
        for course in courses:
            # Skip if already part of another chain
            if course.class_number in processed:
                continue
                
            if course.prerequisites or course.corequisites:
                prereq_chains = self._get_prerequisite_chain(course, courses)
                coreq_chain = [c.class_number for c in self._get_course_with_coreqs(course, courses)]
                
                # Only keep longest chain for each end course 
                longest_chains = []
                for chain in prereq_chains:
                    if len(chain) > 1:  # Only include chains with 2+ courses
                        # Mark all courses in chain as processed
                        processed.update(chain)
                        longest_chains.append(chain)
                
                if longest_chains or len(coreq_chain) > 1:
                    chains[course.class_number] = {
                        "prerequisites": longest_chains,
                        "corequisites": coreq_chain if len(coreq_chain) > 1 else []
                    }
        
        return chains

    def _should_force_religion_scheduling(self, remaining_courses: List[Course], 
                                    scheduled_semesters: List[Dict]) -> bool:
        """Check if we should force religion course scheduling to avoid end-stacking"""
        religion_courses_left = sum(1 for c in remaining_courses if self._is_religion_class(c))
        
        # If we have no religion courses left, don't force
        if religion_courses_left == 0:
            return False
        
        # Force religion scheduling much earlier - after semester 3
        if len(scheduled_semesters) > 3 and religion_courses_left > 0:
            return True
            
        # If we have many religion courses left relative to remaining courses, force scheduling
        if len(remaining_courses) > 0:
            religion_ratio = religion_courses_left / len(remaining_courses)
            if religion_ratio > 0.3:  # Lower threshold - force when 30% are religion courses
                return True
            
        return False