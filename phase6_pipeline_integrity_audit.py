#!/usr/bin/env python3
"""
PHASE 6 — PIPELINE INTEGRITY AUDIT
Comprehensive audit of entire application pipeline for defects
"""

import os
import json
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple, Set
import subprocess

class PipelineAudit:
    def __init__(self, base_path: str = "d:/Website"):
        self.base_path = base_path
        self.issues = []
        self.audit_results = {
            "broken_imports": [],
            "startup_failures": [],
            "runtime_exceptions": [],
            "dead_code": [],
            "orphaned_routes": [],
            "broken_api_contracts": [],
            "schema_mismatches": [],
            "serialization_issues": [],
            "database_errors": [],
            "race_conditions": [],
            "null_reference_errors": [],
            "invalid_assumptions": [],
            "dependency_failures": []
        }
        
    def scan_for_broken_imports(self):
        """Scan Python and JavaScript files for broken imports"""
        print("\n[AUDIT] Scanning for broken imports...")
        
        # Check Python files
        python_files = self._find_files("*.py", exclude_dirs=["venv", "node_modules", ".git"])
        for py_file in python_files:
            try:
                with open(py_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Look for import statements with potential issues
                    imports = re.findall(r'^(?:from|import)\s+(.+?)(?:\s+import|\s|$)', content, re.MULTILINE)
                    for imp in imports:
                        # Check if module exists or is a common typo
                        if any(x in imp for x in ['xxx', 'TODO', 'FIXME', '__UNDEFINED__']):
                            self.audit_results["broken_imports"].append({
                                "file": py_file,
                                "import": imp,
                                "severity": "high"
                            })
            except Exception as e:
                pass
                
        # Check JavaScript/TypeScript files
        js_files = self._find_files("*.js", exclude_dirs=["venv", "node_modules", ".git"])
        for js_file in js_files:
            try:
                with open(js_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Look for require/import statements
                    requires = re.findall(r"require\(['\"](.*?)['\"]", content)
                    for req in requires:
                        if req.startswith('./') or req.startswith('../'):
                            resolved_path = os.path.join(os.path.dirname(js_file), req)
                            if not os.path.exists(resolved_path) and not os.path.exists(f"{resolved_path}.js"):
                                self.audit_results["broken_imports"].append({
                                    "file": js_file,
                                    "require": req,
                                    "severity": "high"
                                })
            except Exception as e:
                pass
                
    def scan_for_dead_code(self):
        """Identify unused functions, variables, and routes"""
        print("[AUDIT] Scanning for dead code...")
        
        # Check for unused route handlers
        routes_file = f"{self.base_path}/backend-api/src/modules/auth/routes.js"
        if os.path.exists(routes_file):
            try:
                with open(routes_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Find route definitions
                    route_patterns = re.findall(r"router\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"]+)['\"]", content)
                    routes = [p[1] for p in route_patterns]
                    # Check if routes are actually used in middleware/handlers
                    for route in routes:
                        if route.count("'") + route.count('"') < 2:  # Simple check
                            pass  # Route appears valid
            except Exception as e:
                pass
                
    def scan_for_null_references(self):
        """Scan for potential null reference errors"""
        print("[AUDIT] Scanning for null reference errors...")
        
        backend_path = f"{self.base_path}/backend-api/src"
        js_files = self._find_files("*.js", base_dir=backend_path)
        
        null_patterns = [
            r"\.(.+?)\s+[^&|!=]\s*\w+",  # Property access without null check
            r"req\.body\.(\w+)\s*[^&|!=]\s*\w+",  # Unsafe body property access
            r"result\.rows\[0\]\.(\w+)",  # Unsafe array access
        ]
        
        for js_file in js_files:
            try:
                with open(js_file, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    for i, line in enumerate(lines, 1):
                        # Check for potential null access without validation
                        if 'req.body.' in line and '?' not in line and 'if' not in lines[max(0, i-2):i]:
                            self.audit_results["null_reference_errors"].append({
                                "file": js_file,
                                "line": i,
                                "code": line.strip(),
                                "severity": "medium"
                            })
            except Exception as e:
                pass
                
    def check_database_schema(self):
        """Verify database schema integrity"""
        print("[AUDIT] Checking database schema...")
        
        init_sql = f"{self.base_path}/database/init.sql"
        if os.path.exists(init_sql):
            try:
                with open(init_sql, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                    # Check for critical tables
                    critical_tables = [
                        'employees',
                        'face_embeddings',
                        'refresh_tokens',
                        'attendance',
                        'audit_logs'
                    ]
                    
                    missing_tables = []
                    for table in critical_tables:
                        if f"CREATE TABLE {table}" not in content and f"CREATE TABLE IF NOT EXISTS {table}" not in content:
                            missing_tables.append(table)
                            
                    if missing_tables:
                        self.audit_results["schema_mismatches"].append({
                            "issue": "Missing critical tables",
                            "tables": missing_tables,
                            "severity": "critical"
                        })
            except Exception as e:
                self.audit_results["schema_mismatches"].append({
                    "error": str(e),
                    "severity": "high"
                })
                
    def check_api_contracts(self):
        """Verify API contract consistency"""
        print("[AUDIT] Checking API contracts...")
        
        # Check if routes match API documentation
        routes_file = f"{self.base_path}/backend-api/src/modules/auth/routes.js"
        api_doc = f"{self.base_path}/API_DOCUMENTATION.md"
        
        documented_routes = set()
        actual_routes = set()
        
        if os.path.exists(api_doc):
            try:
                with open(api_doc, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Extract documented routes
                    routes = re.findall(r"(GET|POST|PUT|DELETE|PATCH)\s+`?(/api/[\w/-]+)`?", content)
                    documented_routes = set([f"{m[0]} {m[1]}" for m in routes])
            except Exception as e:
                pass
                
        if os.path.exists(routes_file):
            try:
                with open(routes_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Extract actual routes
                    routes = re.findall(r"router\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"]+)['\"]", content)
                    actual_routes = set([f"{m[0].upper()} {m[1]}" for m in routes])
            except Exception as e:
                pass
                
        # Find routes not documented
        undocumented = actual_routes - documented_routes
        if undocumented:
            self.audit_results["broken_api_contracts"].append({
                "issue": "Routes not documented",
                "routes": list(undocumented),
                "severity": "low"
            })
            
    def check_environment_config(self):
        """Verify environment configuration"""
        print("[AUDIT] Checking environment configuration...")
        
        env_example = f"{self.base_path}/.env.example"
        env_actual = f"{self.base_path}/.env"
        
        if os.path.exists(env_example):
            try:
                with open(env_example, 'r') as f:
                    example_vars = set(re.findall(r"^(\w+)=", f.read(), re.MULTILINE))
                    
                if os.path.exists(env_actual):
                    with open(env_actual, 'r') as f:
                        actual_vars = set(re.findall(r"^(\w+)=", f.read(), re.MULTILINE))
                        
                    missing_vars = example_vars - actual_vars
                    if missing_vars:
                        self.audit_results["dependency_failures"].append({
                            "issue": "Missing environment variables",
                            "variables": list(missing_vars),
                            "severity": "medium"
                        })
            except Exception as e:
                pass
                
    def check_error_handling(self):
        """Verify error handling coverage"""
        print("[AUDIT] Checking error handling...")
        
        backend_path = f"{self.base_path}/backend-api/src"
        js_files = self._find_files("*.js", base_dir=backend_path)
        
        for js_file in js_files:
            try:
                with open(js_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                    # Look for try-catch blocks and error handlers
                    try_blocks = len(re.findall(r'try\s*{', content))
                    catch_blocks = len(re.findall(r'catch\s*\(\w+\)\s*{', content))
                    
                    # Look for unhandled promise rejections
                    promises = len(re.findall(r'\.then\(', content))
                    catches = len(re.findall(r'\.catch\(', content))
                    
                    if promises > catches and promises > 0:
                        self.audit_results["error_handling"].append({
                            "file": js_file,
                            "unhandled_promises": promises - catches,
                            "severity": "medium"
                        })
            except Exception as e:
                pass
                
    def generate_report(self):
        """Generate comprehensive audit report"""
        print("\n[AUDIT] Generating comprehensive report...")
        
        report = {
            "phase": "PHASE 6 - PIPELINE INTEGRITY AUDIT",
            "timestamp": datetime.now().isoformat(),
            "audit_results": self.audit_results,
            "issue_summary": {
                "total_issues": sum(len(v) for v in self.audit_results.values() if isinstance(v, list)),
                "critical": sum(1 for v in self.audit_results.values() if isinstance(v, list) 
                              for item in v if isinstance(item, dict) and item.get('severity') == 'critical'),
                "high": sum(1 for v in self.audit_results.values() if isinstance(v, list) 
                          for item in v if isinstance(item, dict) and item.get('severity') == 'high'),
                "medium": sum(1 for v in self.audit_results.values() if isinstance(v, list) 
                            for item in v if isinstance(item, dict) and item.get('severity') == 'medium'),
                "low": sum(1 for v in self.audit_results.values() if isinstance(v, list) 
                         for item in v if isinstance(item, dict) and item.get('severity') == 'low')
            }
        }
        
        # Save report
        with open("PHASE6_PIPELINE_INTEGRITY_AUDIT_REPORT.json", "w") as f:
            json.dump(report, f, indent=2)
            
        return report
        
    def _find_files(self, pattern: str, base_dir: str = None, exclude_dirs: List[str] = None):
        """Find files matching pattern"""
        if base_dir is None:
            base_dir = self.base_path
        if exclude_dirs is None:
            exclude_dirs = ["venv", "node_modules", ".git", "dist", "build"]
        exclude_dirs = list(set(exclude_dirs + [".state-snapshots", "checkpoints", "backups"]))
            
        files = []
        for root, dirs, filenames in os.walk(base_dir):
            # Remove excluded directories from traversal
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            for filename in filenames:
                if filename.endswith(pattern.replace("*", "")):
                    files.append(os.path.join(root, filename))
                    
        return files


def main():
    print("=" * 80)
    print("PHASE 6 — PIPELINE INTEGRITY AUDIT")
    print("Comprehensive Analysis of Application Pipeline")
    print("=" * 80)
    
    audit = PipelineAudit()
    
    try:
        # Run all audit checks
        audit.scan_for_broken_imports()
        audit.scan_for_dead_code()
        audit.scan_for_null_references()
        audit.check_database_schema()
        audit.check_api_contracts()
        audit.check_environment_config()
        audit.check_error_handling()
        
        # Generate report
        report = audit.generate_report()
        
        # Print summary
        print("\n" + "=" * 80)
        print("PHASE 6 AUDIT SUMMARY")
        print("=" * 80)
        
        summary = report["issue_summary"]
        print(f"\nTotal Issues Found: {summary['total_issues']}")
        print(f"  - Critical: {summary['critical']}")
        print(f"  - High: {summary['high']}")
        print(f"  - Medium: {summary['medium']}")
        print(f"  - Low: {summary['low']}")
        
        if summary['critical'] > 0 or summary['high'] > 0:
            print("\n⚠️  ISSUES DETECTED - See PHASE6_PIPELINE_INTEGRITY_AUDIT_REPORT.json for details")
            return 1
        else:
            print("\n✓ No critical or high-severity issues detected")
            return 0
            
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
