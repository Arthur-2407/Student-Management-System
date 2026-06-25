const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const axios = require('axios');

// Load env vars
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'your-super-secret-jwt-access-key';
const DB_HOST = process.env.DB_HOST || 'student-db'; // internal docker host
const DB_USER = 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'securepassword123';
const DB_NAME = 'student_system';

const pool = new Pool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: parseInt(process.env.DB_PORT || '5432')
});

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001'; // internal docker port

async function run() {
  console.log('--- STARTING ASSIGNMENT FILES SYSTEM VERIFICATION ---');
  
  // 1. Insert/ensure teacher and student exist in DB
  const client = await pool.connect();
  try {
    // Clean up first
    await client.query("DELETE FROM students WHERE student_id IN ('T001', 'S001')");
    
    // Insert Teacher
    const teacherRes = await client.query(
      `INSERT INTO students (student_id, first_name, last_name, email, role, password_hash, is_active, department, position, hire_date)
       VALUES ('T001', 'Test', 'Teacher', 'teacher@test.com', 'teacher', '$2a$10$OXc.LHem9gEyDNMKjyH7CepTNesYPmZ62HPF8ISZheTGkk2YqwPgm', TRUE, 'Science', 'Maths Teacher', '2026-06-14')
       RETURNING id`
    );
    const teacherDbId = teacherRes.rows[0].id;
    console.log(`Created Teacher with ID: ${teacherDbId}`);

    // Insert Student
    const studentRes = await client.query(
      `INSERT INTO students (student_id, first_name, last_name, email, role, password_hash, is_active, teacher_id, department, position, hire_date)
       VALUES ('S001', 'Test', 'Student', 'student@test.com', 'student', '$2a$10$OXc.LHem9gEyDNMKjyH7CepTNesYPmZ62HPF8ISZheTGkk2YqwPgm', TRUE, $1, 'Science', 'Student', '2026-06-14')
       RETURNING id`,
      [teacherDbId]
    );
    const studentDbId = studentRes.rows[0].id;
    console.log(`Created Student with ID: ${studentDbId}`);

    // Link in teacher_assignments junction table
    await client.query(
      `INSERT INTO teacher_assignments (teacher_id, student_id, is_active)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (teacher_id, student_id) DO UPDATE SET is_active = TRUE`,
      [teacherDbId, studentDbId]
    );
    console.log('Linked Student S001 to Teacher T001 in teacher_assignments');

    // 2. Generate JWT Access Tokens
    const signToken = (dbId, studentId, role) => {
      return jwt.sign(
        {
          id: dbId,
          studentId: studentId,
          email: `${role}@test.com`,
          role: role,
          type: 'access'
        },
        JWT_ACCESS_SECRET,
        {
          expiresIn: '15m',
          issuer: 'attendance-platform',
          audience: 'attendance-web',
          jwtid: require('crypto').randomUUID()
        }
      );
    };

    const teacherToken = signToken(teacherDbId, 'T001', 'teacher');
    const studentToken = signToken(studentDbId, 'S001', 'student');
    console.log('Generated JWT tokens for Teacher and Student');

    // 3. Create an Assignment (Teacher)
    const assignmentPayload = {
      title: 'Math Homework',
      subject: 'Algebra',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      totalMarks: 100,
      description: 'Algebra 101 exercise sheet.',
      instructions: 'Please answer all questions and upload PDF.',
      allowedFileTypes: 'pdf,txt,jpg,zip',
      maxFileSizeMb: 25
    };

    const createAssignRes = await axios.post(`${BACKEND_URL}/api/assignments`, assignmentPayload, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    
    if (!createAssignRes.data.success) {
      throw new Error('Failed to create assignment');
    }
    const assignment = createAssignRes.data.data;
    const assignmentId = assignment.id;
    console.log(`Created Assignment ID: ${assignmentId}`);

    // 4. Upload resource reference files (Teacher)
    // We will create a dummy text file to upload
    const dummyFilePath = path.join(__dirname, 'temp_reference_file.txt');
    fs.writeFileSync(dummyFilePath, 'This is a sample algebra study resource content.');

    const FormData = require('form-data');
    const form = new FormData();
    form.append('files', fs.createReadStream(dummyFilePath), 'algebra_guide.txt');

    const uploadRes = await axios.post(`${BACKEND_URL}/api/assignments/${assignmentId}/files`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${teacherToken}`
      }
    });

    if (!uploadRes.data.success) {
      throw new Error('Failed to upload assignment reference file');
    }
    const uploadedResource = uploadRes.data.data[0];
    const resourceId = uploadedResource.resource_id;
    console.log(`Uploaded resource reference file. Resource ID: ${resourceId}`);
    console.log(`File Name: ${uploadedResource.original_name}, Version: ${uploadedResource.version}, Checksum: ${uploadedResource.checksum}`);

    // 5. Retrieve assignment detail as student
    const studentDetailRes = await axios.get(`${BACKEND_URL}/api/assignments/student/assignments/${assignmentId}`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });

    if (!studentDetailRes.data.success) {
      throw new Error('Student failed to fetch assignment details');
    }
    
    const studentDetail = studentDetailRes.data.data;
    console.log(`Student detail fetch verified. Resources count: ${studentDetail.resources.length}`);
    if (studentDetail.resources.length === 0 || studentDetail.resources[0].resource_id !== resourceId) {
      throw new Error('Reference files list is missing or mismatch in student details response');
    }

    // 6. Download the file as student
    const downloadRes = await axios.get(`${BACKEND_URL}/api/assignments/student/assignments/${assignmentId}/download/${resourceId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      responseType: 'arraybuffer'
    });

    const downloadedContent = Buffer.from(downloadRes.data).toString();
    console.log(`Downloaded content matches: ${downloadedContent === 'This is a sample algebra study resource content.'}`);
    if (downloadedContent !== 'This is a sample algebra study resource content.') {
      throw new Error('Downloaded file content is corrupted or mismatched!');
    }

    // 7. Verify download count increment
    const checkCountRes = await client.query(
      `SELECT download_count FROM assignment_resources WHERE resource_id = $1`,
      [resourceId]
    );
    const count = checkCountRes.rows[0].download_count;
    console.log(`Download count: ${count} (expected: 1)`);
    if (count !== 1) {
      throw new Error(`Download count did not increment properly! Expected 1, got ${count}`);
    }

    // 8. Delete the resource file (Teacher)
    const deleteRes = await axios.delete(`${BACKEND_URL}/api/assignments/files/${resourceId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });

    if (!deleteRes.data.success) {
      throw new Error('Teacher failed to delete resource file');
    }
    console.log('Successfully deleted assignment resource file');

    // Clean up disk temp file
    if (fs.existsSync(dummyFilePath)) {
      fs.unlinkSync(dummyFilePath);
    }
    
    console.log('✅ ALL RESOURCE DISTRIBUTION E2E VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ E2E VERIFICATION FAILED:', err.message);
    if (err.response) {
      console.error('Response Status:', err.response.status);
      console.error('Response Data:', err.response.data);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
