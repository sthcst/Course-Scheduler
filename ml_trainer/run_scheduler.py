import json
import logging
from typing import Dict
from constraint_optimizer import ScheduleOptimizer
from data_processor import ScheduleDataProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_scheduler(input_path: str, output_path: str = None):
    """Run scheduler and optionally save results"""
    
    # Load input payload
    with open(input_path, 'r') as f:
        payload = json.load(f)
    
    # Process and optimize schedule
    processor = ScheduleDataProcessor()
    processed_data = processor.process_payload(payload)
    optimizer = ScheduleOptimizer()
    schedule_result = optimizer.create_schedule(processed_data)
    
    # Format into payload structure
    updated_payload = payload.copy()
    updated_payload["schedule"] = schedule_result["schedule"]
    updated_payload["metadata"] = {
        "approach": "integrated-scheduling",
        "improvements": schedule_result.get("metadata", {}).get("improvements", []),
        "score": schedule_result.get("metadata", {}).get("score", 0),
        "startSemester": processed_data["parameters"]["startSemester"]
    }
    
    # Print simple schedule output
    if "schedule" in schedule_result:
        print("\nSchedule:")
        print("-" * 50)
        
        for sem in schedule_result["schedule"]:
            print(f"\n{sem['type']} {sem['year']}")
            print("-" * 25)
            for course in sem["classes"]:
                print(f"{course['class_number']}: {course['class_name']}")
        
        print(f"\nTotal Semesters: {len(schedule_result['schedule'])}")
    
    # Save to output file if specified
    if output_path:
        with open(output_path, 'w') as f:
            json.dump(updated_payload, f, indent=4)
    
    return updated_payload

if __name__ == "__main__":
    run_scheduler("Payload.json", "Payload.json")