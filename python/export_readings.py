"""
Family Vitals - Python Maintenance Scripts
==========================================

Utility scripts for data validation, backfill, exports, and admin maintenance.
These scripts interact with the Supabase backend via the REST API.
"""

import csv
import json
import sys
from datetime import datetime

import requests

from config import HEADERS, SUPABASE_URL


def get_supabase_client():
    """Create a Supabase REST API client."""
    return requests.Session()


def validate_reading(reading):
    """
    Validate a single reading record.
    
    Args:
        reading (dict): Reading data with fields: type, value/fields, created_at, notes
        
    Returns:
        tuple: (is_valid, error_message)
    """
    reading_type = reading.get('type')
    
    if not reading_type:
        return False, "Reading type is required"
    
    if reading_type == 'bp':
        systolic = reading.get('systolic')
        diastolic = reading.get('diastolic')
        
        if systolic is None or diastolic is None:
            return False, "BP reading requires both systolic and diastolic values"
        
        if not (60 <= systolic <= 250):
            return False, f"Systolic value {systolic} is outside valid range (60-250 mmHg)"
        
        if not (40 <= diastolic <= 150):
            return False, f"Diastolic value {diastolic} is outside valid range (40-150 mmHg)"
        
        if systolic <= diastolic:
            return False, "Systolic must be greater than diastolic"
    
    elif reading_type == 'pulse':
        bpm = reading.get('bpm')
        
        if bpm is None:
            return False, "Pulse reading requires bpm value"
        
        if not (40 <= bpm <= 200):
            return False, f"Pulse value {bpm} is outside valid range (40-200 bpm)"
    
    elif reading_type == 'blood-sugar':
        value = reading.get('value')
        unit = reading.get('unit')
        
        if value is None:
            return False, "Blood sugar reading requires a value"
        
        if unit not in ('mg/dL', 'mmol/L'):
            return False, f"Invalid unit: {unit}. Must be 'mg/dL' or 'mmol/L'"
        
        # Convert mmol/L to mg/dL for range checking
        value_mg_dl = value
        if unit == 'mmol/L':
            value_mg_dl = value * 18.0  # Conversion factor
        
        if not (50 <= value_mg_dl <= 500):
            return False, f"Blood sugar value {value} {unit} is outside valid range " \
                          f"(50-500 mg/dL, equivalent to {value*18:.1f}-{500*18/18:.1f} mg/dL)"
    
    else:
        return False, f"Unknown reading type: {reading_type}"
    
    # Validate datetime
    created_at = reading.get('created_at')
    if created_at:
        try:
            datetime.fromisoformat(created_at)
        except (ValueError, TypeError):
            return False, f"Invalid datetime format: {created_at}"
    
    return True, None


def validate_all_readings(readings):
    """
    Validate multiple readings and return valid/invalid lists.
    
    Args:
        readings (list): List of reading dicts
        
    Returns:
        tuple: (valid_readings, invalid_readings_with_errors)
    """
    valid = []
    invalid = []
    
    for i, reading in enumerate(readings):
        is_valid, error = validate_reading(reading)
        if is_valid:
            valid.append(reading)
        else:
            invalid.append({
                'index': i,
                'reading': reading,
                'error': error
            })
    
    return valid, invalid


def export_readings_to_csv(output_path, user_id=None, family_id=None, 
                          start_date=None, end_date=None, metric_type=None):
    """
    Export readings to CSV file.
    
    Args:
        output_path (str): Path for the output CSV file
        user_id (str, optional): Filter by user ID
        family_id (str, optional): Filter by family ID
        start_date (str, optional): Start date (ISO format)
        end_date (str, optional): End date (ISO format)
        metric_type (str, optional): Filter by type (bp, pulse, blood-sugar)
    """
    supabase = get_supabase_client()
    
    # Build query
    query = f"{SUPABASE_URL}/rest/v1/readings?select=*"
    params = {}
    
    if user_id:
        query += f"&user_id=eq.{user_id}"
    if family_id:
        query += f"&family_id=eq.{family_id}"
    if metric_type:
        query += f"&type=eq.{metric_type}"
    if start_date:
        query += f"&created_at=gte.{start_date}"
    if end_date:
        query += f"&created_at=lte.{end_date}"
    
    response = supabase.get(query, headers=HEADERS)
    
    if response.status_code != 200:
        print(f"Error fetching readings: {response.status_code} - {response.text}")
        return False
    
    readings = response.json()
    
    # Write to CSV
    try:
        with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            
            # Determine headers based on reading types
            writer.writerow(['ID', 'User ID', 'Type', 'Created At', 'Systolic', 'Diastolic', 
                           'BPM', 'Value', 'Unit', 'Context', 'Notes'])
            
            for reading in readings:
                r_id = reading.get('id', '')
                r_user = reading.get('user_id', '')
                r_type = reading.get('type', '')
                r_created = reading.get('created_at', '')
                
                if r_type == 'bp':
                    systolic = reading.get('systolic', '')
                    diastolic = reading.get('diastolic', '')
                    writer.writerow([r_id, r_user, r_type, r_created, systolic, diastolic, '', '', '', '', reading.get('notes', '')])
                
                elif r_type == 'pulse':
                    bpm = reading.get('bpm', '')
                    writer.writerow([r_id, r_user, r_type, r_created, '', '', bpm, '', '', '', reading.get('notes', '')])
                
                elif r_type == 'blood-sugar':
                    value = reading.get('value', '')
                    unit = reading.get('unit', '')
                    context = reading.get('context', '')
                    writer.writerow([r_id, r_user, r_type, r_created, '', '', '', value, unit, context, reading.get('notes', '')])
        
        print(f"Successfully exported {len(readings)} readings to {output_path}")
        return True
        
    except Exception as e:
        print(f"Error writing CSV: {e}")
        return False


def backfill_missing_context(readings_data):
    """
    Backfill missing context fields for blood sugar readings.
    
    Args:
        readings_data (list): List of blood sugar readings
        
    Returns:
        list: Updated readings with context filled in where possible
    """
    updated = []
    
    for reading in readings_data:
        context = reading.get('context', '')
        value = reading.get('value', 0)
        unit = reading.get('unit', 'mg/dL')
        
        # If context is missing, try to infer from value or time
        if not context:
            # Simple heuristic: if value > 180 mg/dL, might be after meal
            # if value < 100 mg/dL, might be fasting
            value_mg_dl = value if unit == 'mg/dL' else value * 18
            
            if value_mg_dl > 180:
                context = 'after meal'
            elif value_mg_dl < 100:
                context = 'fasting'
            else:
                context = 'random'
        
        updated_reading = {**reading, 'context': context}
        updated.append(updated_reading)
    
    return updated


def check_orphaned_readings():
    """
    Check for readings that don't have corresponding user profiles.
    Useful for data cleanup after migrations.
    """
    supabase = get_supabase_client()
    query = f"{SUPABASE_URL}/rest/v1/readings?select=user_id"
    response = supabase.get(query, headers=HEADERS)
    
    if response.status_code != 200:
        print(f"Error: {response.status_code}")
        return
    
    readings = response.json()
    user_ids = set(reading.get('user_id') for reading in readings)
    
    # Check which users don't have profiles
    profile_query = f"{SUPABASE_URL}/rest/v1/profiles?select=id"
    profile_response = supabase.get(profile_query, headers=HEADERS)
    
    if profile_response.status_code != 200:
        print(f"Error fetching profiles: {profile_response.status_code}")
        return
    
    profile_ids = set(p['id'] for p in profile_response.json())
    
    orphaned = user_ids - profile_ids
    
    if orphaned:
        print(f"Found {len(orphaned)} readings with orphaned user IDs (no profile)")
        for uid in sorted(orphaned):
            uid_readings = [r for r in readings if r.get('user_id') == uid]
            print(f"  User {uid}: {len(uid_readings)} readings")
    else:
        print("All readings have corresponding user profiles. ✓")


def generate_admin_report(output_path="admin_report.json"):
    """
    Generate an admin report with system statistics.
    
    Args:
        output_path (str): Path for the JSON report output
    """
    supabase = get_supabase_client()
    
    report = {
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'statistics': {}
    }
    
    count_headers = {**HEADERS, "Prefer": "count=exact"}

    def exact_count(path):
        response = supabase.get(
            f"{SUPABASE_URL}/rest/v1/{path}",
            headers=count_headers,
        )
        if response.status_code not in (200, 206):
            return None
        content_range = response.headers.get("content-range", "")
        if "/" in content_range:
            try:
                return int(content_range.split("/")[-1])
            except ValueError:
                return None
        payload = response.json()
        return payload.get("count") if isinstance(payload, dict) else len(payload)

    report['statistics']['total_users'] = exact_count("profiles?select=id")
    report['statistics']['total_families'] = exact_count("families?select=id")
    report['statistics']['total_family_members'] = exact_count("family_members?select=id")
    report['statistics']['total_readings'] = exact_count("readings?select=id")

    for r_type in ['bp', 'pulse', 'blood-sugar']:
        count = exact_count(f"readings?select=id&type=eq.{r_type}")
        if count:
            report['statistics'][f'readings_{r_type}'] = count
    
    # Write report
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, default=str)
        print(f"Admin report generated: {output_path}")
        return True
    except Exception as e:
        print(f"Error writing report: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python script.py <command> [args]")
        print("\nAvailable commands:")
        print("  validate <reading_json>   - Validate a single reading")
        print("  export <output.csv>       - Export readings to CSV")
        print("  check-orphaned           - Check for orphaned readings")
        print("  admin-report [output.json]- Generate admin report")
        print("  backfill <readings.json> - Backfill missing context")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "validate":
        if len(sys.argv) < 3:
            print("Please provide a reading JSON string")
            sys.exit(1)
        reading = json.loads(sys.argv[2])
        is_valid, error = validate_reading(reading)
        if is_valid:
            print("✓ Reading is valid")
        else:
            print(f"✗ Validation error: {error}")
    
    elif command == "export":
        output = sys.argv[2] if len(sys.argv) > 2 else "readings_export.csv"
        success = export_readings_to_csv(output)
        if success:
            print(f"Exported to {output}")
    
    elif command == "check-orphaned":
        check_orphaned_readings()
    
    elif command == "admin-report":
        output = sys.argv[2] if len(sys.argv) > 2 else "admin_report.json"
        generate_admin_report(output)
    
    elif command == "backfill":
        if len(sys.argv) < 3:
            print("Please provide a readings JSON file")
            sys.exit(1)
        with open(sys.argv[2], 'r') as f:
            readings = json.load(f)
        updated = backfill_missing_context(readings)
        print(f"Backfilled {len(updated)} readings")
        # Output result
        print(json.dumps(updated, indent=2, default=str))
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)