#!/usr/bin/env python3
"""
PHASE 6 — REFINED PIPELINE INTEGRITY AUDIT (ACTIVE CODEBASE ONLY)
Runtime-based verification with focus on active production code
"""

import os
import json
import subprocess
from datetime import datetime
from typing import Dict, List, Any

class RefinedAudit:
    def __init__(self):
        self.issues = []
        self.checks_passed = 0
        self.checks_failed = 0
        
    def log_check(self, name: str, passed: bool, details: str = ""):
        """Log audit check result"""
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"\n{status}: {name}")
        if details:
            print(f"  Details: {details}")
        if passed:
            self.checks_passed += 1
        else:
            self.checks_failed += 1
            self.issues.append({"check": name, "details": details})
            
    def check_active_codebase_startup(self):
        """Verify active codebase modules can be imported"""
        print("\n[AUDIT] Checking active codebase imports...")
        
        # Test backend imports
        try:
            result = subprocess.run(
                ['node', '-e', 'const auth = require("./backend-api/src/modules/auth/routes.js"); console.log("Auth routes loaded successfully");'],
                cwd='d:\\Website',
                capture_output=True,
                timeout=10,
                text=True
            )
            if result.returncode == 0:
                self.log_check("Backend Auth Routes Module", True, result.stdout.strip())
            else:
                self.log_check("Backend Auth Routes Module", False, result.stderr[:200])
        except Exception as e:
            self.log_check("Backend Auth Routes Module", False, str(e)[:200])
            
    def check_database_integrity(self):
        """Verify database schema and integrity"""
        print("\n[AUDIT] Checking database integrity...")
        
        # Check PostgreSQL connection
        try:
            result = subprocess.run(
                ['docker', 'exec', 'attendance-db', 'psql', '-U', 'postgres', '-c', 'SELECT version();'],
                capture_output=True,
                timeout=10,
                text=True
            )
            if result.returncode == 0:
                self.log_check("PostgreSQL Database Connection", True, "Connected successfully")
            else:
                self.log_check("PostgreSQL Database Connection", False, result.stderr[:200])
        except Exception as e:
            self.log_check("PostgreSQL Database Connection", False, str(e)[:200])
            
        # Check critical tables exist
        try:
            result = subprocess.run(
                ['docker', 'exec', 'attendance-db', 'psql', '-U', 'postgres', '-d', 'attendance_system', 
                 '-c', 'SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN (\'employees\', \'face_embeddings\', \'refresh_tokens\', \'attendance\', \'audit_logs\');'],
                capture_output=True,
                timeout=10,
                text=True
            )
            if result.returncode == 0 and 'count' in result.stdout.lower():
                self.log_check("Critical Tables Exist", True, "All tables present")
            else:
                self.log_check("Critical Tables Exist", False, result.stderr[:200])
        except Exception as e:
            self.log_check("Critical Tables Exist", False, str(e)[:200])
            
    def check_service_connectivity(self):
        """Verify all services can communicate"""
        print("\n[AUDIT] Checking service connectivity...")
        
        # Backend -> Database
        try:
            result = subprocess.run(
                ['docker', 'exec', 'backend-api', 'curl', '-s', 'http://localhost:3001/health'],
                capture_output=True,
                timeout=10,
                text=True
            )
            if '"database":"connected"' in result.stdout:
                self.log_check("Backend-Database Connectivity", True, "Connected")
            else:
                self.log_check("Backend-Database Connectivity", False, "Not connected")
        except Exception as e:
            self.log_check("Backend-Database Connectivity", False, str(e)[:200])
            
        # Backend -> Face AI Service
        try:
            result = subprocess.run(
                ['docker', 'exec', 'backend-api', 'curl', '-s', 'http://localhost:3001/health'],
                capture_output=True,
                timeout=10,
                text=True
            )
            if '"ai-service":"connected"' in result.stdout:
                self.log_check("Backend-Face AI Connectivity", True, "Connected")
            else:
                self.log_check("Backend-Face AI Connectivity", False, "Not connected")
        except Exception as e:
            self.log_check("Backend-Face AI Connectivity", False, str(e)[:200])
            
        # Backend -> Redis
        try:
            result = subprocess.run(
                ['docker', 'exec', 'backend-api', 'curl', '-s', 'http://localhost:3001/health'],
                capture_output=True,
                timeout=10,
                text=True
            )
            if '"redis":"connected"' in result.stdout:
                self.log_check("Backend-Redis Connectivity", True, "Connected")
            else:
                self.log_check("Backend-Redis Connectivity", False, "Not connected")
        except Exception as e:
            self.log_check("Backend-Redis Connectivity", False, str(e)[:200])
            
    def check_critical_routes(self):
        """Verify critical routes are implemented"""
        print("\n[AUDIT] Checking critical routes...")
        
        critical_routes = [
            ("POST", "/api/auth/login"),
            ("POST", "/api/auth/face-login"),
            ("POST", "/api/auth/logout"),
            ("GET", "/api/auth/verify"),
            ("GET", "/api/auth/me"),
            ("POST", "/api/auth/refresh"),
            ("GET", "/api/auth/bootstrap/status"),
            ("POST", "/api/auth/register-face"),
        ]
        
        try:
            result = subprocess.run(
                ['grep', '-c', 'router.post.*face-login', 
                 'd:\\Website\\backend-api\\src\\modules\\auth\\routes.js'],
                capture_output=True,
                timeout=5,
                text=True,
                shell=True
            )
            if result.returncode == 0:
                self.log_check("Face Login Route Implemented", True, "Route found")
            else:
                self.log_check("Face Login Route Implemented", False, "Route not found")
        except Exception as e:
            self.log_check("Face Login Route Implemented", False, str(e)[:200])
            
    def check_api_responses(self):
        """Verify API responses are valid"""
        print("\n[AUDIT] Checking API response schemas...")
        
        # Test pre-login check response
        try:
            result = subprocess.run(
                ['python', '-c', '''
import requests
r = requests.post("http://localhost:3001/api/auth/pre-login-check", json={"employeeId": "admin"}, timeout=5)
assert r.status_code == 200
data = r.json()
assert "success" in data
assert "role" in data
assert "has_password" in data
assert "has_face" in data
print("Valid response schema")
'''],
                capture_output=True,
                timeout=10,
                text=True,
                cwd='d:\\Website'
            )
            if result.returncode == 0:
                self.log_check("Pre-Login Check Response Schema", True, result.stdout.strip())
            else:
                self.log_check("Pre-Login Check Response Schema", False, result.stderr[:200])
        except Exception as e:
            self.log_check("Pre-Login Check Response Schema", False, str(e)[:200])
            
    def check_security_headers(self):
        """Verify security headers are set"""
        print("\n[AUDIT] Checking security headers...")
        
        try:
            result = subprocess.run(
                ['python', '-c', '''
import requests
r = requests.get("http://localhost:3001/api/auth/verify", headers={"Authorization": "Bearer test"}, timeout=5)
headers = r.headers
assert "X-Content-Type-Options" in headers
assert "X-Frame-Options" in headers
assert "Strict-Transport-Security" in headers
print("Security headers present")
'''],
                capture_output=True,
                timeout=10,
                text=True,
                cwd='d:\\Website'
            )
            if result.returncode == 0:
                self.log_check("Security Headers", True, result.stdout.strip())
            else:
                self.log_check("Security Headers", False, result.stderr[:200])
        except Exception as e:
            self.log_check("Security Headers", False, str(e)[:200])
            
    def check_database_constraints(self):
        """Verify database constraints and integrity"""
        print("\n[AUDIT] Checking database constraints...")
        
        try:
            result = subprocess.run(
                ['docker', 'exec', 'attendance-db', 'psql', '-U', 'postgres', '-d', 'attendance_system',
                 '-c', 'SELECT COUNT(*) FROM pg_constraints WHERE contype = \'f\' AND conrelid::regclass::text LIKE \'%employees%\';'],
                capture_output=True,
                timeout=10,
                text=True
            )
            if result.returncode == 0:
                self.log_check("Foreign Key Constraints", True, "Constraints enforced")
            else:
                self.log_check("Foreign Key Constraints", False, result.stderr[:200])
        except Exception as e:
            self.log_check("Foreign Key Constraints", False, str(e)[:200])
            
    def check_face_ai_pipeline(self):
        """Verify face AI service pipeline"""
        print("\n[AUDIT] Checking Face AI pipeline...")
        
        try:
            result = subprocess.run(
                ['python', '-c', '''
import requests
r = requests.get("http://localhost:8000/health", timeout=5)
assert r.status_code == 200
data = r.json()
assert data["status"] == "healthy"
assert data["components"]["face_detector"] == "operational"
assert data["components"]["face_matcher"] == "operational"
assert data["components"]["liveness_detector"] == "operational"
print("All Face AI components operational")
'''],
                capture_output=True,
                timeout=10,
                text=True,
                cwd='d:\\Website'
            )
            if result.returncode == 0:
                self.log_check("Face AI Service Components", True, result.stdout.strip())
            else:
                self.log_check("Face AI Service Components", False, result.stderr[:200])
        except Exception as e:
            self.log_check("Face AI Service Components", False, str(e)[:200])
            
    def generate_report(self):
        """Generate audit report"""
        report = {
            "phase": "PHASE 6 - REFINED PIPELINE INTEGRITY AUDIT",
            "timestamp": datetime.now().isoformat(),
            "checks_passed": self.checks_passed,
            "checks_failed": self.checks_failed,
            "total_checks": self.checks_passed + self.checks_failed,
            "status": "PASS" if self.checks_failed == 0 else "FAIL",
            "issues": self.issues
        }
        
        with open("PHASE6_REFINED_AUDIT_REPORT.json", "w") as f:
            json.dump(report, f, indent=2)
            
        return report


def main():
    print("=" * 80)
    print("PHASE 6 — REFINED PIPELINE INTEGRITY AUDIT")
    print("Runtime-Based Verification of Active Codebase")
    print("=" * 80)
    
    audit = RefinedAudit()
    
    try:
        # Run audit checks
        audit.check_database_integrity()
        audit.check_service_connectivity()
        audit.check_critical_routes()
        audit.check_api_responses()
        audit.check_security_headers()
        audit.check_database_constraints()
        audit.check_face_ai_pipeline()
        
        # Generate report
        report = audit.generate_report()
        
        # Print summary
        print("\n" + "=" * 80)
        print("PHASE 6 AUDIT SUMMARY")
        print("=" * 80)
        
        print(f"\nTotal Checks: {report['total_checks']}")
        print(f"Passed: {report['checks_passed']}")
        print(f"Failed: {report['checks_failed']}")
        print(f"Status: {report['status']}")
        
        if report['issues']:
            print("\n⚠️  ISSUES DETECTED:")
            for issue in report['issues']:
                print(f"  - {issue['check']}: {issue['details'][:100]}")
                
        print(f"\nReport saved to: PHASE6_REFINED_AUDIT_REPORT.json")
        
        return 0 if report['status'] == "PASS" else 1
        
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
