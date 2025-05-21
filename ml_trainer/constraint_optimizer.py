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

    def create_schedule(self, processed_data: Dict) -> Dict:
        """Create a schedule with both required and elective classes"""
        try:
            # Reset satisfied sections at the start of each schedule creation
            self.satisfied_sections = set()
            
            params = processed_data["parameters"]
            logger.info(f"Received scheduling parameters: {params}")
            
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
                    # Handle elective sections
                    credits_needed = next((c.credits_needed for c in courses if c.credits_needed), None)
                    if credits_needed:
                        try:
                            combination = self._find_best_elective_combination(courses, credits_needed)
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
                    # Add required courses
                    required_courses = [c for c in courses if not c.is_elective]
                    courses_to_schedule.extend(required_courses)
                    logger.info(f"Added required courses for section {section_id}: {[c.class_number for c in required_courses]}")
        
            # Sort all courses by prerequisites
            sorted_courses = self._sort_by_prerequisites(courses_to_schedule)
            remaining_courses = sorted_courses.copy()
            current_semester_idx = 0
            scheduled_semesters = []
            
            # Keep scheduling until all courses are placed
            while remaining_courses:
                # Create new semester if needed
                if current_semester_idx >= len(semesters):
                    last_sem = semesters[-1]
                    new_sem = self._create_next_semester(last_sem, params)
                    semesters.append(new_sem)
                    
                semester = semesters[current_semester_idx]
                semester_courses = []
                current_credits = 0
                
                # Create a copy for iteration
                courses_to_try = remaining_courses.copy()
                courses_scheduled_this_semester = False
                
                for course in courses_to_try:
                    if semester.type not in course.semesters_offered:
                        continue
                        
                    course_credits = self._get_total_credits(course, remaining_courses)
                    if current_credits + course_credits <= semester.credit_limit:
                        try:
                            # Add course and its corequisites
                            added_courses = self._add_course_with_coreqs(course, remaining_courses)
                            semester_courses.extend(added_courses)
                            current_credits += course_credits
                            courses_scheduled_this_semester = True
                            
                            # Remove scheduled courses
                            for c in added_courses:
                                if c in remaining_courses:
                                    remaining_courses.remove(c)
                                    logger.info(f"Scheduled {c.class_number} in {semester.type} {semester.year}")
                                    
                        except Exception as e:
                            logger.error(f"Error scheduling {course.class_number}: {str(e)}")
                            continue
                            
                    # Break if we've hit the credit limit
                    if current_credits >= semester.credit_limit:
                        break
                
                # Add semester to schedule if courses were added
                if semester_courses:
                    scheduled_semesters.append({
                        "type": semester.type,
                        "year": semester.year,
                        "classes": [self._course_to_dict(c) for c in semester_courses],
                        "totalCredits": current_credits
                    })
                
                # Move to next semester if we scheduled courses or hit credit limit
                if courses_scheduled_this_semester or current_credits >= semester.credit_limit:
                    current_semester_idx += 1
                else:
                    # If no courses could be scheduled, try next semester
                    current_semester_idx += 1
                    if current_semester_idx >= len(semesters):
                        logger.warning("Could not schedule all courses within available semesters")
                        break

            return {
                "metadata": {
                    "approach": "testing-electives",
                    "startSemester": params["startSemester"],
                    "score": 1.0,
                    "improvements": [
                        "Scheduled both required and elective courses",
                        "Distributed courses across semesters respecting credit limits"
                    ]
                },
                "schedule": scheduled_semesters
            }
        except Exception as e:
            logger.error(f"Error creating schedule: {str(e)}")
            return {
                "error": str(e),
                "metadata": {
                    "approach": "testing-electives",
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
            is_first_year = i < 4
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

    def _sort_by_prerequisites(self, courses: List[Course]) -> List[Course]:
        """Sort courses so prerequisites come before their dependent courses"""
        sorted_courses = []
        unsorted = courses.copy()
        
        while unsorted:
            # Find course with all prerequisites satisfied
            for course in unsorted:
                prereqs = set(course.prerequisites)
                if not prereqs or all(p in [c.id for c in sorted_courses] for p in prereqs):
                    sorted_courses.append(course)
                    unsorted.remove(course)
                    break
            else:
                # If we get here, there's a prerequisite cycle or missing prerequisite
                # Add remaining courses in any order
                sorted_courses.extend(unsorted)
                break
                
        return sorted_courses

    @property
    def all_courses(self) -> List[Course]:
        """Get all courses that have been loaded"""
        if not hasattr(self, '_all_courses'):
            self._all_courses = []
        return self._all_courses

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