#!/usr/bin/env python3
"""
CREATE TEST EMPLOYEE AND PERFORM REAL BIOMETRIC VALIDATION
"""

import psycopg2
from bcrypt import hashpw, gensalt
import hashlib
from datetime import datetime

# Create test employee in database
conn = psycopg2.connect(
    host='localhost', port=5432,
    user='postgres', password='securepassword123',
    database='attendance_system'
)

cur = conn.cursor()

# Create a new test employee for biometric testing
test_employee = {
    "employee_id": f"BIOTEST_{int(datetime.now().timestamp())}",
    "first_name": "Real",
    "last_name": "Test",
    "email": f"real_bio_test_{int(datetime.now().timestamp())}@test.local",
    "department": "Testing",
    "position": "Tester",
    "role": "employee",
    "hire_date": "2026-06-17",
    "password": "RealBioTest@123456"
}

# Hash password
password_hash = hashpw(test_employee["password"].encode(), gensalt(rounds=10)).decode()

# Insert employee
cur.execute("""
    INSERT INTO employees (
        employee_id, first_name, last_name, email, department, position, 
        role, hire_date, password_hash, is_active
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    RETURNING id, employee_id
""", (
    test_employee["employee_id"],
    test_employee["first_name"],
    test_employee["last_name"],
    test_employee["email"],
    test_employee["department"],
    test_employee["position"],
    test_employee["role"],
    test_employee["hire_date"],
    password_hash,
    True
))

result = cur.fetchone()
emp_id, emp_id_str = result

conn.commit()

print("="*80)
print("TEST EMPLOYEE CREATED")
print("="*80)
print(f"Employee ID: {emp_id_str}")
print(f"Password: {test_employee['password']}")
print(f"Email: {test_employee['email']}")
print(f"Role: {test_employee['role']}")

cur.close()
conn.close()

# Write credentials to file for use in biometric test
with open("test_credentials.json", "w") as f:
    import json
    json.dump({
        "employeeId": emp_id_str,
        "password": test_employee["password"],
        "email": test_employee["email"],
        "role": test_employee["role"]
    }, f, indent=2)

print("\nCredentials saved to test_credentials.json")
