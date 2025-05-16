from typing import Dict, List, Set, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime

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

class ScheduleOptimizer:
    def __init__(self):
        self.satisfied_sections: Set[int] = set()
        
    def create_schedule(self, processed_data: Dict) -> Dict:
        """Create a schedule focusing only on elective sections"""
        params = processed_data["parameters"]
        classes = processed_data["classes"]
        
        # Store all courses for reference
        self._all_courses = self._convert_to_courses(classes)
        
        # Initialize one semester to hold the elective choices
        test_semester = Semester("Fall", 2025, 16)
        
        # Group courses by section
        sections = self._group_by_section(self._all_courses)
        
        # Track chosen electives
        chosen_electives = []
        
        # Only process elective sections
        for section_id, courses in sections.items():
            # Skip if not an elective section
            if not any(c.is_elective for c in courses):
                continue
                
            credits_needed = next((c.credits_needed for c in courses if c.credits_needed), None)
            if not credits_needed:
                continue
            
            # Find valid combination
            combination = self._find_best_elective_combination(courses, credits_needed)
            if combination:
                chosen_electives.extend(combination)
        
        # Put all chosen electives in the test semester
        test_semester.classes = chosen_electives
        
        # Convert to response format
        schedule = [{
            "type": test_semester.type,
            "year": test_semester.year,
            "classes": [self._course_to_dict(c) for c in test_semester.classes],
            "totalCredits": test_semester.total_credits
        }]
        
        return {
            "metadata": {
                "approach": "testing-electives",
                "startSemester": params["startSemester"],
                "score": 1.0,
                "improvements": ["Testing elective selection only"]
            },
            "schedule": schedule
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

    def _find_best_elective_combination(self, courses: List[Course], 
                                      credits_needed: int) -> List[Course]:
        """Find best combination of elective courses that meets credit requirement"""
        
        def get_course_with_coreqs(course: Course) -> Tuple[int, List[Course]]:
            """Get total credits and list of courses including corequisites"""
            total_credits = course.credits
            course_group = [course]
            
            # Add corequisite courses and their credits
            for coreq_id in course.corequisites:
                coreq = next((c for c in self._all_courses if c.id == coreq_id), None)
                if coreq:
                    total_credits += coreq.credits
                    course_group.append(coreq)
                    
            return total_credits, course_group

        def get_combinations(available_courses: List[Course], target_credits: int) -> List[List[Course]]:
            """Get all possible combinations of courses that sum to target credits"""
            valid_combinations = []
            
            def backtrack(start: int, remaining_credits: int, current: List[Course]):
                if remaining_credits == 0:
                    valid_combinations.append(current[:])
                    return
                if remaining_credits < 0:
                    return
                    
                for i in range(start, len(available_courses)):
                    course = available_courses[i]
                    # Get course credits including corequisites
                    total_credits, course_group = get_course_with_coreqs(course)
                    
                    # Add all courses from group
                    for c in course_group:
                        current.append(c)
                    backtrack(i + 1, remaining_credits - total_credits, current)
                    # Remove all courses from group
                    for _ in range(len(course_group)):
                        current.pop()
                        
            backtrack(0, target_credits, [])
            return valid_combinations

        # Get elective courses only
        elective_courses = [c for c in courses if c.is_elective]
        
        # First try single courses with their corequisites
        for course in elective_courses:
            total_credits, course_group = get_course_with_coreqs(course)
            if total_credits == credits_needed:
                print(f"Found combination with coreqs: {[c.class_number for c in course_group]} = {total_credits} credits")
                return course_group
                
        # If no single course + coreqs matches, try combinations
        combinations = get_combinations(elective_courses, credits_needed)
        
        if combinations:
            chosen_combo = combinations[0]
            print(f"Found combination: {[c.class_number for c in chosen_combo]} = {sum(c.credits for c in chosen_combo)} credits")
            return chosen_combo
            
        print(f"No valid combinations found for {credits_needed} credits in section")
        return None

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

    @property
    def all_courses(self) -> List[Course]:
        """Get all courses that have been loaded"""
        if not hasattr(self, '_all_courses'):
            self._all_courses = []
        return self._all_courses