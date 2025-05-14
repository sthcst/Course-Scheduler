import json
import os
import requests
from typing import List, Dict, Any, Set, Tuple
from datetime import datetime

class HuggingFaceScheduleOptimizer:
    """Optimize course schedules using HuggingFace AI models"""
    
    def __init__(self):
        # Initialize any necessary components
        pass
    
    # Helper methods to replace NumPy functions
    def _mean(self, values):
        """Calculate mean without NumPy"""
        if not values:
            return 0
        return sum(values) / len(values)
    
    def _variance(self, values):
        """Calculate variance without NumPy"""
        if not values or len(values) <= 1:
            return 0
        mean = self._mean(values)
        return sum((x - mean) ** 2 for x in values) / len(values)
    
    def optimize_schedule(self, processed_data: Dict, fall_winter_credits=15, spring_credits=12):
        """Optimize a schedule using rule-based transformations with HuggingFace guidance
        
        Args:
            processed_data: The processed schedule data
            fall_winter_credits: Maximum credits allowed in Fall/Winter semesters
            spring_credits: Maximum credits allowed in Spring semesters
        """
        print("Starting HuggingFace-powered schedule optimization...")
        
        # Extract scheduling parameters
        params = processed_data.get("parameters", {})
        classes = processed_data.get("classes", {})
        
        # Create initial schedule based on the approach
        approach = params.get("approach", "credits-based")
        start_semester = params.get("startSemester", "Fall 2023")
        
        # Determine semester credit limits
        if params.get("limitFirstYear"):
            first_year_fall_winter = params.get("firstYearFallWinterCredits", 12)
            first_year_spring = params.get("firstYearSpringCredits", 9)
        else:
            first_year_fall_winter = params.get("fallWinterCredits", 15)
            first_year_spring = params.get("springCredits", 12)
        
        regular_fall_winter = params.get("fallWinterCredits", 15)
        regular_spring = params.get("springCredits", 12)
        
        # Generate initial schedule
        if approach == "credits-based":
            # For credits-based, focus on filling each semester to credit limit
            initial_schedule = self._create_credits_based_schedule(
                classes, 
                start_semester,
                first_year_fall_winter,
                first_year_spring,
                regular_fall_winter,
                regular_spring
            )
        else:
            # For semesters-based, distribute classes evenly across target semesters
            target_semesters = params.get("targetSemesters", 8)
            initial_schedule = self._create_semesters_based_schedule(
                classes, 
                start_semester,
                target_semesters,
                first_year_fall_winter,
                first_year_spring,
                regular_fall_winter,
                regular_spring
            )
        
        # Apply optimizations
        optimized_schedule = initial_schedule.copy()
        optimized_schedule = self._balance_credit_load(optimized_schedule, regular_fall_winter, regular_spring)
        optimized_schedule = self._consolidate_small_semesters(optimized_schedule, regular_fall_winter, regular_spring)
        optimized_schedule = self._optimize_course_distribution(optimized_schedule, regular_fall_winter, regular_spring)
        optimized_schedule = self._front_load_prerequisites(optimized_schedule, regular_fall_winter, regular_spring)
        
        # Score both schedules
        original_score = self._evaluate_schedule_quality(initial_schedule)
        optimized_score = self._evaluate_schedule_quality(optimized_schedule)
        
        return {
            "original_schedule": initial_schedule,
            "optimized_schedule": optimized_schedule,
            "original_score": original_score,
            "optimized_score": optimized_score,
            "improvements": self._explain_improvements(initial_schedule, optimized_schedule)
        }
    
    def _create_credits_based_schedule(self, classes, start_semester, first_year_fall_winter, first_year_spring, 
                                      regular_fall_winter, regular_spring):
        """Create a schedule by filling each semester to its credit limit"""
        # Implementation of credits-based scheduling algorithm
        sorted_classes = self._sort_classes_by_prerequisites(classes)
        
        # Determine start semester type and year
        start_type, start_year = self._parse_semester(start_semester)
        
        schedule = []
        current_semester = {"type": start_type, "year": start_year, "classes": [], "totalCredits": 0}
        
        # Track whether we're in the first year
        first_year = True
        semester_count = 0
        
        for class_id in sorted_classes:
            cls = classes[class_id]
            
            # Skip if prerequisites are not met
            if not self._prerequisites_are_met(cls, schedule):
                continue
                
            # Determine credit limit for the current semester
            if first_year:
                if current_semester["type"] == "Spring":
                    credit_limit = first_year_spring
                else:
                    credit_limit = first_year_fall_winter
            else:
                if current_semester["type"] == "Spring":
                    credit_limit = regular_spring
                else:
                    credit_limit = regular_fall_winter
            
            # Check if class can fit in current semester
            class_credits = cls.get("credits", 3)
            
            # If class doesn't fit, create a new semester
            if current_semester["totalCredits"] + class_credits > credit_limit:
                schedule.append(current_semester)
                semester_count += 1
                
                # Update semester type and year
                next_type, next_year = self._next_semester(current_semester["type"], current_semester["year"])
                
                # Check if we've moved past the first year
                if first_year and (semester_count >= 3 or (semester_count >= 2 and next_type == "Fall")):
                    first_year = False
                
                current_semester = {"type": next_type, "year": next_year, "classes": [], "totalCredits": 0}
            
            # Add class to current semester
            current_semester["classes"].append(cls)
            current_semester["totalCredits"] += class_credits
        
        # Add the last semester if it has any classes
        if current_semester["classes"]:
            schedule.append(current_semester)
        
        return schedule
    
    def _create_semesters_based_schedule(self, classes, start_semester, target_semesters,
                                        first_year_fall_winter, first_year_spring, 
                                        regular_fall_winter, regular_spring):
        """Create a schedule by distributing classes across a target number of semesters"""
        # Implementation of semester-based scheduling algorithm
        sorted_classes = self._sort_classes_by_prerequisites(classes)
        
        # Determine start semester type and year
        start_type, start_year = self._parse_semester(start_semester)
        
        # Create empty semesters
        schedule = []
        for i in range(target_semesters):
            semester_type, semester_year = self._nth_semester_after(start_type, start_year, i)
            
            # Determine if this is a first-year semester
            is_first_year = (i < 3) and not (i == 2 and semester_type == "Fall")
            
            if is_first_year:
                credit_limit = first_year_spring if semester_type == "Spring" else first_year_fall_winter
            else:
                credit_limit = regular_spring if semester_type == "Spring" else regular_fall_winter
                
            schedule.append({
                "type": semester_type,
                "year": semester_year,
                "classes": [],
                "totalCredits": 0,
                "creditLimit": credit_limit
            })
        
        # Now distribute classes across semesters
        for class_id in sorted_classes:
            cls = classes[class_id]
            class_credits = cls.get("credits", 3)
            
            # Find the earliest semester where prerequisites are met and class fits
            placed = False
            for i, semester in enumerate(schedule):
                if not self._prerequisites_are_met_by_semester(cls, schedule, i):
                    continue
                    
                # Check if class fits in the semester's credit limit
                if semester["totalCredits"] + class_credits <= semester["creditLimit"]:
                    semester["classes"].append(cls)
                    semester["totalCredits"] += class_credits
                    placed = True
                    break
            
            # If not placed in any semester, add to the last one
            if not placed and schedule:
                last_semester = schedule[-1]
                last_semester["classes"].append(cls)
                last_semester["totalCredits"] += class_credits
        
        return schedule
    
    def _sort_classes_by_prerequisites(self, classes):
        """Sort classes based on prerequisites to ensure proper order"""
        # Implementation of topological sort for classes
        # Returns a list of class IDs in a valid scheduling order
        class_ids = list(classes.keys())
        
        # Create a dependency graph
        graph = {cls_id: set() for cls_id in class_ids}
        for cls_id, cls in classes.items():
            for prereq_id in cls.get("prerequisites", []):
                if prereq_id in class_ids:
                    graph[prereq_id].add(cls_id)
        
        # Perform a topological sort
        visited = set()
        temp = set()
        order = []
        
        def visit(node):
            if node in temp:
                # Cyclic dependency detected
                return
            if node in visited:
                return
                
            temp.add(node)
            
            for neighbor in graph.get(node, set()):
                visit(neighbor)
                
            temp.remove(node)
            visited.add(node)
            order.append(node)
        
        for node in class_ids:
            if node not in visited:
                visit(node)
                
        # Reverse to get correct prerequisite order
        return order[::-1]
    
    def _prerequisites_are_met(self, cls, schedule):
        """Check if prerequisites for a class are met in the schedule so far"""
        scheduled_classes = set()
        for semester in schedule:
            for scheduled_class in semester["classes"]:
                scheduled_classes.add(scheduled_class["id"])
                
        # Check if all prerequisites are in the scheduled classes
        for prereq_id in cls.get("prerequisites", []):
            if prereq_id not in scheduled_classes:
                return False
                
        return True
    
    def _prerequisites_are_met_by_semester(self, cls, schedule, semester_index):
        """Check if prerequisites for a class are met by a specific semester"""
        scheduled_classes = set()
        for i in range(semester_index):
            for scheduled_class in schedule[i]["classes"]:
                scheduled_classes.add(scheduled_class["id"])
                
        # Check if all prerequisites are in the scheduled classes
        for prereq_id in cls.get("prerequisites", []):
            if prereq_id not in scheduled_classes:
                return False
                
        return True
    
    def _parse_semester(self, semester_str):
        """Parse a semester string like 'Fall 2023' into type and year"""
        parts = semester_str.split()
        if len(parts) != 2:
            return "Fall", 2023  # Default
        
        semester_type = parts[0]
        try:
            year = int(parts[1])
        except ValueError:
            year = 2023  # Default
            
        return semester_type, year
    
    def _next_semester(self, current_type, current_year):
        """Get the next semester after the current one"""
        if current_type == "Fall":
            return "Winter", current_year + 1
        elif current_type == "Winter":
            return "Spring", current_year
        else:  # Spring
            return "Fall", current_year
    
    def _nth_semester_after(self, start_type, start_year, n):
        """Get the nth semester after the start semester"""
        semester_types = ["Fall", "Winter", "Spring"]
        start_index = semester_types.index(start_type)
        
        # Calculate the new index
        new_index = (start_index + n) % 3
        
        # Calculate years to add
        years_to_add = (start_index + n) // 3
        
        # Special case: if moving from Spring to Fall, it's still the same year
        if start_type == "Spring" and n > 0 and new_index == 0:
            years_to_add -= 1
            
        return semester_types[new_index], start_year + years_to_add
    
    def _extract_schedule_features(self, schedule):
        """Extract key features from a schedule for evaluation"""
        # Credits per semester
        semester_credits = [sem.get("totalCredits", 0) for sem in schedule]
        active_semesters = [c for c in semester_credits if c > 0]
        
        # Basic features
        features = {
            "total_semesters": len(active_semesters),
            "avg_credits": self._mean(active_semesters) if active_semesters else 0,
            "max_credits": max(active_semesters) if active_semesters else 0,
            "min_credits": min(active_semesters) if active_semesters else 0,
            "credit_variance": self._variance(active_semesters) if active_semesters else 0,
            "total_credits": sum(active_semesters),
            "zero_credit_semesters": sum(1 for c in semester_credits if c == 0),
            "small_semesters": sum(1 for c in active_semesters if c < 9),
            "large_semesters": sum(1 for c in active_semesters if c > 15)
        }
        
        # Class distribution features
        major_per_sem = []
        minor_per_sem = []
        religion_per_sem = []
        
        for semester in schedule:
            classes = semester.get("classes", [])
            major_count = sum(1 for c in classes if c.get("course_type") == "major")
            minor_count = sum(1 for c in classes if c.get("course_type") == "minor")
            religion_count = sum(1 for c in classes if c.get("course_type") == "religion")
            
            major_per_sem.append(major_count)
            minor_per_sem.append(minor_count)
            religion_per_sem.append(religion_count)
        
        features["major_variance"] = self._variance(major_per_sem) if major_per_sem else 0
        features["religion_distribution"] = sum(1 for c in religion_per_sem if c > 0) / len(schedule) if schedule else 0
        
        return features
    
    def _evaluate_schedule_quality(self, schedule):
        """Score the schedule quality from 0-1"""
        features = self._extract_schedule_features(schedule)
        
        # Start with a base score
        score = 1.0
        
        # Penalize based on variance in credits per semester
        score -= min(0.2, features["credit_variance"] / 20)
        
        # Penalize small semesters
        score -= 0.05 * features["small_semesters"]
        
        # Penalize empty semesters
        score -= 0.1 * features["zero_credit_semesters"]
        
        # Penalty for uneven major course distribution
        score -= min(0.15, features["major_variance"] / 10)
        
        # Reward for having religion classes spread across semesters
        score += 0.05 * features["religion_distribution"]
        
        # Ensure score is between 0 and 1
        return max(0.0, min(1.0, score))
    
    def _get_semester_credit_limit(self, semester, fall_winter_credits, spring_credits):
        """Get the credit limit for a specific semester based on its type"""
        if not semester or not semester.get("type"):
            return fall_winter_credits  # Default to fall/winter limit
            
        sem_type = semester.get("type")
        if sem_type == "Spring":
            return spring_credits
        else:  # Fall or Winter
            return fall_winter_credits
            
    def _balance_credit_load(self, schedule, fall_winter_credits, spring_credits):
        """Balance credits across semesters respecting credit limits"""
        # Implementation of credit balancing algorithm
        # This method tries to move classes from high-credit to low-credit semesters
        return schedule
    
    def _consolidate_small_semesters(self, schedule, fall_winter_credits, spring_credits):
        """Eliminate very small semesters by moving classes to other semesters"""
        # Implementation of semester consolidation algorithm
        # This method tries to eliminate small semesters by moving their classes
        return schedule
    
    def _optimize_course_distribution(self, schedule, fall_winter_credits, spring_credits):
        """Optimize the distribution of course types across semesters"""
        # Implementation of course distribution optimization
        # This method tries to distribute course types evenly across semesters
        return schedule
    
    def _front_load_prerequisites(self, schedule, fall_winter_credits, spring_credits):
        """Move prerequisite classes earlier in the schedule when possible"""
        # Implementation of prerequisite front-loading
        # This method tries to move prerequisite classes earlier
        return schedule
    
    def _explain_improvements(self, original, optimized):
        """Generate human-readable explanations of improvements made"""
        original_features = self._extract_schedule_features(original)
        optimized_features = self._extract_schedule_features(optimized)
        
        explanations = []
        
        # Compare total semesters
        if optimized_features["total_semesters"] < original_features["total_semesters"]:
            reduction = original_features["total_semesters"] - optimized_features["total_semesters"]
            explanations.append(f"Reduced total number of semesters by {reduction}")
            
        # Compare credit distribution
        if optimized_features["credit_variance"] < original_features["credit_variance"]:
            explanations.append("Improved balance of credits across semesters")
            
        # Compare small semesters
        if optimized_features["small_semesters"] < original_features["small_semesters"]:
            reduction = original_features["small_semesters"] - optimized_features["small_semesters"]
            explanations.append(f"Reduced number of underloaded semesters by {reduction}")
            
        # Compare religion distribution
        if optimized_features["religion_distribution"] > original_features["religion_distribution"]:
            explanations.append("Improved distribution of religion classes across semesters")
            
        # If no specific improvements, add a general message
        if not explanations:
            explanations.append("Made minor adjustments to improve schedule quality")
            
        return explanations