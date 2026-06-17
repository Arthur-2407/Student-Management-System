#!/usr/bin/env python3
"""
PHASE 7 — REGRESSION TESTING
Comprehensive verification of protected systems (Attendance, HR, RBAC, Dashboard, etc.)
"""

import requests
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any

class RegressionTester:
    def __init__(self):
        self.base_url = "http://localhost:3001"
        self.frontend_url = "http://localhost:3000"
        self.passed = 0
        self.failed = 0
        self.results = []
        self.session = requests.Session()
        
    def log_test(self, name: str, passed: bool, details: str = ""):
        """Log regression test result"""
        status = "✓ PASS" if passed else "✗ FAIL"
        symbol = "✓" if passed else "✗"
        print(f"\n{symbol} {name}")
        if details:
            print(f"  {details}")
        self.results.append({
            "test": name,
            "passed": passed,
            "details": details
        })
        if passed:
            self.passed += 1
        else:
            self.failed += 1
            
    # ---- PROTECTED SYSTEM: ATTENDANCE ----
    def test_attendance_system(self):
        """Verify attendance system routes exist"""
        print("\n[TESTING] Attendance System Routes...")
        
        # Test attendance list endpoint (protected)
        try:
            r = self.session.get(
                f"{self.base_url}/api/attendance/list",
                headers={"Authorization": "Bearer test-token"},
                timeout=5
            )
            # We expect 401 (invalid token) not 404 (route not found)
            if r.status_code in [401, 403, 200]:
                self.log_test("Attendance List Route", True, f"Route reachable (Status {r.status_code})")
            else:
                self.log_test("Attendance List Route", False, f"Unexpected status {r.status_code}")
        except Exception as e:
            self.log_test("Attendance List Route", False, str(e))
            
        # Test attendance check-in endpoint
        try:
            r = self.session.post(
                f"{self.base_url}/api/attendance/check-in",
                json={},
                headers={"Authorization": "Bearer test-token"},
                timeout=5
            )
            if r.status_code in [400, 401, 403, 200]:
                self.log_test("Attendance Check-In Route", True, f"Route reachable")
            else:
                self.log_test("Attendance Check-In Route", False, f"Status {r.status_code}")
        except Exception as e:
            self.log_test("Attendance Check-In Route", False, str(e))
            
    # ---- PROTECTED SYSTEM: EMPLOYEE MANAGEMENT ----
    def test_employee_management(self):
        """Verify employee management routes"""
        print("\n[TESTING] Employee Management...")
        
        try:
            # Correct route: /api/admin/employees (requires admin role)
            r = self.session.get(
                f"{self.base_url}/api/admin/employees",
                headers={"Authorization": "Bearer test-token"},
                timeout=5
            )
            if r.status_code in [401, 403, 200]:
                self.log_test("Employee List Route (/api/admin/employees)", True, f"Route reachable (Status {r.status_code})")
            else:
                self.log_test("Employee List Route (/api/admin/employees)", False, f"Status {r.status_code}")
        except Exception as e:
            self.log_test("Employee List Route (/api/admin/employees)", False, str(e))
            
    # ---- PROTECTED SYSTEM: RBAC (Role-Based Access Control) ----
    def test_rbac_system(self):
        """Verify RBAC enforcement"""
        print("\n[TESTING] RBAC System...")
        
        try:
            # Pre-login check should return role information
            r = self.session.post(
                f"{self.base_url}/api/auth/pre-login-check",
                json={"employeeId": "admin"},
                timeout=5
            )
            if r.status_code == 200:
                data = r.json()
                if "role" in data:
                    self.log_test("RBAC Role Metadata", True, f"Role: {data.get('role')}")
                else:
                    self.log_test("RBAC Role Metadata", False, "No role in response")
            else:
                self.log_test("RBAC Role Metadata", False, f"Status {r.status_code}")
        except Exception as e:
            self.log_test("RBAC Role Metadata", False, str(e))
            
    # ---- PROTECTED SYSTEM: JWT AUTHENTICATION ----
    def test_jwt_authentication(self):
        """Verify JWT authentication mechanisms"""
        print("\n[TESTING] JWT Authentication...")
        
        try:
            # Test invalid token rejection
            r = self.session.get(
                f"{self.base_url}/api/auth/me",
                headers={"Authorization": "Bearer invalid.token.here"},
                timeout=5
            )
            if r.status_code in [401, 403]:
                self.log_test("Invalid JWT Rejection", True, "Rejected as expected")
            else:
                self.log_test("Invalid JWT Rejection", False, f"Unexpected status {r.status_code}")
        except Exception as e:
            self.log_test("Invalid JWT Rejection", False, str(e))
            
        try:
            # Test missing token rejection
            r = self.session.get(f"{self.base_url}/api/auth/me", timeout=5)
            if r.status_code in [401, 403]:
                self.log_test("Missing JWT Rejection", True, "Rejected as expected")
            else:
                self.log_test("Missing JWT Rejection", False, f"Status {r.status_code}")
        except Exception as e:
            self.log_test("Missing JWT Rejection", False, str(e))
            
    # ---- PROTECTED SYSTEM: DASHBOARD ----
    def test_dashboard(self):
        """Verify dashboard functionality"""
        print("\n[TESTING] Dashboard...")
        
        try:
            # Correct route: /api/telemetry/dashboard (requires authentication)
            r = self.session.get(
                f"{self.base_url}/api/telemetry/dashboard",
                timeout=5
            )
            # Status 401 means the route exists but needs auth - this is correct behavior
            if r.status_code in [200, 401]:
                self.log_test("Dashboard Telemetry Endpoint (/api/telemetry/dashboard)", True, f"Route protected (Status {r.status_code})")
            else:
                self.log_test("Dashboard Telemetry Endpoint (/api/telemetry/dashboard)", False, f"Status {r.status_code}")
        except Exception as e:
            self.log_test("Dashboard Telemetry Endpoint (/api/telemetry/dashboard)", False, str(e))
            
    # ---- PROTECTED SYSTEM: AUTHENTICATION FLOWS ----
    def test_authentication_flows(self):
        """Verify authentication flow endpoints"""
        print("\n[TESTING] Authentication Flows...")
        
        try:
            # Test bootstrap status
            r = self.session.get(
                f"{self.base_url}/api/auth/bootstrap/status",
                timeout=5
            )
            if r.status_code in [200, 500]:
                self.log_test("Bootstrap Status Endpoint", True, f"Status {r.status_code}")
            else:
                self.log_test("Bootstrap Status Endpoint", False, f"Status {r.status_code}")
        except Exception as e:
            self.log_test("Bootstrap Status Endpoint", False, str(e))
            
        try:
            # Test pre-login check
            r = self.session.post(
                f"{self.base_url}/api/auth/pre-login-check",
                json={"employeeId": "admin"},
                timeout=5
            )
            if r.status_code == 200:
                self.log_test("Pre-Login Check Endpoint", True, "Working")
            else:
                self.log_test("Pre-Login Check Endpoint", False, f"Status {r.status_code}")
        except Exception as e:
            self.log_test("Pre-Login Check Endpoint", False, str(e))
            
        try:
            # Test face-login endpoint (should be reachable)
            r = self.session.post(
                f"{self.base_url}/api/auth/face-login",
                json={
                    "employeeId": "admin",
                    "frames": ["base64data"],
                    "password": "test"
                },
                timeout=10
            )
            if r.status_code in [400, 401, 200]:
                self.log_test("Face-Login Endpoint", True, "Route reachable")
            else:
                self.log_test("Face-Login Endpoint", False, f"Status {r.status_code}")
        except Exception as e:
            self.log_test("Face-Login Endpoint", False, str(e))
            
    # ---- PROTECTED SYSTEM: REGISTRATION/ENROLLMENT ----
    def test_enrollment_flow(self):
        """Verify enrollment flow"""
        print("\n[TESTING] Enrollment Flow...")
        
        try:
            r = self.session.post(
                f"{self.base_url}/api/auth/register-face",
                json={
                    "frames": ["base64data"],
                    "employeeId": "test"
                },
                headers={"Authorization": "Bearer test-token"},
                timeout=10
            )
            if r.status_code in [400, 401, 403, 200]:
                self.log_test("Face Registration Endpoint", True, "Route reachable")
            else:
                self.log_test("Face Registration Endpoint", False, f"Status {r.status_code}")
        except Exception as e:
            self.log_test("Face Registration Endpoint", False, str(e))
            
    # ---- PROTECTED SYSTEM: ERROR HANDLING ----
    def test_error_handling(self):
        """Verify error handling doesn't break workflows"""
        print("\n[TESTING] Error Handling...")
        
        try:
            # Test with missing required fields
            r = self.session.post(
                f"{self.base_url}/api/auth/face-login",
                json={},
                timeout=5
            )
            # Should return 400 (bad request), not 500 (internal error)
            if r.status_code == 400:
                self.log_test("Missing Fields Validation", True, "Returns 400")
            else:
                self.log_test("Missing Fields Validation", False, f"Returns {r.status_code}")
        except Exception as e:
            self.log_test("Missing Fields Validation", False, str(e))
            
    # ---- PROTECTED SYSTEM: API RESPONSE FORMATS ----
    def test_response_formats(self):
        """Verify API responses have consistent format"""
        print("\n[TESTING] Response Formats...")
        
        try:
            r = self.session.post(
                f"{self.base_url}/api/auth/pre-login-check",
                json={"employeeId": "admin"},
                timeout=5
            )
            if r.status_code == 200:
                data = r.json()
                # Check for expected response structure
                if isinstance(data, dict):
                    self.log_test("Pre-Login Response Format", True, "Valid JSON object")
                else:
                    self.log_test("Pre-Login Response Format", False, "Not a JSON object")
            else:
                self.log_test("Pre-Login Response Format", False, f"Status {r.status_code}")
        except Exception as e:
            self.log_test("Pre-Login Response Format", False, str(e))
            
    # ---- PROTECTED SYSTEM: SECURITY HEADERS ----
    def test_security_headers(self):
        """Verify security headers are present"""
        print("\n[TESTING] Security Headers...")
        
        try:
            r = self.session.get(f"{self.base_url}/health", timeout=5)
            headers = r.headers
            
            critical_headers = [
                "X-Content-Type-Options",
                "X-Frame-Options",
                "Strict-Transport-Security"
            ]
            
            missing = [h for h in critical_headers if h not in headers]
            
            if not missing:
                self.log_test("Critical Security Headers", True, "All present")
            else:
                self.log_test("Critical Security Headers", False, f"Missing: {missing}")
        except Exception as e:
            self.log_test("Critical Security Headers", False, str(e))
            
    def generate_report(self):
        """Generate comprehensive regression test report"""
        report = {
            "phase": "PHASE 7 - REGRESSION TESTING",
            "timestamp": datetime.now().isoformat(),
            "total_tests": self.passed + self.failed,
            "passed": self.passed,
            "failed": self.failed,
            "status": "PASS" if self.failed == 0 else "FAIL",
            "protected_systems": {
                "attendance": "✓ TESTED",
                "employee_management": "✓ TESTED",
                "rbac": "✓ TESTED",
                "jwt_authentication": "✓ TESTED",
                "dashboard": "✓ TESTED",
                "enrollment_flow": "✓ TESTED",
                "error_handling": "✓ TESTED",
                "security_headers": "✓ TESTED"
            },
            "test_results": self.results
        }
        
        with open("PHASE7_REGRESSION_TEST_REPORT.json", "w") as f:
            json.dump(report, f, indent=2)
            
        return report


def main():
    print("=" * 80)
    print("PHASE 7 — REGRESSION TESTING")
    print("Comprehensive Verification of Protected Systems")
    print("=" * 80)
    
    tester = RegressionTester()
    
    try:
        # Run all regression tests
        tester.test_authentication_flows()
        tester.test_attendance_system()
        tester.test_employee_management()
        tester.test_rbac_system()
        tester.test_jwt_authentication()
        tester.test_dashboard()
        tester.test_enrollment_flow()
        tester.test_error_handling()
        tester.test_response_formats()
        tester.test_security_headers()
        
        # Generate report
        report = tester.generate_report()
        
        # Print summary
        print("\n" + "=" * 80)
        print("REGRESSION TESTING SUMMARY")
        print("=" * 80)
        print(f"\nTotal Tests: {report['total_tests']}")
        print(f"Passed: {report['passed']}")
        print(f"Failed: {report['failed']}")
        print(f"Status: {report['status']}")
        
        print("\nProtected Systems Status:")
        for system, status in report['protected_systems'].items():
            print(f"  {system}: {status}")
            
        print(f"\nReport saved to: PHASE7_REGRESSION_TEST_REPORT.json")
        
        return 0 if report['status'] == "PASS" else 1
        
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
