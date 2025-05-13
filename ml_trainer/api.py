from flask import Flask, request, jsonify
import json
import os
import sqlite3  # Or use other DB connector like psycopg2 for PostgreSQL
from flask_cors import CORS
from schedule_optimizer import ScheduleOptimizer
from hf_optimizer import HuggingFaceScheduleOptimizer

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
optimizer = ScheduleOptimizer()
hf_optimizer = HuggingFaceScheduleOptimizer()

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
    print("Warning: Model not found. Please train the model first.")

@app.route('/ping', methods=['GET'])
def ping():
    """Simple endpoint to test if the API is running"""
    return jsonify({"status": "ok", "message": "ML service is running"})

@app.route('/evaluate', methods=['POST'])
def evaluate_schedule():
    """Evaluate a schedule using the trained model"""
    if not request.json:
        return jsonify({"error": "No schedule provided"}), 400
    
    try:
        schedule = request.json.get('schedule', [])
        result = optimizer.evaluate_schedule(schedule)
        return jsonify(result)
    except Exception as e:
        print(f"Error in /evaluate: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/optimize', methods=['POST'])
def optimize_schedule():
    """Generate optimization suggestions for a schedule"""
    if not request.json:
        return jsonify({"error": "No schedule provided"}), 400
    
    try:
        schedule = request.json.get('schedule', [])
        result = optimizer.optimize_schedule(schedule)
        return jsonify(result)
    except Exception as e:
        print(f"Error in /optimize: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/hf_optimize', methods=['POST'])
def huggingface_optimize():
    """Optimize a schedule using HuggingFace-powered intelligence"""
    if not request.json:
        return jsonify({"error": "No schedule provided"}), 400
    
    try:
        schedule = request.json.get('schedule', [])
        result = hf_optimizer.optimize_schedule(schedule)
        return jsonify(result)
    except Exception as e:
        print(f"Error in /hf_optimize: {e}")
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
        
        # Fetch classes directly from database
        classes = []
        conn = get_db_connection()
        
        if conn is None:
            return jsonify({"error": "Database connection failed"}), 500
            
        try:
            if selected_courses:
                # Convert to comma-separated string for SQL IN clause
                course_ids_str = ','.join(map(str, selected_courses))
                query = f"SELECT * FROM classes WHERE course_id IN ({course_ids_str})"
                
                cursor = conn.execute(query)
                
                # Convert to list of dictionaries
                for row in cursor:
                    class_data = dict(row)
                    classes.append(class_data)
                
                print(f"Fetched {len(classes)} classes from database")
            else:
                print("No courses selected")
        finally:
            conn.close()
        
        # Use the optimizer with directly fetched classes
        result = hf_optimizer.generate_schedule_with_classes(
            selected_courses=selected_courses,
            classes_data=classes,  # Pass pre-fetched classes
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