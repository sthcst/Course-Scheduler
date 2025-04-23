import json
import random

class ScheduleOptimizer:
    def __init__(self):
        self.model = None
    
    def load_model(self, model_path):
        """Load a trained model from a JSON file"""
        try:
            with open(model_path, 'r') as f:
                self.model = json.load(f)
            print(f"Model loaded from {model_path}")
        except Exception as e:
            print(f"Error loading model: {e}")
            self.model = {"weights": [1.0, 1.0, 1.0, 1.0], "bias": 0.5}
    
    def evaluate_schedule(self, schedule):
        """Evaluate a schedule using simple heuristics"""
        try:
            # Simplified evaluation that doesn't use numpy
            if not schedule:
                return 0.5
                
            total_semesters = len(schedule)
            credits_per_semester = []
            
            for sem in schedule:
                if 'totalCredits' in sem and sem['totalCredits'] is not None:
                    credits = float(sem['totalCredits'])
                else:
                    credits = sum(cls.get('credits', 3) for cls in sem.get('classes', []))
                credits_per_semester.append(credits)
            
            avg_credits = sum(credits_per_semester) / len(credits_per_semester) if credits_per_semester else 0
            max_credits = max(credits_per_semester) if credits_per_semester else 0
            
            # Simple scoring
            score = 0.5
            if avg_credits > 12:
                score += 0.1
            if total_semesters <= 8:
                score += 0.2
            if max_credits <= 18:
                score += 0.2
                
            return max(0.0, min(1.0, score))
        except Exception as e:
            print(f"Error in evaluate_schedule: {e}")
            return 0.5
    
    def create_schedule_variation(self, schedule):
        """Create a simple variation of the schedule"""
        try:
            # Make a deep copy of the schedule
            variation = json.loads(json.dumps(schedule))
            
            if len(variation) <= 1:
                return variation
                
            # Swap logic stays the same
            # ...
            
            return variation
        except Exception as e:
            print(f"Error creating schedule variation: {e}")
            return schedule