from flask import Flask, request, jsonify
import json
import os
from flask_cors import CORS
# Fix the import path - this was the issue
from schedule_optimizer import ScheduleOptimizer  # Changed from ml_trainer.hf_optimizer
from hf_optimizer import HuggingFaceScheduleOptimizer

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
optimizer = ScheduleOptimizer()
hf_optimizer = HuggingFaceScheduleOptimizer()

# Load the trained model
model_path = os.path.join(os.path.dirname(__file__), 'schedule_model.json')
if os.path.exists(model_path):
    optimizer.load_model(model_path)
else:
    print("Warning: Model not found. Please train the model first.")

@app.route('/ping', methods=['GET'])
def ping():
    """Simple endpoint to test if the API is running"""
    return jsonify({"status": "ok", "message": "API is running"}), 200

@app.route('/evaluate', methods=['POST'])
def evaluate_schedule():
    """Evaluate a schedule using the trained model"""
    if not request.json:
        return jsonify({"error": "No schedule provided"}), 400
    
    try:
        schedule = request.json
        score = optimizer.evaluate_schedule(schedule)
        return jsonify({"score": float(score)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/optimize', methods=['POST'])
def optimize_schedule():
    """Generate optimization suggestions for a schedule"""
    if not request.json:
        return jsonify({"error": "No schedule provided"}), 400
    
    try:
        schedule = request.json
        print(f"Received schedule with {len(schedule) if isinstance(schedule, list) else 'invalid'} semesters")
        
        # Validate schedule format
        if not isinstance(schedule, list):
            return jsonify({"error": "Schedule must be an array"}), 400
            
        if len(schedule) == 0:
            return jsonify({"error": "Schedule cannot be empty"}), 400
            
        for semester in schedule:
            if not isinstance(semester, dict) or 'classes' not in semester:
                return jsonify({"error": "Each semester must have classes array"}), 400
        
        # Generate several variations and pick the best one
        print("Evaluating original schedule...")
        best_score = optimizer.evaluate_schedule(schedule)
        print(f"Original schedule score: {best_score}")
        best_schedule = schedule
        
        # Try various transformations to optimize the schedule
        for i in range(10):
            print(f"Creating variation {i+1}/10")
            variation = optimizer.create_schedule_variation(schedule)
            score = optimizer.evaluate_schedule(variation)
            print(f"Variation {i+1} score: {score}")
            
            if score > best_score:
                best_score = score
                best_schedule = variation
                print(f"Found better schedule: {score}")
        
        # Return the optimized schedule
        return jsonify({
            "original_score": float(optimizer.evaluate_schedule(schedule)),
            "optimized_score": float(best_score),
            "optimized_schedule": best_schedule
        })
    
    except Exception as e:
        import traceback
        print(f"ERROR in /optimize: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/hf_optimize', methods=['POST'])
def huggingface_optimize():
    """Optimize a schedule using HuggingFace-powered intelligence"""
    if not request.json:
        return jsonify({"error": "No schedule provided"}), 400
    
    try:
        schedule = request.json
        print(f"Received schedule for HuggingFace optimization with {len(schedule) if isinstance(schedule, list) else 'invalid'} semesters")
        
        # Validate schedule format
        if not isinstance(schedule, list):
            return jsonify({"error": "Schedule must be an array"}), 400
            
        if len(schedule) == 0:
            return jsonify({"error": "Schedule cannot be empty"}), 400
        
        # Perform HuggingFace-powered optimization
        result = hf_optimizer.optimize_schedule(schedule)
        
        return jsonify(result)
    
    except Exception as e:
        import traceback
        print(f"ERROR in /hf_optimize: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/generate_schedule', methods=['POST'])
def generate_schedule():
    """Generate and optimize a schedule from scratch based on user preferences"""
    if not request.json:
        return jsonify({"error": "No preferences provided"}), 400
    
    try:
        preferences = request.json
        print(f"Received schedule generation request with preferences: {preferences}")
        
        # Extract parameters from the request
        selected_courses = preferences.get('selectedCourses', [])
        start_semester = preferences.get('startSemester', 'Fall 2025')
        major_class_limit = preferences.get('majorClassLimit', 4)
        fall_winter_credits = preferences.get('fallWinterCredits', 15)
        spring_credits = preferences.get('springCredits', 12)
        english_level = preferences.get('englishLevel', None)
        ten_semester_path = preferences.get('tenSemesterPath', False)
        
        # Use the actual implementation from hf_optimizer
        result = hf_optimizer.generate_schedule(
            selected_courses=selected_courses,
            start_semester=start_semester,
            major_class_limit=major_class_limit,
            fall_winter_credits=fall_winter_credits,
            spring_credits=spring_credits,
            english_level=english_level,
            ten_semester_path=ten_semester_path
        )
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        print(f"ERROR in /generate_schedule: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)