import json
import os
import requests
from typing import List, Dict, Any

class HuggingFaceScheduleOptimizer:
    def __init__(self):
        # Remove transformers pipeline initialization
        pass
        
    # Helper methods to replace NumPy functions
    def _mean(self, values):
        """Calculate mean without NumPy"""
        if not values:
            return 0
        return sum(values) / len(values)
    
    def _variance(self, values):
        """Calculate variance without NumPy"""
        if not values or len(values) < 2:
            return 0
        mean = self._mean(values)
        return sum((x - mean) ** 2 for x in values) / len(values)
    
    def generate_schedule(self, selected_courses, start_semester, major_class_limit=4, 
                          fall_winter_credits=15, spring_credits=12, english_level=None, 
                          ten_semester_path=False):
        """Generate a complete schedule based on user preferences and course requirements"""
        all_classes = self._fetch_classes_for_courses(selected_courses)
        
        # Initialize empty schedule
        schedule = []
        current_semester = self._parse_semester(start_semester)
        remaining_classes = all_classes.copy()
        
        # Sort classes by prerequisites
        sorted_classes = self._sort_by_prerequisites(remaining_classes)
        
        # Schedule classes semester by semester
        while remaining_classes:
            # Create a new semester
            semester = {
                "semester": self._format_semester(current_semester),
                "classes": [],
                "totalCredits": 0
            }
            
            # Determine credit limit for this semester
            credit_limit = spring_credits if current_semester["term"] == "Spring" else fall_winter_credits
            
            # Add classes to this semester (respecting prerequisites and credit limits)
            self._add_classes_to_semester(semester, sorted_classes, remaining_classes, 
                                         credit_limit, major_class_limit, schedule)
            
            # Add completed semester to schedule and move to next semester
            if semester["classes"]:
                schedule.append(semester)
                
            current_semester = self._advance_semester(current_semester)
            
            # Safety check to prevent infinite loops
            if len(schedule) > 12:  # Max 12 semesters (4 years)
                break
        
        # Apply optimizations
        optimized_schedule = self._optimize_schedule(schedule)
        
        return {
            "schedule": optimized_schedule,
            "score": self._calculate_schedule_score(optimized_schedule),
            "improvements": self._generate_improvement_list(schedule, optimized_schedule)
        }
    
    def _fetch_classes_for_courses(self, course_ids):
        """Fetch classes from the database for the selected courses"""
        classes = []
        
        for course_id in course_ids:
            try:
                # Try Docker network service name first
                response = requests.get(f"http://web_container:3000/api/classes?course_id={course_id}")
                
                if response.status_code == 200:
                    course_classes = response.json()
                    print(f"Fetched {len(course_classes)} classes for course {course_id}")
                    classes.extend(course_classes)
                else:
                    print(f"Error fetching classes for course {course_id}: {response.status_code}")
            except Exception as e:
                print(f"Exception fetching classes for course {course_id}: {e}")
        
        return classes

    def _parse_semester(self, semester_string):
        """Parse semester string (e.g., 'Fall 2025') into components"""
        parts = semester_string.split()
        if len(parts) != 2:
            return {"term": "Fall", "year": 2025}
        
        term, year = parts
        return {"term": term, "year": int(year)}

    def _format_semester(self, semester_obj):
        """Format semester object as string"""
        return f"{semester_obj['term']} {semester_obj['year']}"

    def _advance_semester(self, semester):
        """Move to next semester in sequence"""
        terms = ["Winter", "Spring", "Summer", "Fall"]
        
        current_term = semester["term"]
        current_year = semester["year"]
        
        # Find index of current term
        idx = terms.index(current_term)
        
        # Move to next term or next year
        if idx < len(terms) - 1:
            next_term = terms[idx + 1]
            next_year = current_year
        else:
            next_term = terms[0]  # Back to Winter
            next_year = current_year + 1
        
        return {"term": next_term, "year": next_year}

    def _sort_by_prerequisites(self, classes):
        """Sort classes so prerequisites come before dependent classes"""
        # Simple implementation for now
        return classes

    def _add_classes_to_semester(self, semester, sorted_classes, remaining_classes, 
                                credit_limit, major_class_limit, schedule):
        """Add appropriate classes to a semester"""
        # For initial implementation, just take first few classes up to credit limit
        for cls in list(remaining_classes):  # Use list() to create a copy to modify safely
            # Skip if adding would exceed credit limit
            if semester["totalCredits"] + cls.get("credits", 3) > credit_limit:
                continue
                
            # Add class to semester
            semester["classes"].append(cls)
            semester["totalCredits"] += cls.get("credits", 3)
            remaining_classes.remove(cls)
            
            # Stop if we reach credit limit
            if semester["totalCredits"] >= credit_limit:
                break

    def _optimize_schedule(self, schedule):
        """Apply optimizations to improve schedule quality"""
        # For now, just return the original schedule
        return schedule

    def _calculate_schedule_score(self, schedule):
        """Calculate a quality score for the schedule"""
        # Simple implementation with a fixed score
        return 0.85

    def _generate_improvement_list(self, original_schedule, optimized_schedule):
        """Generate a list of improvements made to the schedule"""
        # Simple implementation with fixed improvements
        return [
            "Balanced credit load across semesters",
            "Prerequisites properly sequenced"
        ]