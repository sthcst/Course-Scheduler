import numpy as np
import json
import random
import os

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
            self.model = {"weights": np.ones(4), "bias": 0.5}
    
    def evaluate_schedule(self, schedule):
        """Evaluate a schedule using simple heuristics"""
        try:
            features = self.extract_features(schedule)
            
            # Return a default score if no model is loaded
            if not self.model:
                return 0.5
                
            # Use feature array for scoring
            score = float(np.dot(features["feature_array"], self.model["weights"]) + self.model["bias"])
            
            # Clamp score to [0, 1]
            return max(0.0, min(1.0, score))
        except Exception as e:
            print(f"Error in evaluate_schedule: {e}")
            return 0.5
    
    def extract_features(self, schedule):
        """Extract numerical features from a schedule"""
        try:
            # Get semester credits safely
            semester_credits = []
            for sem in schedule:
                # Try to get totalCredits, or calculate it from classes if missing
                try:
                    if 'totalCredits' in sem and sem['totalCredits'] is not None:
                        credits = float(sem['totalCredits'])
                    else:
                        # Calculate from classes
                        credits = sum(cls.get('credits', 3) for cls in sem.get('classes', []))
                    semester_credits.append(credits)
                except Exception as e:
                    print(f"Error processing semester credits: {e}")
                    credits = sum(cls.get('credits', 3) for cls in sem.get('classes', []))
                    semester_credits.append(credits)

            # Calculate basic features
            features = {
                "total_semesters": len(schedule),
                "avg_credits_per_semester": np.mean(semester_credits) if semester_credits else 0,
                "max_credits": max(semester_credits) if semester_credits else 0,
                "first_year_avg_credits": np.mean([credits for i, credits in enumerate(semester_credits) 
                                                if schedule[i].get("isFirstYear", False)]) 
                                        if any(schedule[i].get("isFirstYear", False) for i in range(len(schedule)))
                                        else 0,
            }
            
            # Create feature array for model
            feature_array = np.array([
                features["avg_credits_per_semester"],
                features["total_semesters"],
                features["max_credits"],
                features["first_year_avg_credits"]
            ])
            
            # Add feature array to features
            features["feature_array"] = feature_array
            
            return features
        except Exception as e:
            print(f"Error extracting features: {e}")
            # Return default features
            default_features = {
                "total_semesters": len(schedule) if isinstance(schedule, list) else 0,
                "avg_credits_per_semester": 0,
                "max_credits": 0,
                "first_year_avg_credits": 0,
                "feature_array": np.array([0, 0, 0, 0])
            }
            return default_features
    
    def create_schedule_variation(self, schedule):
        """Create a simple variation of the schedule"""
        try:
            # Make a deep copy of the schedule
            variation = json.loads(json.dumps(schedule))
            
            if len(variation) <= 1:
                return variation
                
            # Pick two random semesters
            sem1_idx = random.randint(0, len(variation) - 1)
            sem2_idx = random.randint(0, len(variation) - 1)
            while sem2_idx == sem1_idx:
                sem2_idx = random.randint(0, len(variation) - 1)
            
            # Can't swap if either semester has no classes
            if not variation[sem1_idx].get("classes") or not variation[sem2_idx].get("classes"):
                return variation
                
            # Swap a random class
            class1_idx = random.randint(0, len(variation[sem1_idx]["classes"]) - 1)
            class2_idx = random.randint(0, len(variation[sem2_idx]["classes"]) - 1)
            
            # Swap classes
            cls1 = variation[sem1_idx]["classes"][class1_idx]
            cls2 = variation[sem2_idx]["classes"][class2_idx]
            
            variation[sem1_idx]["classes"][class1_idx] = cls2
            variation[sem2_idx]["classes"][class2_idx] = cls1
            
            # Update credit counts
            cls1_credits = cls1.get("credits", 3)
            cls2_credits = cls2.get("credits", 3)
            
            variation[sem1_idx]["totalCredits"] = variation[sem1_idx].get("totalCredits", 0) - cls1_credits + cls2_credits
            variation[sem2_idx]["totalCredits"] = variation[sem2_idx].get("totalCredits", 0) - cls2_credits + cls1_credits
            
            return variation
        except Exception as e:
            print(f"Error creating schedule variation: {e}")
            # Return original schedule if there was an error
            return schedule