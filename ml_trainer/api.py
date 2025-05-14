from flask import Flask, request, jsonify
import json
import os
import sqlite3  # Or use other DB connector like psycopg2 for PostgreSQL
from flask_cors import CORS
from schedule_optimizer import ScheduleOptimizer
from hf_optimizer import HuggingFaceScheduleOptimizer
from data_processor import ScheduleDataProcessor

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
optimizer = ScheduleOptimizer()
hf_optimizer = HuggingFaceScheduleOptimizer()
data_processor = ScheduleDataProcessor()

# Improved database connection function with better path handling
def get_db_connection():
    # Try different possible database paths for flexibility
    possible_paths = [
        os.path.join(os.path.dirname(__file__), '..', 'database', 'course_scheduler.db'),
        '/app/database/course_scheduler.db',  # Docker container path
        '../database/course_scheduler.db'     # Relative path
    ]
    
    connection = None
    for path in possible_paths:
        if os.path.exists(path):
            try:
                print(f"Connecting to database at: {path}")
                connection = sqlite3.connect(path)
                connection.row_factory = sqlite3.Row
                return connection
            except Exception as e:
                print(f"Failed to connect to {path}: {e}")
    
    # If we get here, no connection was made
    print("WARNING: Could not connect to any database!")
    return None

# Load the trained model
model_path = os.path.join(os.path.dirname(__file__), 'schedule_model.json')
if os.path.exists(model_path):
    optimizer.load_model(model_path)
else:
    print("Warning: Model not found. Using default optimization parameters.")

@app.route('/ping', methods=['GET'])
def ping():
    """Simple endpoint to test if the API is running"""
    return jsonify({"status": "ok", "message": "Course scheduler API is running"})

@app.route('/evaluate', methods=['POST'])
def evaluate_schedule():
    """Evaluate a schedule using the trained model"""
    if not request.json:
        return jsonify({"error": "No schedule provided"}), 400
    
    try:
        schedule = request.json
        print(f"Received schedule for evaluation with {len(schedule) if isinstance(schedule, list) else 'invalid'} semesters")
        
        # Validate schedule format
        if not isinstance(schedule, list):
            return jsonify({"error": "Schedule must be an array"}), 400
            
        if len(schedule) == 0:
            return jsonify({"error": "Schedule cannot be empty"}), 400
        
        # Evaluate the schedule
        score = optimizer.evaluate_schedule(schedule)
        
        return jsonify({
            "score": score,
            "message": f"Schedule score: {score:.2f}/1.00"
        })
    
    except Exception as e:
        import traceback
        print(f"ERROR in /evaluate: {e}")
        print(traceback.format_exc())
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
        for i in range(10):  # Try 10 variations
            print(f"Generating variation {i+1}...")
            variation = optimizer.create_schedule_variation(schedule)
            variation_score = optimizer.evaluate_schedule(variation)
            
            print(f"Variation {i+1} score: {variation_score}")
            if variation_score > best_score:
                best_score = variation_score
                best_schedule = variation
                print(f"New best score: {best_score}")
        
        return jsonify({
            "original_schedule": schedule,
            "optimized_schedule": best_schedule,
            "original_score": optimizer.evaluate_schedule(schedule),
            "optimized_score": best_score,
            "message": f"Optimized score: {best_score:.2f}/1.00"
        })
    
    except Exception as e:
        import traceback
        print(f"ERROR in /optimize: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/hf_optimize', methods=['POST'])
def huggingface_optimize():
    """Optimize a course schedule using the JSON schedule data format."""
    if not request.json:
        return jsonify({"error": "No schedule data provided"}), 400
    
    try:
        schedule_data = request.json
        print("Received course schedule data for optimization")
        
        # Process the raw JSON payload
        processed_data = data_processor.process_payload(schedule_data)
        
        # Generate optimized schedule
        result = hf_optimizer.optimize_schedule(processed_data)
        
        # Format the response
        formatted_response = {
            "schedule": result["optimized_schedule"],
            "score": result["optimized_score"],
            "improvements": result["improvements"]
        }
        
        return jsonify(formatted_response)
    
    except Exception as e:
        import traceback
        print(f"ERROR in /hf_optimize: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/generate-schedule', methods=['POST'])
def generate_schedule():
    """Generate a course schedule from scratch using the course data."""
    if not request.json:
        return jsonify({"error": "No course data provided"}), 400
    
    try:
        # This endpoint will process the full course selection payload
        course_data = request.json
        preferences = course_data.get("preferences", {})
        
        print(f"Received request to generate schedule with approach: {preferences.get('approach', 'unknown')}")
        
        # Process the raw JSON payload
        processed_data = data_processor.process_payload(course_data)
        
        # Generate optimized schedule
        result = hf_optimizer.optimize_schedule(processed_data)
        
        return jsonify({
            "schedule": result["optimized_schedule"],
            "metadata": {
                "score": result["optimized_score"],
                "improvements": result["improvements"],
                "approach": preferences.get("approach", "unknown"),
                "startSemester": preferences.get("startSemester", "unknown")
            }
        })
    
    except Exception as e:
        import traceback
        print(f"ERROR in /generate-schedule: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)  # Set debug=False for production