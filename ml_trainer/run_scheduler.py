import json
import logging
from typing import Dict
from constraint_optimizer import ScheduleOptimizer
from data_processor import ScheduleDataProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def print_prereq_tree(course: str, chains: Dict, indent: int = 0, prefix: str = "") -> None:
    """Print prerequisite chains in a tree structure with better alignment"""
    if course not in chains:
        return
        
    prereqs = chains[course]["prerequisites"]
    if not prereqs:
        return
        
    # Get unique immediate prerequisites
    immediate_prereqs = sorted(set(
        chain[-2] for chain in prereqs 
        if len(chain) >= 2
    ))
    
    for i, prereq in enumerate(immediate_prereqs):
        # Use different symbols for last item vs others
        is_last = i == len(immediate_prereqs) - 1
        symbol = "└── " if is_last else "├── "
        next_prefix = "    " if is_last else "│   "
        
        print(prefix + symbol + prereq)
        print_prereq_tree(
            prereq, 
            chains, 
            indent + 1, 
            prefix + next_prefix
        )

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
    
    # First display the schedule
    if "schedule" in schedule_result:
        # Print schedule first
        print("\nSchedule:")
        print("-" * 50)
        for sem in schedule_result["schedule"]:
            print(f"\n{sem['type']} {sem['year']}")
            print("-" * 25)
            for course in sem["classes"]:
                print(f"{course['class_number']}: {course['class_name']}")
        
        print(f"\nTotal Semesters: {len(schedule_result['schedule'])}")
        
        # Then display prerequisite trees and corequisite groups
        all_courses = optimizer._convert_to_courses(processed_data["classes"])
        course_chains = optimizer._get_all_chains(all_courses)
        
        print("\nPrerequisite Trees and Corequisite Groups:")
        print("-" * 50)
        
        # First show prerequisite trees
        for course in sorted(course_chains.keys()):
            if course_chains[course]["prerequisites"]:
                print(f"\n{course}")
                print_prereq_tree(course, course_chains)
                
        # Then show corequisite groups
        print("\nCorequisite Groups:")
        print("-" * 25)
        # Use a set to track already shown corequisite groups
        shown_groups = set()
        for course, chains in course_chains.items():
            if chains["corequisites"]:
                # Sort corequisites to create consistent group string
                group = tuple(sorted(chains["corequisites"]))
                if group not in shown_groups:
                    print(f"{', '.join(group)}")
                    shown_groups.add(group)
    
    # Save to output file if specified
    if output_path:
        with open(output_path, 'w') as f:
            json.dump(updated_payload, f, indent=4)
    
    return updated_payload

if __name__ == "__main__":
    run_scheduler("Payload.json", "ScriptResponse.json")