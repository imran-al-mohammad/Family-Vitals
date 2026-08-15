"""
Family Vitals - Python Validation Script
========================================

Script for validating reading data against sensible numeric ranges and required fields.
"""

import json
import sys
from datetime import datetime


def validate_reading(reading):
    """
    Validate a single reading record.
    
    Args:
        reading (dict): Reading data with fields:
            - type: 'bp', 'pulse', or 'blood-sugar'
            - For BP: systolic, diastolic
            - For Pulse: bpm
            - For Blood Sugar: value, unit, optional context
            - created_at: ISO datetime string
            - notes: optional string
    
    Returns:
        dict: {
            'is_valid': bool,
            'errors': list of error messages,
            'warnings': list of warning messages
        }
    """
    errors = []
    warnings = []
    
    # Check required field: type
    reading_type = reading.get('type')
    if not reading_type:
        errors.append("Reading type is required")
        return {'is_valid': False, 'errors': errors, 'warnings': warnings}
    
    valid_types = ['bp', 'pulse', 'blood-sugar']
    if reading_type not in valid_types:
        errors.append(f"Invalid reading type: {reading_type}. Must be one of {valid_types}")
        return {'is_valid': False, 'errors': errors, 'warnings': warnings}
    
    # Validate based on type
    if reading_type == 'bp':
        systolic = reading.get('systolic')
        diastolic = reading.get('diastolic')
        
        if systolic is None:
            errors.append("Systolic value is required for BP reading")
        if diastolic is None:
            errors.append("Diastolic value is required for BP reading")
        
        # Check numeric ranges if both present
        if systolic is not None and not (60 <= systolic <= 250):
            errors.append(f"Systolic value {systolic} is outside valid range (60-250 mmHg)")
        
        if diastolic is not None and not (40 <= diastolic <= 150):
            errors.append(f"Diastolic value {diastolic} is outside valid range (40-150 mmHg)")
        
        # Relationship check
        if systolic is not None and diastolic is not None and systolic <= diastolic:
            errors.append("Systolic must be greater than diastolic")
    
    elif reading_type == 'pulse':
        bpm = reading.get('bpm')
        
        if bpm is None:
            errors.append("BPM value is required for pulse reading")
        elif not (40 <= bpm <= 200):
            errors.append(f"BPM value {bpm} is outside valid range (40-200 bpm)")
    
    elif reading_type == 'blood-sugar':
        value = reading.get('value')
        unit = reading.get('unit')
        
        if value is None:
            errors.append("Value is required for blood sugar reading")
        elif unit not in ('mg/dL', 'mmol/L'):
            errors.append(f"Invalid unit: {unit}. Must be 'mg/dL' or 'mmol/L'")
        
        # Range check (convert mmol/L to mg/dL)
        value_mg_dl = value
        if unit == 'mmol/L':
            value_mg_dl = value * 18.0
        
        if value is not None and not (50 <= value_mg_dl <= 500):
            warnings.append(
                f"Blood sugar value {value} {unit} ({value_mg_dl:.1f} mg/dL) "
                f"is outside typical range (50-500 mg/dL)"
            )
    
    # Validate datetime format
    created_at = reading.get('created_at')
    if created_at:
        try:
            datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        except (ValueError, TypeError):
            errors.append(f"Invalid datetime format: {created_at}. Expected ISO format")
    
    # Check for reasonable notes length
    notes = reading.get('notes', '')
    if notes and len(notes) > 500:
        warnings.append(f"Notes are quite long ({len(notes)} chars). Consider shortening.")
    
    is_valid = len(errors) == 0
    
    return {
        'is_valid': is_valid,
        'errors': errors,
        'warnings': warnings
    }


def validate_file(input_path):
    """
    Validate readings from a JSON file.
    
    Args:
        input_path (str): Path to JSON file containing array of readings
    """
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File not found: {input_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {input_path}: {e}")
        sys.exit(1)
    
    if not isinstance(data, list):
        print("Error: JSON file must contain an array of readings")
        sys.exit(1)
    
    print(f"Validating {len(data)} readings from {input_path}...\n")
    
    valid_count = 0
    invalid_count = 0
    all_errors = []
    
    for i, reading in enumerate(data):
        result = validate_reading(reading)
        if result['is_valid']:
            valid_count += 1
        else:
            invalid_count += 1
            all_errors.append({
                'index': i,
                'errors': result['errors']
            })
    
    print(f"=== Validation Summary ===")
    print(f"Total readings: {len(data)}")
    print(f"Valid: {valid_count}")
    print(f"Invalid: {invalid_count}")
    print(f"")
    
    if all_errors:
        print("Invalid readings:")
        for error in all_errors:
            print(f"  Reading {error['index']}: {', '.join(error['errors'])}")
    
    # Print warnings
    warning_count = 0
    for i, reading in enumerate(data):
        result = validate_reading(reading)
        if result['warnings']:
            warning_count += 1
    
    if warning_count > 0:
        print(f"Readings with warnings: {warning_count}")
    
    return valid_count, invalid_count


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python validate_readings.py <input_json_file>")
        print("Or: python validate_readings.py '{json_string}'")
        sys.exit(1)
    
    input_arg = sys.argv[1]
    
    # Try to parse as JSON string directly
    try:
        reading = json.loads(input_arg)
        if isinstance(reading, dict):
            result = validate_reading(reading)
            print(f"Reading type: {reading.get('type', 'unknown')}")
            print(f"Valid: {result['is_valid']}")
            if result['errors']:
                print(f"Errors: {', '.join(result['errors'])}")
            if result['warnings']:
                print(f"Warnings: {', '.join(result['warnings'])}")
            sys.exit(0)
        elif isinstance(reading, list):
            print(f"Validating {len(reading)} readings from JSON argument...\n")
            valid_count = 0
            invalid_count = 0
            for i, item in enumerate(reading):
                result = validate_reading(item)
                if result["is_valid"]:
                    valid_count += 1
                else:
                    invalid_count += 1
                    print(f"  Reading {i}: {', '.join(result['errors'])}")
            print(f"Valid: {valid_count}")
            print(f"Invalid: {invalid_count}")
            sys.exit(0 if invalid_count == 0 else 1)
    except json.JSONDecodeError:
        pass
    
    # Treat as file path
    validate_file(input_arg)