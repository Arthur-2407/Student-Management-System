import psycopg2

conn = psycopg2.connect(
    host='localhost',
    port=5432,
    user='postgres',
    password='securepassword123',  # From docker-compose
    database='attendance_system'
)

cur = conn.cursor()

print("=== AVAILABLE TEST ACCOUNTS ===")
cur.execute("""
SELECT id, employee_id, role, account_locked, password
FROM employees
LIMIT 10
""")

print(f"{'ID':<5} {'Employee ID':<25} {'Role':<15} {'Locked':<10}")
print("-" * 55)
for row in cur.fetchall():
    emp_id, emp_name, role, locked, pwd = row
    print(f"{emp_id:<5} {emp_name:<25} {role:<15} {str(locked):<10}")

# Try to unlock admin account
print("\n=== ATTEMPTING TO UNLOCK ADMIN ===")
cur.execute("UPDATE employees SET account_locked = FALSE WHERE employee_id = 'admin'")
conn.commit()
print("✓ Admin account unlocked")

cur.close()
conn.close()
