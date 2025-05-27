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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
                course_type=data.get("course_type", "")  # Get course_type directly from data
            )
            courses.append(course)
            logger.info(f"Created course {course.class_number} with type {course.course_type}")
        return courses

    def _sort_by_prerequisites(self, courses: List[Course]) -> List[Course]:
        """Sort courses so prerequisites come before their dependent courses"""
        # Create a mapping of course IDs to their full prerequisite chains
        prereq_chains = {}
        
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

        # Build complete prerequisite chains for all courses    
        for course in courses:
            prereq_chains[course.id] = get_all_prerequisites(course.id)
        
        # Sort based on prerequisite chain length and course type
        return sorted(courses, key=lambda c: (
            len(prereq_chains[c.id]),
            not self._is_religion_class(c),
            c.id
        ))

    def _can_schedule_in_semester(self, course: Course, scheduled_courses: List[Course]) -> bool:
        """Check if all prerequisites for a course have been scheduled"""
        scheduled_ids = {c.id for c in scheduled_courses}
        return all(prereq_id in scheduled_ids for prereq_id in course.prerequisites)

    # Add a helper method to check religion classes
    def _is_religion_class(self, course: Course) -> bool:
        """Check if a course is a religion course"""
        return course.course_type == "religion"

    # Add a method to check if we can schedule a religion class in a semester
    def _can_schedule_religion_in_semester(self, semester_courses: List[Course]) -> bool:
        """Check if a religion class can be scheduled in the semester"""
        return not any(self._is_religion_class(course) for course in semester_courses)

    def create_schedule(self, processed_data: Dict) -> Dict:
        """Create a schedule with both required and elective classes"""
        try:
            # Initialize tracking sets
            self.satisfied_sections = set()
            scheduled_course_ids = set() # Tracks IDs of all courses ever scheduled
            
            params = processed_data["parameters"]
            logger.info(f"Received scheduling parameters: {params}")
            
            self._all_courses = self._convert_to_courses(processed_data["classes"])
            
            if not params.get("firstYearLimits") or not isinstance(params["firstYearLimits"], dict):
                params["firstYearLimits"] = {
                    "fallWinterCredits": params["fallWinterCredits"],
                    "springCredits": params["springCredits"]
                }
        
            semesters = self._initialize_semesters(
                params["startSemester"],
                params["fallWinterCredits"],
                params["springCredits"],
                params["firstYearLimits"]["fallWinterCredits"],
                params["firstYearLimits"]["springCredits"]
            )
            
            sections = self._group_by_section(self._all_courses)
            courses_to_schedule = []
            
            for section_id, courses_in_section in sections.items():
                if section_id == "additional-section":
                    continue
                    
                if any(c.is_elective for c in courses_in_section):
                    credits_needed = next((c.credits_needed for c in courses_in_section if c.credits_needed is not None), None)
                    if credits_needed:
                        try:
                            combination = self._find_best_elective_combination(courses_in_section, credits_needed)
                            if combination:
                                courses_to_schedule.extend(combination)
                                logger.info(f"Selected electives for section {section_id}: {[c.class_number for c in combination]}")
                        except ValueError as e:
                            logger.error(f"Failed to satisfy section {section_id}: {str(e)}")
                            return {
                                "error": str(e),
                                "metadata": {
                                    "approach": "testing-electives",
                                    "startSemester": params["startSemester"],
                                    "success": False
                                }
                            }
                else:
                    required_courses = [c for c in courses_in_section if not c.is_elective]
                    courses_to_schedule.extend(required_courses)
                    logger.info(f"Added required courses for section {section_id}: {[c.class_number for c in required_courses]}")
        
            sorted_initial_courses = self._sort_by_prerequisites(courses_to_schedule)
            remaining_courses = sorted_initial_courses.copy() # This list will shrink
            
            scheduled_semesters = []
            all_scheduled_courses_objects = [] # For prerequisite checking, stores Course objects
            
            # Handle EIL courses first
            # EIL scheduling might modify remaining_courses and scheduled_semesters, and returns the new starting semester index
            remaining_courses, current_semester_idx = self._schedule_eil_courses(
                remaining_courses, # Pass the modifiable list
                semesters,
                scheduled_semesters,
                scheduled_course_ids,
                all_scheduled_courses_objects # EIL courses also need to be added here
            )
            
            # Main scheduling loop
            while remaining_courses:
                if current_semester_idx >= len(semesters):
                    last_sem = semesters[-1] if semesters else Semester(type="Spring", year=int(params["startSemester"].split()[1])-1, credit_limit=0)
                    new_sem = self._create_next_semester(last_sem, params)
                    semesters.append(new_sem)
                    
                semester = semesters[current_semester_idx]
                
                current_semester_scheduled_course_objects = []
                current_semester_credits = 0
                
                # First, schedule any EIL reservations for this semester
                eil_reservations = self._get_eil_reservations_for_semester(current_semester_idx)
                for eil_course in eil_reservations:
                    current_semester_scheduled_course_objects.append(eil_course)
                    current_semester_credits += eil_course.credits
                    scheduled_course_ids.add(eil_course.id)
                    all_scheduled_courses_objects.append(eil_course)
                    logger.info(f"Scheduled reserved EIL course {eil_course.class_number} ({eil_course.id}) in {semester.type} {semester.year}")
                
                # Then continue with regular scheduling for remaining space
                while True:
                    course_added_in_this_pass = False
                    for course_candidate in remaining_courses[:]: 
                        # Check if course_candidate itself can be scheduled
                        if semester.type not in course_candidate.semesters_offered:
                            continue
                        
                        # Prerequisites must be in formally completed previous semesters
                        if not self._prerequisites_satisfied_before_semester(course_candidate, all_scheduled_courses_objects, current_semester_idx, scheduled_semesters):
                            continue
                        
                        # Religion check for the candidate course against courses already in this semester build-up
                        if self._is_religion_class(course_candidate) and not self._can_schedule_religion_in_semester(current_semester_scheduled_course_objects):
                            continue

                        # Determine the bundle (course_candidate + its corequisites from remaining_courses)
                        bundle_to_schedule = self._add_course_with_coreqs(course_candidate, remaining_courses)
                        
                        bundle_is_valid_for_semester = True
                        prospective_bundle_credits = 0
                        
                        # Validate all courses in the bundle for this semester
                        temp_semester_courses_for_bundle_check = list(current_semester_scheduled_course_objects)

                        for c_in_bundle in bundle_to_schedule:
                            if c_in_bundle not in remaining_courses and c_in_bundle != course_candidate:
                                pass

                            if semester.type not in c_in_bundle.semesters_offered:
                                bundle_is_valid_for_semester = False
                                break
                            
                            if self._is_religion_class(c_in_bundle):
                                if not self._can_schedule_religion_in_semester(temp_semester_courses_for_bundle_check):
                                    bundle_is_valid_for_semester = False
                                    break
                                temp_semester_courses_for_bundle_check.append(c_in_bundle) 
                            
                            prospective_bundle_credits += c_in_bundle.credits

                        if not bundle_is_valid_for_semester:
                            continue
                        
                        # Specific check: a religion course cannot have other religion courses as corequisites in the bundle
                        if self._is_religion_class(course_candidate) and \
                           any(self._is_religion_class(c) for c in bundle_to_schedule if c != course_candidate):
                            logger.warning(f"Skipping {course_candidate.class_number} ({course_candidate.id}) - religion course with another religion course in its direct bundle.")
                            continue
                        
                        # Final credit check for the bundle (accounting for EIL courses already scheduled)
                        if current_semester_credits + prospective_bundle_credits <= semester.credit_limit:
                            # Schedule the bundle
                            current_semester_scheduled_course_objects.extend(bundle_to_schedule)
                            current_semester_credits += prospective_bundle_credits
                            
                            for c_added in bundle_to_schedule:
                                if c_added in remaining_courses:
                                    remaining_courses.remove(c_added)
                                scheduled_course_ids.add(c_added.id)
                                all_scheduled_courses_objects.append(c_added)
                                logger.info(f"Scheduled {c_added.class_number} ({c_added.id}) in {semester.type} {semester.year}")
                            
                            course_added_in_this_pass = True
                            break 
                    
                    if not course_added_in_this_pass:
                        break
                
                # Finished trying to fill the current semester
                if current_semester_scheduled_course_objects:
                    scheduled_semesters.append({
                        "type": semester.type,
                        "year": semester.year,
                        "classes": [self._course_to_dict(c) for c in current_semester_scheduled_course_objects],
                        "totalCredits": current_semester_credits
                    })
                
                current_semester_idx += 1

            # Final check if all courses were scheduled
            if remaining_courses:
                logger.warning(f"Could not schedule all courses. Remaining: {[c.class_number for c in remaining_courses]}")
                # Potentially add error information to the output if this is critical
                # For now, it will just return the schedule as is.

            return {
                "metadata": {
                    "approach": "testing-electives-maximized-credits",
                    "startSemester": params["startSemester"],
                    "score": 1.0, # Score might need re-evaluation based on completion
                    "improvements": [
                        "Scheduled both required and elective courses",
                        "Distributed courses across semesters respecting credit limits",
                        "Attempted to maximize credits per semester"
                    ]
                },
                "schedule": scheduled_semesters
            }
        except Exception as e:
            logger.error(f"Error creating schedule: {str(e)}", exc_info=True)
            return {
                "error": str(e),
                "metadata": {
                    "approach": "testing-electives-maximized-credits",
                    "startSemester": params.get("startSemester", "Unknown"),
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
                coreq_id = coreq_id['id']
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

    def _add_course_with_coreqs(self, course: Course, available_courses: List[Course]) -> List[Course]:
        """Add a course and its corequisites"""
        # Start with the main course
        added = [course]
        
        # Track all courses we need to add to maintain corequisite relationships
        required_coreqs = set()
        
        # First pass: collect all required corequisites
        to_check = [course]
        while to_check:
            current = to_check.pop()
            for coreq_id in current.corequisites:
                # Skip if we've already processed this corequisite
                if coreq_id in required_coreqs:
                    continue
                    
                # Find the corequisite course
                coreq = next((c for c in available_courses if c.id == coreq_id), None)
                if coreq:
                    required_coreqs.add(coreq_id)
                    to_check.append(coreq)
                    
                    # Also check this course's corequisites
                    for nested_coreq_id in coreq.corequisites:
                        if nested_coreq_id not in required_coreqs:
                            nested_coreq = next((c for c in available_courses if c.id == nested_coreq_id), None)
                            if nested_coreq:
                                required_coreqs.add(nested_coreq_id)
                                to_check.append(nested_coreq)
        
        # Second pass: add all required corequisites
        for coreq_id in required_coreqs:
            coreq = next((c for c in available_courses if c.id == coreq_id), None)
            if coreq and coreq not in added:
                added.append(coreq)
        
        logger.info(f"Adding course {course.class_number} with corequisites: {[c.class_number for c in added[1:]]}")
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
        """Check if course is part of EIL/Holokai program"""
        # Use course_type for general detection
        return course.course_type == "eil/holokai"

    def _schedule_eil_courses(self, current_remaining_courses: List[Course], 
                              semesters: List[Semester], 
                              scheduled_semesters: List[Dict], 
                              scheduled_course_ids: Set[int],
                              all_scheduled_courses_objects: List[Course]) -> Tuple[List[Course], int]:
        """
        Schedule EIL/Holokai courses following specific rules, but allow other courses to fill remaining space.
        EIL 320 must be in second semester.
        If starting in Spring with limited credits, EIL 201 can also be in second semester.
        """
        eil_courses_to_process = [c for c in current_remaining_courses if self._is_eil_course(c)]
        if not eil_courses_to_process:
            return current_remaining_courses, 0

        # Filter out EIL courses from the main list that will be returned
        non_eil_remaining_courses = [c for c in current_remaining_courses if not self._is_eil_course(c)]
        
        # Find specific EIL courses by class number
        eil_320 = next((c for c in eil_courses_to_process if "EIL 320" in c.class_number), None)
        eil_201 = next((c for c in eil_courses_to_process if "EIL 201" in c.class_number), None)
        other_eil_courses = [c for c in eil_courses_to_process if c not in [eil_320, eil_201]]
        
        # Determine start semester type for special logic
        start_semester_type = semesters[0].type if semesters else "Fall"
        
        # Schedule EIL courses but don't create complete semesters yet - just reserve the courses
        eil_reservations = {}  # semester_index -> list of EIL courses to schedule
        
        # First semester reservations
        if len(semesters) > 0:
            first_semester_eil = []
            
            # Schedule non-320 EIL courses in first semester (except 201 if spring start with limited credits)
            courses_for_first = other_eil_courses.copy()
            if eil_201 and not (start_semester_type == "Spring" and semesters[0].credit_limit <= 9):
                courses_for_first.append(eil_201)
            
            for course in courses_for_first:
                if semesters[0].type in course.semesters_offered:
                    first_semester_eil.append(course)
                    if course in eil_courses_to_process:
                        eil_courses_to_process.remove(course)
                    logger.info(f"Reserved EIL course {course.class_number} for first semester")
            
            if first_semester_eil:
                eil_reservations[0] = first_semester_eil
        
        # Second semester reservations (EIL 320 must go here)
        if len(semesters) > 1:
            second_semester_eil = []
            
            # Always schedule EIL 320 in second semester
            if eil_320 and semesters[1].type in eil_320.semesters_offered:
                second_semester_eil.append(eil_320)
                eil_courses_to_process.remove(eil_320)
                logger.info(f"Reserved EIL 320 for second semester")
            
            # Schedule EIL 201 in second semester if spring start with limited credits
            if (eil_201 and start_semester_type == "Spring" and 
                semesters[0].credit_limit <= 9 and 
                semesters[1].type in eil_201.semesters_offered):
                second_semester_eil.append(eil_201)
                if eil_201 in eil_courses_to_process:
                    eil_courses_to_process.remove(eil_201)
                logger.info(f"Reserved EIL 201 for second semester (spring start with limited credits)")
            
            if second_semester_eil:
                eil_reservations[1] = second_semester_eil
        
        # Store reservations for use in main scheduling loop
        self.eil_reservations = eil_reservations
        
        # Put remaining EIL courses back into the general pool
        non_eil_remaining_courses.extend(eil_courses_to_process)
        
        # Return all non-reserved courses and start from semester 0
        return non_eil_remaining_courses, 0

    def _get_eil_reservations_for_semester(self, semester_idx: int) -> List[Course]:
        """Get EIL courses reserved for a specific semester"""
        return getattr(self, 'eil_reservations', {}).get(semester_idx, [])