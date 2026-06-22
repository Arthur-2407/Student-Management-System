#!/usr/bin/env python3
"""
CREATE TEST STUDENT AND PERFORM REAL BIOMETRIC VALIDATION
"""

import psycopg2
from bcrypt import hashpw, gensalt
import hashlib
from datetime import datetime

# Create test student in database
conn = psycopg2.connect(
    host='localhost', port=5432,
    user='postgres', password='securepassword123',
    database='attendance_system'
)

cur = conn.cursor()

# Create a new test student for biometric testing
test_student = {
    "student_id": f"BIOTEST_{int(datetime.now().timestamp())}",
    "first_name": "Real",
    "last_name": "Test",
    "email": f"real_bio_test_{int(datetime.now().timestamp())}@test.local",
    "department": "Testing",
    "position": "Tester",
    "role": "student",
    "hire_date": "2026-06-17",
    "password": "RealBioTest@123456"
}

# Hash password
password_hash = hashpw(test_student["password"].encode(), gensalt(rounds=10)).decode()

# Insert student
cur.execute("""
    INSERT INTO students (
        student_id, first_name, last_name, email, department, position, 
        role, hire_date, password_hash, is_active
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    RETURNING id, student_id
""", (
    test_student["student_id"],
    test_student["first_name"],
    test_student["last_name"],
    test_student["email"],
    test_student["department"],
    test_student["position"],
    test_student["role"],
    test_student["hire_date"],
    password_hash,
    True
))

result = cur.fetchone()
emp_id, emp_id_str = result

conn.commit()

print("="*80)
print("TEST STUDENT CREATED")
print("="*80)
print(f"Student ID: {emp_id_str}")
print(f"Password: {test_student['password']}")
print(f"Email: {test_student['email']}")
print(f"Role: {test_student['role']}")

cur.close()
conn.close()

# Write credentials to file for use in biometric test
with open("test_credentials.json", "w") as f:
    import json
    json.dump({
        "studentId": emp_id_str,
        "password": test_student["password"],
        "email": test_student["email"],
        "role": test_student["role"]
    }, f, indent=2)

print("\nCredentials saved to test_credentials.json")
