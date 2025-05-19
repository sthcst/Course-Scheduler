from typing import Dict, List, Set, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime
import logging

@dataclass
class Course:
    id: int
    name: str
    class_number: str  # Add class number field
    credits: int
    prerequisites: List[int]
    corequisites: List[int]
    semesters_offered: List[str]
    is_elective: bool
    section_id: int
    credits_needed: int = None

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

    def create_schedule(self, processed_data: Dict) -> Dict:
        """Create a schedule distributing electives across semesters"""
        params = processed_data["parameters"]
        logger.info(f"Received scheduling parameters: {params}")
        
        # Handle empty or missing firstYearLimits
        if not params.get("firstYearLimits") or not isinstance(params["firstYearLimits"], dict):
            params["firstYearLimits"] = {
                "fallWinterCredits": params["fallWinterCredits"],
                "springCredits": params["springCredits"]
            }
        else:
            # Ensure both required keys exist with defaults
            params["firstYearLimits"] = {
                "fallWinterCredits": params["firstYearLimits"].get("fallWinterCredits", params["fallWinterCredits"]),
                "springCredits": params["firstYearLimits"].get("springCredits", params["springCredits"])
            }
        
        logger.info(f"Using first year limits: {params['firstYearLimits']}")
        
        # Initialize semesters with logging
        semesters = self._initialize_semesters(
            params["startSemester"],
            params["fallWinterCredits"],
            params["springCredits"],
            params["firstYearLimits"]["fallWinterCredits"],
            params["firstYearLimits"]["springCredits"]
        )
        
        logger.info("Initialized semesters with credit limits:")
        for i, sem in enumerate(semesters):
            logger.info(f"Semester {i+1}: {sem.type} {sem.year}, Credit limit: {sem.credit_limit}")
        
        # Store all courses for reference
        self._all_courses = self._convert_to_courses(processed_data["classes"])
        
        # Group courses by section
        sections = self._group_by_section(self._all_courses)
        
        # Track chosen electives
        chosen_electives = []
        scheduled_semesters = []
        
        # First, find all elective combinations
        for section_id, courses in sections.items():
            if not any(c.is_elective for c in courses):
                continue
                
            credits_needed = next((c.credits_needed for c in courses if c.credits_needed), None)
            if not credits_needed:
                continue
            
            # Find valid combination
            combination = self._find_best_elective_combination(courses, credits_needed)
            if combination:
                chosen_electives.extend(combination)
                logger.info(f"Selected combination for section {section_id}: {[c.class_number for c in combination]}")

        # Sort courses by prerequisites
        sorted_courses = self._sort_by_prerequisites(chosen_electives)
        remaining_courses = sorted_courses.copy()
        current_semester_idx = 0
        
        # Keep scheduling until all courses are placed
        while remaining_courses:
            # Create new semester if needed
            if current_semester_idx >= len(semesters):
                last_sem = semesters[-1]
                new_sem = self._create_next_semester(last_sem, params)
                semesters.append(new_sem)
                logger.info(f"Added new semester: {new_sem.type} {new_sem.year} with limit {new_sem.credit_limit}")
            
            semester = semesters[current_semester_idx]
            semester_courses = []
            current_credits = 0
            
            # Create a copy for iteration
            courses_to_try = remaining_courses.copy()
            
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
                        
                        # Safely remove scheduled courses
                        for c in added_courses:
                            try:
                                if c in remaining_courses:  # Check if course is still in list
                                    remaining_courses.remove(c)
                                    logger.info(f"Removed {c.class_number} from remaining courses")
                            except ValueError as e:
                                logger.warning(f"Could not remove {c.class_number}: {str(e)}")
                                continue
                                
                        logger.info(f"Scheduled {course.class_number} (+{course_credits} cr) in {semester.type} {semester.year}")
                    except Exception as e:
                        logger.error(f"Error scheduling {course.class_number}: {str(e)}")
                        continue
    
            if semester_courses:
                scheduled_semesters.append({
                    "type": semester.type,
                    "year": semester.year,
                    "classes": [self._course_to_dict(c) for c in semester_courses],
                    "totalCredits": current_credits
                })
                
            current_semester_idx += 1

        return {
            "metadata": {
                "approach": "testing-electives",
                "startSemester": params["startSemester"],
                "score": 1.0,
                "improvements": ["Distributed electives across semesters respecting credit limits"]
            },
            "schedule": scheduled_semesters
        }

    def _convert_to_courses(self, raw_classes: Dict) -> List[Course]:
        courses = []
        for id, data in raw_classes.items():
            course = Course(
                id=int(id),
                name=data["class_name"],
                class_number=data.get("class_number", ""),  # Add class_number field
                credits=data["credits"],
                prerequisites=data.get("prerequisites", []),
                corequisites=data.get("corequisites", []),
                semesters_offered=data["semesters_offered"],
                is_elective=data.get("is_elective", False),
                section_id=data["section_id"],
                credits_needed=data.get("credits_needed")
            )
            courses.append(course)
        return courses

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
        """Find combination of courses that meets credit requirement"""
        logger.info(f"Looking for combination totaling {credits_needed} credits from section {courses[0].section_id}")
        
        elective_courses = [c for c in courses if c.is_elective]
        chosen_courses = []
        remaining_credits = credits_needed
        
        # Sort courses by credits (try larger credit courses first)
        sorted_courses = sorted(elective_courses, key=lambda x: x.credits, reverse=True)
        
        for course in sorted_courses:
            if remaining_credits <= 0:
                break
                
            # Calculate credits including corequisites
            course_credits = course.credits
            coreq_courses = []
            
            # Get corequisite courses and their credits
            for coreq_id in course.corequisites:
                coreq = next((c for c in self._all_courses if c.id == coreq_id), None)
                if coreq:
                    course_credits += coreq.credits
                    coreq_courses.append(coreq)
            
            if remaining_credits >= course_credits:
                chosen_courses.append(course)
                chosen_courses.extend(coreq_courses)
                remaining_credits -= course_credits
                logger.info(f"Added {course.class_number} (+{course_credits} cr) to section. Remaining: {remaining_credits}")
        
        if remaining_credits > 0:
            logger.warning(f"Could not fully satisfy section requirement. Short by {remaining_credits} credits")
            return None
        
        logger.info(f"Found combination: {[c.class_number for c in chosen_courses]} = {sum(c.credits for c in chosen_courses)} cr")
        return chosen_courses

    def _course_to_dict(self, course: Course) -> Dict:
        return {
            "id": course.id,
            "class_name": course.name,
            "class_number": course.class_number,  # Add class number to output
            "credits": course.credits,
            "prerequisites": course.prerequisites,
            "corequisites": course.corequisites,
            "semesters_offered": course.semesters_offered,
            "is_elective": course.is_elective
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
        """Calculate total credits including corequisites"""
        total = course.credits
        for coreq_id in course.corequisites:
            coreq = next((c for c in available_courses if c.id == coreq_id), None)
            if coreq:
                total += coreq.credits
        return total

    def _add_course_with_coreqs(self, course: Course, available_courses: List[Course]) -> List[Course]:
        """Add a course and its corequisites"""
        added = [course]
        for coreq_id in course.corequisites:
            coreq = next((c for c in available_courses if c.id == coreq_id), None)
            if coreq:
                added.append(coreq)
        return added