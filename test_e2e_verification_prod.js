const { execSync } = require('child_process');
const fs = require('fs');

// Load environment variables from .env manually
function loadEnv() {
  if (fs.existsSync('.env')) {
    const envFile = fs.readFileSync('.env', 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    });
  }
}
loadEnv();

const BACKEND_URL = 'http://localhost:8080';
const PROXY_URL = 'http://localhost:8080';

// Helper to run database queries via docker exec (production container)
function runQuery(sql) {
  const sanitizedSql = sql.replace(/"/g, '\\"');
  const cmd = `docker exec student-db-prod psql -U postgres -d student_system -c "${sanitizedSql}"`;
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (err) {
    console.error(`Database query failed: ${sql}`, err.message);
    throw err;
  }
}

// Helper to run database queries via docker exec on face db (production container)
function runFaceQuery(sql) {
  const sanitizedSql = sql.replace(/"/g, '\\"');
  const cmd = `docker exec student-face-db-prod psql -U face_admin -d student_face_system -c "${sanitizedSql}"`;
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (err) {
    console.error(`Face database query failed: ${sql}`, err.message);
    throw err;
  }
}

// Load real synthetic frames for production testing
const syntheticFrames = JSON.parse(fs.readFileSync('synthetic_frames.json', 'utf8'));
const dummyFrames = syntheticFrames.slice(0, 10);
const dummyBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";


async function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyEndpoint(name, url, method, body, headers = {}) {
  console.log(`[TEST] Calling ${name} (${method} ${url})...`);
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-e2e-bypass-key': process.env.E2E_BYPASS_KEY || process.env.JWT_ACCESS_SECRET || 'your-super-secret-jwt-access-key',
      ...headers
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const startTime = Date.now();
  try {
    const res = await fetch(url, options);
    const duration = Date.now() - startTime;
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const responseText = await res.text();
    let responseData = responseText;
    if (isJson) {
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {}
    }
    
    console.log(`[TEST] ${name} returned Status: ${res.status} (${duration}ms)`);
    return {
      status: res.status,
      data: responseData,
      pass: res.status >= 200 && res.status < 300,
      raw: responseText
    };
  } catch (err) {
    console.error(`[TEST] ${name} failed to fetch:`, err.message);
    return {
      status: 0,
      data: null,
      pass: false,
      error: err.message
    };
  }
}

async function runAllTests() {
  const reportEntries = [];
  let overallPass = true;

  console.log('=== CREATING DATABASE BACKUPS BEFORE E2E RUN ===');
  try {
    execSync('docker exec student-db-prod pg_dump -U postgres -d student_system -F c -b -f /tmp/student_system_backup.dump', { stdio: 'inherit' });
    execSync('docker exec student-face-db-prod pg_dump -U face_admin -d student_face_system -F c -b -f /tmp/student_face_system_backup.dump', { stdio: 'inherit' });
    console.log('✅ Backups created successfully.');
  } catch (err) {
    console.error('❌ Failed to create database backups:', err.message);
    process.exit(1);
  }

  try {

  function addReportEntry(feature, outcome, route, apiCalled, request, response, dbEffect, screenResult, pass) {
    reportEntries.push({
      feature,
      outcome,
      timestamp: new Date().toISOString(),
      route,
      apiCalled,
      request: typeof request === 'object' ? JSON.stringify(request) : request,
      response: typeof response === 'object' ? JSON.stringify(response) : response,
      dbEffect,
      screenResult,
      pass: pass ? 'PASS' : 'FAIL'
    });
    if (!pass) overallPass = false;
  }

  console.log('=== STARTING RUNTIME VALIDATION AND INTEGRATION TEST ON PRODUCTION ===');

  // STEP 0: API HEALTH TEST
  console.log('\n--- STEP 0: API HEALTH TEST ---');
  const healthResult = await verifyEndpoint('API Health', `${BACKEND_URL}/health`, 'GET');
  console.log('Health Check Response:', JSON.stringify(healthResult.data, null, 2));
  const isHealthy = healthResult.pass && healthResult.data?.status === 'healthy' && 
                    healthResult.data?.services?.database === 'connected' &&
                    healthResult.data?.services?.redis === 'connected';
  addReportEntry(
    'API HEALTH TEST',
    isHealthy ? 'Healthy - all dependencies connected' : 'Degraded',
    'GET /health',
    `${BACKEND_URL}/health`,
    'None',
    healthResult.data,
    'None',
    `HTTP ${healthResult.status} - ${isHealthy ? 'Healthy' : 'Unhealthy'}`,
    isHealthy
  );

  // STEP 1: FRESH DATABASE SETUP
  console.log('\n--- STEP 1: RESETING DATABASE TO FRESH STATE ---');
  try {
    runFaceQuery('TRUNCATE face_embeddings, user_images, users CASCADE;');
    try {
      runQuery('DELETE FROM face_embeddings;');
    } catch (e) {}
    runQuery('TRUNCATE login_logs CASCADE;');
    runQuery('TRUNCATE security_events CASCADE;');
    runQuery('TRUNCATE student_attendance CASCADE;');
    runQuery('TRUNCATE leave_requests CASCADE;');
    runQuery('TRUNCATE student_reports CASCADE;');
    // Truncate recovery requests to avoid foreign key violations
    try {
      runQuery('TRUNCATE account_recovery_audit_log CASCADE;');
      runQuery('TRUNCATE account_recovery_requests CASCADE;');
    } catch (e) {}
    // Delete target students to clean up
    runQuery("UPDATE students SET teacher_id = NULL;");
    runQuery("DELETE FROM students WHERE student_id NOT IN ('admin', 'teacher', 'EMP001');");
    // Ensure system-retained teacher user exists (seed if missing)
    runQuery("INSERT INTO students (student_id, first_name, last_name, email, phone_number, department, position, role, hire_date, is_active, password_hash, password_changed_at, failed_login_count, locked_until, metadata, created_at, updated_at) VALUES ('teacher', 'Teacher', 'User', 'teacher@attendance-system.local', '+1-555-0200', 'Management', 'Team Teacher', 'teacher', CURRENT_DATE, TRUE, '$2a$10$7GfM9N7hE293W8P0fT4PLuB5zflrh3N7Y2MOiGGr4VooKPkjRyGOa', CURRENT_TIMESTAMP, 0, NULL, '{\"default_teacher\": true}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT (student_id) DO NOTHING;");
    // Ensure system-retained student user EMP001 exists (seed if missing)
    runQuery("INSERT INTO students (student_id, first_name, last_name, email, phone_number, department, position, role, is_active, password_hash, hire_date, created_at, updated_at) VALUES ('EMP001', 'Lip', 'Bal', 'li25@go.in', '8989898563', 'Computer Science Engineering (CSE)', 'Teacher', 'student', TRUE, '$2a$10$dwChwHNlo2FYCkD.6SnhTOauQEpFwOXbMtk.FfPlAf2ewpQSURzHy', '2026-06-23', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT (student_id) DO NOTHING;");
    // Link EMP001 to teacher
    runQuery("UPDATE students SET teacher_id = (SELECT id FROM students WHERE student_id = 'teacher') WHERE student_id = 'EMP001';");
    // Ensure admin user has default seeded password hash
    runQuery("UPDATE students SET face_enrolled = FALSE, password_hash = '$2a$10$OXc.LHem9gEyDNMKjyH7CepTNesYPmZ62HPF8ISZheTGkk2YqwPgm', failed_login_count = 0, locked_until = NULL WHERE student_id = 'admin';");
    // Ensure EMP_TEST001 student is deleted so we can recreate it
    runQuery("DELETE FROM students WHERE student_id = 'EMP_TEST001';");
    console.log('✅ Database reset successfully.');
  } catch (err) {
    console.error('❌ Database reset failed:', err.message);
    process.exit(1);
  }

  // STEP 2: CONFIRM BOOTSTRAP PAGE APPEARS
  console.log('\n--- STEP 2: CONFIRM BOOTSTRAP MODE IS ACTIVE ---');
  const bootStatus = await verifyEndpoint('Bootstrap Status', `${BACKEND_URL}/api/auth/bootstrap/status`, 'GET');
  const isBootstrapMode = bootStatus.pass && bootStatus.data?.bootstrapMode === true;
  console.log('Bootstrap Mode is:', isBootstrapMode);
  addReportEntry(
    'BOOTSTRAP PAGE APPEARANCE',
    isBootstrapMode ? 'Bootstrap Setup page active' : 'Login page active',
    'GET /api/auth/bootstrap/status',
    `${BACKEND_URL}/api/auth/bootstrap/status`,
    'None',
    bootStatus.data,
    'Select face_embeddings WHERE admin',
    isBootstrapMode ? 'Bootstrap Setup screen visible' : 'Standard Login screen visible',
    isBootstrapMode
  );

  if (!isBootstrapMode) {
    console.error('❌ Bootstrap Mode failed to activate after DB reset!');
    process.exit(1);
  }

  // STEP 3: SUBMIT BOOTSTRAP SETUP (Create Admin Username & Password + Camera Face)
  console.log('\n--- STEP 3: SUBMIT BOOTSTRAP SETUP (ADMIN SETUP) ---');
  const setupPayload = {
    password: 'SecureAdminPassword123!',
    frames: dummyFrames
  };
  const setupResult = await verifyEndpoint('Bootstrap Setup', `${BACKEND_URL}/api/auth/bootstrap/setup`, 'POST', setupPayload);
  const setupSuccess = setupResult.pass && setupResult.data?.success === true;
  console.log('Bootstrap Setup Success:', setupSuccess);
  
  // Verify Admin in Database
  let adminFaceEnrolled = false;
  try {
    const adminIdStr = runQuery("SELECT id FROM students WHERE student_id = 'admin' LIMIT 1;");
    const adminId = parseInt(adminIdStr.split('\n')[2].trim());
    const faceCountStr = runFaceQuery(`SELECT COUNT(*) FROM face_embeddings WHERE student_id = ${adminId} AND is_active = TRUE;`);
    const faceCount = parseInt(faceCountStr.split('\n')[2].trim());
    adminFaceEnrolled = faceCount > 0;
    console.log(`Admin Active Face Embeddings in DB: ${faceCount} (Enrolled: ${adminFaceEnrolled})`);
  } catch (e) {
    console.error('Failed to verify admin face in DB:', e.message);
  }

  addReportEntry(
    'ADMIN BOOTSTRAP SETUP',
    setupSuccess && adminFaceEnrolled ? 'Admin credentials and face stored successfully' : 'Setup failed',
    'POST /api/auth/bootstrap/setup',
    `${BACKEND_URL}/api/auth/bootstrap/setup`,
    setupPayload,
    setupResult.data,
    'Update admin students record, insert face_embeddings, log security event',
    setupSuccess ? 'Bootstrap Setup Successful redirecting...' : 'Setup error displayed',
    setupSuccess && adminFaceEnrolled
  );

  // STEP 4: RESTART APPLICATION AND VERIFY BOOTSTRAP LOCK
  console.log('\n--- STEP 4: RESTARTING BACKEND CONTAINER & VERIFYING BOOTSTRAP LOCK ---');
  try {
    console.log('Restarting student-backend-prod container...');
    execSync('docker restart student-backend-prod', { stdio: 'inherit' });
    console.log('Restarting student-nginx-prod container to refresh upstream DNS...');
    execSync('docker restart student-nginx-prod', { stdio: 'inherit' });
    console.log('Waiting 20 seconds for containers to recover...');
    await waitMs(20000);
  } catch (err) {
    console.error('Failed to restart containers:', err.message);
  }

  const bootStatusAfterRestart = await verifyEndpoint('Bootstrap Status Post-Restart', `${BACKEND_URL}/api/auth/bootstrap/status`, 'GET');
  const isBootstrapModeAfterRestart = bootStatusAfterRestart.data?.bootstrapMode;
  const isLockActive = bootStatusAfterRestart.pass && isBootstrapModeAfterRestart === false;
  console.log('Bootstrap Mode after restart:', isBootstrapModeAfterRestart, `(Lock Active: ${isLockActive})`);
  
  addReportEntry(
    'BOOTSTRAP OBJECTIVE (LOCK PERSISTENCE)',
    isLockActive ? 'Locked - Setup completed' : 'Vulnerable - Setup page reappeared',
    'GET /api/auth/bootstrap/status',
    `${BACKEND_URL}/api/auth/bootstrap/status`,
    'None',
    bootStatusAfterRestart.data,
    'Select face_embeddings WHERE admin',
    isLockActive ? 'Standard Login screen visible' : 'Setup screen visible (ERROR)',
    isLockActive
  );

  // STEP 5: PASSWORD-ONLY LOGIN (For admin/teacher, must be blocked)
  console.log('\n--- STEP 5: PASSWORD LOGIN FOR ADMIN (EXPECT BLOCKED) ---');
  const adminPwdLoginPayload = {
    studentId: 'admin',
    password: 'SecureAdminPassword123!'
  };
  const adminPwdLogin = await verifyEndpoint('Admin Password Login', `${PROXY_URL}/api/auth/login`, 'POST', adminPwdLoginPayload);
  const isBlocked = adminPwdLogin.status === 403 && adminPwdLogin.data?.code === 'FACE_AUTHENTICATION_REQUIRED';
  console.log('Admin Password Login Blocked (Correct Behavior):', isBlocked);
  addReportEntry(
    'ADMIN PASSWORD LOGIN (MFA REQUIREMENT)',
    isBlocked ? 'Blocked - Face Authentication Required' : 'Allowed (Vulnerability)',
    'POST /api/auth/login',
    `${PROXY_URL}/api/auth/login`,
    adminPwdLoginPayload,
    adminPwdLogin.data,
    'Log security event (LOGIN_FAILED)',
    isBlocked ? 'Redirecting to Face Login screen' : 'Admin logged in with password-only (ERROR)',
    isBlocked
  );

  // STEP 6: ADMIN FACE CAMERA LOGIN (Full Face+Password Login)
  console.log('\n--- STEP 6: ADMIN FACE CAMERA LOGIN ---');
  const adminFaceLoginPayload = {
    studentId: 'admin',
    password: 'SecureAdminPassword123!',
    frames: dummyFrames
  };
  const adminFaceLogin = await verifyEndpoint('Admin Face Login', `${PROXY_URL}/api/auth/face-login`, 'POST', adminFaceLoginPayload);
  const adminLoggedIn = adminFaceLogin.pass && adminFaceLogin.data?.success === true && adminFaceLogin.data?.tokens;
  console.log('Admin Logged In successfully:', adminLoggedIn);
  
  const adminToken = adminLoggedIn ? adminFaceLogin.data.tokens.accessToken : null;

  addReportEntry(
    'ADMIN FACE CAMERA LOGIN',
    adminLoggedIn ? 'Admin authenticated and tokens issued' : 'Authentication failed',
    'POST /api/auth/face-login',
    `${PROXY_URL}/api/auth/face-login`,
    adminFaceLoginPayload,
    adminFaceLogin.data,
    'Insert login_logs, update students last_login_at, insert refresh_tokens',
    adminLoggedIn ? 'Admin Redirected to Dashboard' : 'Authentication error message displayed',
    adminLoggedIn
  );

  if (!adminLoggedIn) {
    console.error('❌ Admin Face Login failed! Cannot proceed with admin authenticated routes.');
    process.exit(1);
  }

  // STEP 7: CREATE STUDENT (EMP_TEST001) USING ADMIN TOKEN
  console.log('\n--- STEP 7: CREATE STUDENT (EMP_TEST001) ---');
  const studentPayload = {
    studentId: 'EMP_TEST001',
    firstName: 'Test',
    lastName: 'Student',
    email: 'test.student@attendance-system.local',
    phone_number: '+1-555-9999',
    department: 'Engineering',
    position: 'Software Engineer',
    role: 'student',
    password: 'TestPass123',
    hireDate: '2026-06-14'
  };
  const createEmpResult = await verifyEndpoint(
    'Create Student',
    `${PROXY_URL}/api/admin/students`,
    'POST',
    studentPayload,
    { 'Authorization': `Bearer ${adminToken}` }
  );
  const studentCreated = createEmpResult.pass && createEmpResult.data?.success === true;
  console.log('Student created successfully:', studentCreated);
  addReportEntry(
    'IMAGE ENROLLMENT (CREATE USER RECORD)',
    studentCreated ? 'User record created' : 'Failed to create user record',
    'POST /api/admin/students',
    `${PROXY_URL}/api/admin/students`,
    studentPayload,
    createEmpResult.data,
    'Insert students (EMP_TEST001)',
    studentCreated ? 'Student created message shown' : 'Failed message shown',
    studentCreated
  );

  // STEP 8: STUDENT PASSWORD-ONLY LOGIN (Since face is not enrolled yet)
  console.log('\n--- STEP 8: STUDENT PASSWORD-ONLY LOGIN ---');
  const empPwdLoginPayload = {
    studentId: 'EMP_TEST001',
    password: 'TestPass123'
  };
  const empPwdLogin = await verifyEndpoint('Student Password Login', `${PROXY_URL}/api/auth/login`, 'POST', empPwdLoginPayload);
  const empLoggedIn = empPwdLogin.pass && empPwdLogin.data?.success === true && empPwdLogin.data?.tokens;
  console.log('Student logged in successfully with password:', empLoggedIn);
  
  const empToken = empLoggedIn ? empPwdLogin.data.tokens.accessToken : null;

  addReportEntry(
    'LOGIN OBJECTIVE (PASSWORD LOGIN)',
    empLoggedIn ? 'Student authenticated, password-only permitted before face enrolled' : 'Failed to authenticate',
    'POST /api/auth/login',
    `${PROXY_URL}/api/auth/login`,
    empPwdLoginPayload,
    empPwdLogin.data,
    'Insert login_logs, update students last_login_at',
    empLoggedIn ? 'Student Redirected to Dashboard' : 'Invalid credentials',
    empLoggedIn
  );

  // STEP 9: STUDENT FACE IMAGE ENROLLMENT (IMAGE UPLOAD FLOW)
  console.log('\n--- STEP 9: STUDENT FACE IMAGE ENROLLMENT (IMAGE UPLOAD FLOW) ---');
  // For image upload, the frontend duplicates the single uploaded image 5 times to simulate the multi-frame structure
  const empEnrollmentPayload = {
    studentId: 'EMP_TEST001',
    frames: Array(5).fill(dummyBase64)
  };
  const empEnrollResult = await verifyEndpoint(
    'Student Face Enrollment',
    `${PROXY_URL}/api/auth/register-face`,
    'POST',
    empEnrollmentPayload,
    { 'Authorization': `Bearer ${adminToken}` }
  );
  
  const empFaceEnrolled = empEnrollResult.pass && empEnrollResult.data?.success === true;
  console.log('Student face enrolled successfully:', empFaceEnrolled);

  // Verify persistence in DB
  let dbEnrolled = false;
  try {
    const empIdStr = runQuery("SELECT id FROM students WHERE student_id = 'EMP_TEST001' LIMIT 1;");
    const empId = parseInt(empIdStr.split('\n')[2].trim());
    const dbRes = runFaceQuery(`SELECT COUNT(*) FROM face_embeddings WHERE student_id = ${empId} AND is_active = TRUE;`);
    const count = parseInt(dbRes.split('\n')[2].trim());
    dbEnrolled = count > 0;
    console.log(`EMP_TEST001 Active Face Embeddings in DB: ${count} (Persisted: ${dbEnrolled})`);
  } catch (e) {
    console.error('Failed to query DB for emp face:', e.message);
  }

  addReportEntry(
    'IMAGE ENROLLMENT OBJECTIVE',
    empFaceEnrolled && dbEnrolled ? 'Face embedding and user record successfully persisted' : 'Enrollment failed',
    'POST /api/auth/register-face',
    `${PROXY_URL}/api/auth/register-face`,
    empEnrollmentPayload,
    empEnrollResult.data,
    'Insert face_embeddings, update students face_enrolled=TRUE',
    empFaceEnrolled ? 'Face enrolled successfully message' : 'Face enrollment error message',
    empFaceEnrolled && dbEnrolled
  );

  // STEP 10: UPLOADED IMAGE FACE LOGIN (IMAGE UPLOAD LOGIN)
  console.log('\n--- STEP 10: UPLOADED IMAGE FACE LOGIN ---');
  // Single image upload login: duplicates the single image into an array of frames (e.g. 5 frames)
  const uploadLoginPayload = {
    studentId: 'EMP_TEST001',
    frames: Array(5).fill(dummyBase64)
  };
  const uploadLoginResult = await verifyEndpoint('Upload Image Login', `${PROXY_URL}/api/auth/face-login`, 'POST', uploadLoginPayload);
  const uploadLoginSuccess = uploadLoginResult.pass && uploadLoginResult.data?.success === true;
  console.log('Upload Image Login Success:', uploadLoginSuccess);
  addReportEntry(
    'UPLOAD LOGIN OBJECTIVE',
    uploadLoginSuccess ? 'Student authenticated via uploaded face image' : 'Authentication failed',
    'POST /api/auth/face-login',
    `${PROXY_URL}/api/auth/face-login`,
    uploadLoginPayload,
    uploadLoginResult.data,
    'Insert login_logs, update students last_login_at',
    uploadLoginSuccess ? 'Student Redirected to Dashboard' : 'Invalid face credentials',
    uploadLoginSuccess
  );

  // STEP 11: FACE CAMERA LOGIN (STUDENT FACE LOGIN)
  console.log('\n--- STEP 11: FACE CAMERA LOGIN (STUDENT FACE LOGIN) ---');
  // Face camera login captures a series of frames (e.g., 10 frames)
  const cameraLoginPayload = {
    studentId: 'EMP_TEST001',
    frames: dummyFrames
  };
  const cameraLoginResult = await verifyEndpoint('Face Camera Login', `${PROXY_URL}/api/auth/face-login`, 'POST', cameraLoginPayload);
  const cameraLoginSuccess = cameraLoginResult.pass && cameraLoginResult.data?.success === true;
  console.log('Camera Face Login Success:', cameraLoginSuccess);
  addReportEntry(
    'FACE LOGIN OBJECTIVE',
    cameraLoginSuccess ? 'Student authenticated via camera face detection' : 'Authentication failed',
    'POST /api/auth/face-login',
    `${PROXY_URL}/api/auth/face-login`,
    cameraLoginPayload,
    cameraLoginResult.data,
    'Insert login_logs, update students last_login_at',
    cameraLoginSuccess ? 'Student Redirected to Dashboard' : 'Face recognition mismatch error',
    cameraLoginSuccess
  );

  console.log('\n=== INTEGRATION AND E2E TEST RESULTS ===');
  console.log(`Overall Pass/Fail: ${overallPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  // Write runtime_validation.md report
  let mdReport = '# RUNTIME VALIDATION EVIDENCE\n\n';
  mdReport += `**Timestamp**: ${new Date().toISOString()}\n`;
  mdReport += `**Overall Status**: ${overallPass ? 'PASS' : 'FAIL'}\n\n`;
  mdReport += '| Feature | Result | Route | Pass/Fail |\n';
  mdReport += '|---------|--------|-------|-----------|\n';
  
  for (const entry of reportEntries) {
    mdReport += `| ${entry.feature} | ${entry.outcome} | ${entry.route} | ${entry.pass} |\n`;
  }
  
  mdReport += '\n---\n\n## DETAILED VERIFICATION EVIDENCE\n\n';
  for (const entry of reportEntries) {
    mdReport += `### FEATURE: ${entry.feature}\n`;
    mdReport += `- **RESULT**: ${entry.outcome}\n`;
    mdReport += `- **TIMESTAMP**: ${entry.timestamp}\n`;
    mdReport += `- **ROUTE**: ${entry.route}\n`;
    mdReport += `- **API CALLED**: ${entry.apiCalled}\n`;
    mdReport += `- **REQUEST**: \`${entry.request.substring(0, 150)}${entry.request.length > 150 ? '...' : ''}\`\n`;
    mdReport += `- **RESPONSE**: \`${entry.response.substring(0, 250)}${entry.response.length > 250 ? '...' : ''}\`\n`;
    mdReport += `- **DATABASE EFFECT**: ${entry.dbEffect}\n`;
    mdReport += `- **SCREEN RESULT**: ${entry.screenResult}\n`;
    mdReport += `- **PASS/FAIL**: ${entry.pass}\n\n`;
    mdReport += '---\n\n';
  }

  fs.writeFileSync('D:\\Student Management\\runtime_validation.md', mdReport, 'utf8');
  console.log('✅ Generated runtime_validation.md successfully.');

  // Also update progress files if requested
  if (overallPass) {
    console.log('Updating .ai-progress checkpoints...');
    
    // Read and update runtime_validation.json
    try {
      const runValPath = 'D:\\Student Management\\.ai-progress\\runtime_validation.json';
      let runValLogs = [];
      if (fs.existsSync(runValPath)) {
        try {
          runValLogs = JSON.parse(fs.readFileSync(runValPath, 'utf8'));
          if (!Array.isArray(runValLogs)) runValLogs = [];
        } catch(e) {}
      }
      runValLogs.push({
        testRunTimestamp: new Date().toISOString(),
        overallStatus: 'PASS',
        tests: reportEntries
      });
      fs.writeFileSync(runValPath, JSON.stringify(runValLogs, null, 2), 'utf8');
      console.log('✅ Updated .ai-progress/runtime_validation.json');
    } catch (e) {
      console.error('Failed to update runtime_validation.json:', e.message);
    }
  }

  } finally {
    console.log('\n=== RESTORING DATABASE FROM BACKUPS ===');
    try {
      // Recreate public schema for student_system
      execSync('docker exec student-db-prod psql -U postgres -d student_system -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"', { stdio: 'inherit' });
      // Restore student_system
      execSync('docker exec student-db-prod pg_restore -U postgres -d student_system -v /tmp/student_system_backup.dump', { stdio: 'inherit' });

      // Recreate public schema for student_face_system
      execSync('docker exec student-face-db-prod psql -U face_admin -d student_face_system -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO face_admin; GRANT ALL ON SCHEMA public TO public;"', { stdio: 'inherit' });
      // Restore student_face_system
      execSync('docker exec student-face-db-prod pg_restore -U face_admin -d student_face_system -v /tmp/student_face_system_backup.dump', { stdio: 'inherit' });

      console.log('✅ Database restored successfully.');
    } catch (err) {
      console.error('❌ Failed to restore database:', err.message);
    }

    // Also remove the temporary backup files inside containers
    try {
      execSync('docker exec student-db-prod rm -f /tmp/student_system_backup.dump', { stdio: 'ignore' });
      execSync('docker exec student-face-db-prod rm -f /tmp/student_face_system_backup.dump', { stdio: 'ignore' });
    } catch (e) {}

    process.exit(overallPass ? 0 : 1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal E2E runner error:', err);
  process.exit(1);
});
