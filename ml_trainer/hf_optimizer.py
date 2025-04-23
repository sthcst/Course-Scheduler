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
        
    def optimize_schedule(self, original_schedule, fall_winter_credits=15, spring_credits=12):
        """Optimize a schedule using rule-based transformations
        
        Args:
            original_schedule: The schedule to optimize
            fall_winter_credits: Maximum credits allowed in Fall/Winter semesters
            spring_credits: Maximum credits allowed in Spring semesters
        """
        print("Starting HuggingFace-powered schedule optimization...")
        
        # Extract credit limit settings from the first semester if available
        if len(original_schedule) > 0 and 'creditLimits' in original_schedule[0]:
            limits = original_schedule[0]['creditLimits']
            fall_winter_credits = limits.get('fallWinter', fall_winter_credits)
            spring_credits = limits.get('spring', spring_credits)
        
        # Create a deep copy of the schedule to avoid modifying the original
        optimized_schedule = json.loads(json.dumps(original_schedule))
        
        # Apply a series of intelligent transformations with credit limits
        optimized_schedule = self._balance_credit_load(optimized_schedule, fall_winter_credits, spring_credits)
        optimized_schedule = self._consolidate_small_semesters(optimized_schedule, fall_winter_credits, spring_credits)
        optimized_schedule = self._optimize_course_distribution(optimized_schedule, fall_winter_credits, spring_credits)
        optimized_schedule = self._front_load_prerequisites(optimized_schedule, fall_winter_credits, spring_credits)
        
        # Score both schedules
        original_score = self._evaluate_schedule_quality(original_schedule)
        optimized_score = self._evaluate_schedule_quality(optimized_schedule)
        
        return {
            "original_schedule": original_schedule,
            "optimized_schedule": optimized_schedule,
            "original_score": original_score,
            "optimized_score": optimized_score,
            "improvements": self._explain_improvements(original_schedule, optimized_schedule)
        }
        
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
            major_count = sum(1 for c in classes if c.get("isMajor") or c.get("category") == "major")
            minor_count = sum(1 for c in classes if c.get("category") == "minor")
            religion_count = sum(1 for c in classes if c.get("category") == "religion")
            
            major_per_sem.append(major_count)
            minor_per_sem.append(minor_count)
            religion_per_sem.append(religion_count)
        
        features["major_variance"] = self._variance(major_per_sem) if major_per_sem else 0
        features["religion_distribution"] = sum(1 for c in religion_per_sem if c > 0) / len(schedule) if schedule else 0
        
        return features
    
    def _evaluate_schedule_quality(self, schedule):
        """Score the schedule quality from 0-1"""
        if not schedule:
            return 0.0
            
        features = self._extract_schedule_features(schedule)
        
        # Base score starts at 1.0
        score = 1.0
        
        # Penalties for undesirable characteristics
        # Penalty for too many semesters
        if features["total_semesters"] > 10:
            score -= 0.05 * (features["total_semesters"] - 10)
            
        # Penalty for credit variance (unbalanced semesters)
        score -= min(0.2, features["credit_variance"] / 50)
        
        # Penalty for semesters with too few credits
        score -= 0.05 * features["small_semesters"]
        
        # Penalty for semesters with too many credits
        score -= 0.03 * features["large_semesters"]
        
        # Penalty for zero-credit semesters in the middle of the schedule
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
        # Find high-credit and low-credit semesters
        high_credit_sems = []
        low_credit_sems = []
        
        for i, sem in enumerate(schedule):
            sem_type = sem.get("type", "")
            credit_limit = self._get_semester_credit_limit(sem, fall_winter_credits, spring_credits)
            credits = sem.get("totalCredits", 0)
            
            # Consider high-credit if exceeds the semester-specific limit
            if credits > credit_limit:
                high_credit_sems.append(i)
            # Consider low-credit if below 75% of the limit but at least 9 credits
            elif 9 <= credits < (credit_limit * 0.75):
                low_credit_sems.append(i)
        
        # For each high-credit semester, try to move a class to a low-credit semester
        for high_idx in high_credit_sems:
            if not low_credit_sems:
                break
                
            high_sem = schedule[high_idx]
            
            # Find a class that can be moved (not a corequisite)
            movable_classes = [cls for cls in high_sem["classes"] 
                              if not cls.get("is_corequisite") 
                              and cls.get("credits", 3) <= 3]
            
            if not movable_classes:
                continue
                
            # Prioritize classes by type - prefer keeping prerequisite classes,
            # willing to move religion classes to later semesters
            prerequisite_classes = []
            religion_classes = []
            other_classes = []
            
            all_classes = [cls for sem in schedule for cls in sem.get("classes", [])]
            
            for cls in movable_classes:
                if cls.get("category") == "religion":
                    religion_classes.append(cls)
                elif any(cls.get("id") in (c.get("prerequisites", []) or []) for c in all_classes):
                    prerequisite_classes.append(cls)
                else:
                    other_classes.append(cls)
            
            # Choose which class to move - prefer religion over others
            if religion_classes:
                class_to_move = religion_classes[0]
            elif other_classes:
                class_to_move = other_classes[0]
            else:
                class_to_move = movable_classes[0]
            
            # Find the best low-credit semester to move to
            for low_idx in low_credit_sems[:]:
                low_sem = schedule[low_idx]
                low_sem_credit_limit = self._get_semester_credit_limit(low_sem, fall_winter_credits, spring_credits)
                
                # Check if this creates a prerequisite conflict
                # A class can only be moved to a later semester
                if low_idx < high_idx:
                    # Can't move a class backward in time
                    continue
                    
                # Check if this would exceed the target semester's credit limit
                if low_sem.get("totalCredits", 0) + class_to_move.get("credits", 3) > low_sem_credit_limit:
                    continue
                
                # Move the class
                high_sem["classes"].remove(class_to_move)
                low_sem["classes"].append(class_to_move)
                
                # Update credit counts
                high_sem["totalCredits"] -= class_to_move.get("credits", 3)
                low_sem["totalCredits"] += class_to_move.get("credits", 3)
                
                # If the low semester is now well-balanced, remove it from the list
                if low_sem["totalCredits"] >= low_sem_credit_limit * 0.75:
                    low_credit_sems.remove(low_idx)
                    
                # If the high semester is now at or below its limit, break the inner loop
                high_sem_credit_limit = self._get_semester_credit_limit(high_sem, fall_winter_credits, spring_credits)
                if high_sem["totalCredits"] <= high_sem_credit_limit:
                    break
        
        return schedule
    
    def _consolidate_small_semesters(self, schedule, fall_winter_credits, spring_credits):
        """Eliminate very small semesters by moving classes to other semesters"""
        # Find semesters with very few credits (3-6 credits)
        very_small_sems = []
        for i, sem in enumerate(schedule):
            if 0 < sem.get("totalCredits", 0) <= 6:
                very_small_sems.append(i)
        
        # For each small semester, try to move all classes to other semesters
        for small_idx in very_small_sems:
            small_sem = schedule[small_idx]
            
            # Look for target semesters before and after this one
            possible_targets = []
            for i, sem in enumerate(schedule):
                # Don't consider other small semesters as targets
                if i in very_small_sems:
                    continue
                
                # Check if adding these classes would respect the target semester's credit limit
                target_credit_limit = self._get_semester_credit_limit(sem, fall_winter_credits, spring_credits)
                if sem.get("totalCredits", 0) + small_sem.get("totalCredits", 0) <= target_credit_limit:
                    # Calculate the distance (prefer adjacent semesters)
                    distance = abs(i - small_idx)
                    possible_targets.append((i, distance))
            
            # Sort targets by distance (closest first)
            possible_targets.sort(key=lambda x: x[1])
            
            # If we found a target, move all classes
            if possible_targets:
                target_idx = possible_targets[0][0]
                target_sem = schedule[target_idx]
                
                # Move all classes
                for cls in small_sem["classes"][:]:  # Use a copy of the list since we're modifying it
                    small_sem["classes"].remove(cls)
                    target_sem["classes"].append(cls)
                
                # Update credit counts
                target_sem["totalCredits"] += small_sem.get("totalCredits", 0)
                small_sem["totalCredits"] = 0
                
        # Remove any empty semesters
        schedule = [sem for sem in schedule if sem.get("totalCredits", 0) > 0]
        
        return schedule
    
    def _optimize_course_distribution(self, schedule, fall_winter_credits, spring_credits):
        """Optimize the distribution of course types across semesters"""
        # Ensure every semester has at most 1 religion class
        for i, sem in enumerate(schedule):
            religion_classes = [cls for cls in sem.get("classes", []) if cls.get("category") == "religion"]
            
            if len(religion_classes) > 1:
                # Keep one religion class, move the rest
                keep = religion_classes[0]
                to_move = religion_classes[1:]
                
                # Find semesters with no religion classes
                target_semesters = []
                for j, target_sem in enumerate(schedule):
                    target_credit_limit = self._get_semester_credit_limit(target_sem, fall_winter_credits, spring_credits)
                    
                    if (j != i and 
                        not any(cls.get("category") == "religion" for cls in target_sem.get("classes", [])) and
                        target_sem.get("totalCredits", 0) + 2 <= target_credit_limit):  # Assuming 2 credits for religion
                        target_semesters.append(j)
                
                # Move religion classes to semesters without them
                for cls in to_move:
                    if target_semesters:
                        target_idx = target_semesters.pop(0)
                        target_sem = schedule[target_idx]
                        
                        sem["classes"].remove(cls)
                        target_sem["classes"].append(cls)
                        
                        # Update credit counts
                        sem["totalCredits"] -= cls.get("credits", 3)
                        target_sem["totalCredits"] += cls.get("credits", 3)
        
        return schedule
    
    def _front_load_prerequisites(self, schedule, fall_winter_credits, spring_credits):
        """Move prerequisite classes earlier in the schedule when possible"""
        # Build a mapping of class IDs to their semesters
        class_to_semester = {}
        for i, sem in enumerate(schedule):
            for cls in sem.get("classes", []):
                if cls.get("id"):
                    class_to_semester[cls["id"]] = i
        
        # Identify prerequisite chains
        prereq_chains = {}
        for i, sem in enumerate(schedule):
            for cls in sem.get("classes", []):
                if cls.get("prerequisites") and cls.get("id"):
                    for prereq in cls["prerequisites"]:
                        prereq_id = prereq if isinstance(prereq, int) else prereq.get("id")
                        if prereq_id and prereq_id in class_to_semester:
                            if prereq_id not in prereq_chains:
                                prereq_chains[prereq_id] = []
                            prereq_chains[prereq_id].append(cls["id"])
        
        # Front-load prerequisites when there's a long chain
        moved = True
        while moved:
            moved = False
            for i in range(1, len(schedule)):
                sem = schedule[i]
                prev_sem = schedule[i-1]
                prev_sem_credit_limit = self._get_semester_credit_limit(prev_sem, fall_winter_credits, spring_credits)
                
                # Check if we can move any class to an earlier semester
                for cls in sem.get("classes", [])[:]:  # Make a copy to safely modify during iteration
                    cls_id = cls.get("id")
                    cls_credits = cls.get("credits", 3)
                    
                    # If this class is a prerequisite for another class in the same semester,
                    # try to move it to the previous semester if within credit limit
                    if cls_id and cls_id in prereq_chains and prev_sem.get("totalCredits", 0) + cls_credits <= prev_sem_credit_limit:
                        # Check if any of its dependents are in the same semester
                        dependents = prereq_chains[cls_id]
                        same_semester_dependents = [dep for dep in dependents if dep in [c.get("id") for c in sem.get("classes", [])]]
                        
                        if same_semester_dependents:
                            # Move this prerequisite to the earlier semester
                            sem["classes"].remove(cls)
                            prev_sem["classes"].append(cls)
                            
                            # Update credit counts
                            sem["totalCredits"] -= cls_credits
                            prev_sem["totalCredits"] += cls_credits
                            
                            # Update the class_to_semester map
                            class_to_semester[cls_id] = i-1
                            
                            moved = True
                            break
                
                if moved:
                    break
        
        return schedule
    
    def _explain_improvements(self, original, optimized):
        """Generate human-readable explanations of improvements made"""
        orig_features = self._extract_schedule_features(original)
        opt_features = self._extract_schedule_features(optimized)
        
        explanations = []
        
        # Check for fewer semesters
        if opt_features["total_semesters"] < orig_features["total_semesters"]:
            explanations.append(f"Reduced the number of semesters from {orig_features['total_semesters']} to {opt_features['total_semesters']}")
        
        # Check for more balanced credit loads
        if opt_features["credit_variance"] < orig_features["credit_variance"]:
            explanations.append("Balanced the credit load across semesters")
            
        # Check for elimination of very small semesters
        if opt_features["small_semesters"] < orig_features["small_semesters"]:
            explanations.append(f"Eliminated {orig_features['small_semesters'] - opt_features['small_semesters']} small-credit semesters")
            
        # Check for better distribution of religion classes
        if opt_features["religion_distribution"] > orig_features["religion_distribution"]:
            explanations.append("Improved the distribution of religion classes across semesters")
            
        # Add a generic message if we couldn't identify specific improvements
        if not explanations:
            explanations.append("Made minor adjustments to optimize the schedule")
            
        return explanations