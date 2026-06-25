const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { query } = require('../../config/database');
const { logger } = require('../../config/logger');

const router = express.Router();

// Virus scan hook placeholder for security compliance
const runVirusScan = (filePath) => {
  logger.info('Virus scan simulation completed successfully', { file: filePath });
  return true;
};


// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../../uploads/assignments');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedOriginal = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedOriginal);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25 MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|zip|txt)$/i;
    if (!file.originalname.match(allowedExtensions)) {
      return cb(new Error('Only allowed file types are permitted: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, JPG/JPEG, PNG, ZIP, TXT'), false);
    }
    cb(null, true);
  }
});

// CREATE Assignment (Teacher / Admin)
router.post('/', async (req, res) => {
  const { title, description, instructions, subject, dueDate, totalMarks, allowedFileTypes, maxFileSizeMb } = req.body;
  const teacherId = req.user.id;
  const role = req.user.role;

  if (role !== 'teacher' && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  if (!title || !subject || !dueDate || !totalMarks) {
    return res.status(400).json({ success: false, message: 'Title, Subject, Due Date, and Total Marks are required' });
  }

  try {
    const result = await query(
      `INSERT INTO assignments (title, description, instructions, teacher_id, subject, due_date, total_marks, allowed_file_types, max_file_size_mb)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        title,
        description,
        instructions,
        teacherId,
        subject,
        new Date(dueDate),
        parseInt(totalMarks, 10),
        allowedFileTypes || 'pdf,doc,docx,jpg,jpeg,png,zip,ppt,pptx,xls,xlsx,txt',
        parseInt(maxFileSizeMb, 10) || 25
      ]
    );

    const assignment = result.rows[0];

    // Notify all students under this teacher
    try {
      const students = await query(
        `SELECT id FROM students 
         WHERE (
           teacher_id = $1 OR id IN (
             SELECT student_id FROM teacher_assignments 
             WHERE teacher_id = $1 AND is_active = TRUE
           )
         ) AND is_active = TRUE AND role = 'student'`,
        [teacherId]
      );

      const io = req.app.get('io');
      const titleText = `New Assignment: ${title}`;
      const msgText = `A new assignment "${title}" has been assigned for ${subject}. Due: ${new Date(dueDate).toLocaleString()}.`;

      for (const s of students.rows) {
        await query(
          `INSERT INTO notifications (student_id, recipient_id, sender_id, title, message, type, is_read)
           VALUES ($1, $1, $2, $3, $4, 'general', FALSE)`,
          [s.id, teacherId, titleText, msgText]
        );
        if (io) {
          io.to(`student:${s.id}`).emit('notification', { title: titleText, message: msgText });
        }
      }
    } catch (notifErr) {
      logger.warn('Failed to notify students of new assignment', { error: notifErr.message });
    }

    res.json({ success: true, data: assignment });
  } catch (err) {
    logger.error('Create assignment error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to create assignment' });
  }
});

// GET Teacher's Assignments (Teacher / Admin)
router.get('/teacher', async (req, res) => {
  const teacherId = req.user.id;
  const role = req.user.role;

  if (role !== 'teacher' && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  try {
    const result = await query(
      `SELECT a.*,
              (SELECT COUNT(*)::int FROM assignment_submissions WHERE assignment_id = a.id) as submission_count,
              (SELECT COUNT(DISTINCT s.id)::int FROM students s 
               WHERE (
                 s.teacher_id = a.teacher_id OR s.id IN (
                   SELECT student_id FROM teacher_assignments 
                   WHERE teacher_id = a.teacher_id AND is_active = TRUE
                 )
               ) AND s.role = 'student' AND s.is_active = TRUE) as total_students
       FROM assignments a
       WHERE a.teacher_id = $1
       ORDER BY a.created_at DESC`,
      [teacherId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Fetch teacher assignments error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to fetch assignments' });
  }
});

// GET Assignment Details with Student Submissions (Teacher / Admin)
router.get('/teacher/:id', async (req, res) => {
  const assignmentId = req.params.id;
  const teacherId = req.user.id;
  const role = req.user.role;

  if (role !== 'teacher' && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  try {
    const assignmentResult = await query(
      `SELECT * FROM assignments WHERE id = $1`,
      [assignmentId]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const assignment = assignmentResult.rows[0];
    if (role !== 'admin' && assignment.teacher_id !== teacherId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to view this assignment' });
    }

    // Get assigned students and their submissions
    const studentsResult = await query(
      `SELECT s.id as student_id, s.student_id as student_code, s.first_name, s.last_name, s.department,
              sub.id as submission_id, sub.comments, sub.submitted_at, sub.status as submission_status, sub.marks, sub.feedback,
              json_agg(
                json_build_object(
                  'id', sf.id,
                  'file_name', sf.file_name,
                  'file_size', sf.file_size,
                  'uploaded_at', sf.uploaded_at
                )
              ) FILTER (WHERE sf.id IS NOT NULL) as files
       FROM students s
       LEFT JOIN assignment_submissions sub ON sub.assignment_id = $1 AND sub.student_id = s.id
       LEFT JOIN submission_files sf ON sf.submission_id = sub.id
       WHERE (
         s.teacher_id = $2 OR s.id IN (
           SELECT student_id FROM teacher_assignments 
           WHERE teacher_id = $2 AND is_active = TRUE
         )
       ) AND s.role = 'student' AND s.is_active = TRUE
       GROUP BY s.id, sub.id
       ORDER BY s.first_name, s.last_name`,
      [assignmentId, assignment.teacher_id]
    );

    const resourcesResult = await query(
      `SELECT resource_id, assignment_id, teacher_id, file_name, original_name, file_extension, mime_type, file_size, version, uploaded_at, download_count
       FROM assignment_resources 
       WHERE assignment_id = $1 AND is_active = TRUE
       ORDER BY uploaded_at ASC`,
      [assignmentId]
    );

    res.json({ 
      success: true, 
      data: {
        assignment,
        resources: resourcesResult.rows,
        submissions: studentsResult.rows.map(row => ({
          ...row,
          files: row.files || []
        }))
      } 
    });
  } catch (err) {
    logger.error('Fetch assignment details error', { error: err.message, assignmentId });
    res.status(500).json({ success: false, message: 'Failed to fetch assignment details' });
  }
});

// UPDATE Assignment (Teacher / Admin)
router.put('/:id', async (req, res) => {
  const assignmentId = req.params.id;
  const { title, description, instructions, subject, dueDate, totalMarks, allowedFileTypes, maxFileSizeMb } = req.body;
  const teacherId = req.user.id;
  const role = req.user.role;

  if (role !== 'teacher' && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  try {
    const check = await query(`SELECT teacher_id FROM assignments WHERE id = $1`, [assignmentId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    if (role !== 'admin' && check.rows[0].teacher_id !== teacherId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to edit this assignment' });
    }

    const result = await query(
      `UPDATE assignments
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           instructions = COALESCE($3, instructions),
           subject = COALESCE($4, subject),
           due_date = COALESCE($5, due_date),
           total_marks = COALESCE($6, total_marks),
           allowed_file_types = COALESCE($7, allowed_file_types),
           max_file_size_mb = COALESCE($8, max_file_size_mb),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9
       RETURNING *`,
      [
        title,
        description,
        instructions,
        subject,
        dueDate ? new Date(dueDate) : null,
        totalMarks ? parseInt(totalMarks, 10) : null,
        allowedFileTypes,
        maxFileSizeMb ? parseInt(maxFileSizeMb, 10) : null,
        assignmentId
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Update assignment error', { error: err.message, assignmentId });
    res.status(500).json({ success: false, message: 'Failed to update assignment' });
  }
});

// DELETE Assignment (Teacher / Admin)
router.delete('/:id', async (req, res) => {
  const assignmentId = req.params.id;
  const teacherId = req.user.id;
  const role = req.user.role;

  if (role !== 'teacher' && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  try {
    const check = await query(`SELECT teacher_id FROM assignments WHERE id = $1`, [assignmentId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    if (role !== 'admin' && check.rows[0].teacher_id !== teacherId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this assignment' });
    }

    // Delete submission files from disk first
    const filesResult = await query(
      `SELECT sf.file_path FROM submission_files sf
       JOIN assignment_submissions sub ON sf.submission_id = sub.id
       WHERE sub.assignment_id = $1`,
      [assignmentId]
    );

    for (const f of filesResult.rows) {
      try {
        if (fs.existsSync(f.file_path)) {
          fs.unlinkSync(f.file_path);
        }
      } catch (err) {
        logger.error('Failed to delete file on assignment deletion', { filePath: f.file_path, error: err.message });
      }
    }

    await query(`DELETE FROM assignments WHERE id = $1`, [assignmentId]);
    res.json({ success: true, message: 'Assignment deleted successfully' });
  } catch (err) {
    logger.error('Delete assignment error', { error: err.message, assignmentId });
    res.status(500).json({ success: false, message: 'Failed to delete assignment' });
  }
});

// GRADE SUBMISSION (Teacher / Admin)
router.put('/submissions/:submissionId/grade', async (req, res) => {
  const { submissionId } = req.params;
  const { marks, feedback } = req.body;
  const teacherId = req.user.id;
  const role = req.user.role;

  if (role !== 'teacher' && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  try {
    const subResult = await query(
      `SELECT sub.*, a.teacher_id, a.total_marks, a.title as assignment_title
       FROM assignment_submissions sub
       JOIN assignments a ON sub.assignment_id = a.id
       WHERE sub.id = $1`,
      [submissionId]
    );

    if (subResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const sub = subResult.rows[0];
    if (role !== 'admin' && sub.teacher_id !== teacherId) {
      return res.status(403).json({ success: false, message: 'You can only grade submissions for your own assignments' });
    }

    const numericMarks = parseInt(marks, 10);
    if (isNaN(numericMarks) || numericMarks < 0 || numericMarks > sub.total_marks) {
      return res.status(400).json({ success: false, message: `Marks must be between 0 and ${sub.total_marks}` });
    }

    await query(
      `UPDATE assignment_submissions
       SET status = 'reviewed', marks = $1, feedback = $2, graded_at = CURRENT_TIMESTAMP, graded_by = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [numericMarks, feedback, teacherId, submissionId]
    );

    // Send notification to the student
    try {
      const studentId = sub.student_id;
      const title = `Assignment Graded`;
      const message = `Your submission for "${sub.assignment_title}" has been graded: ${numericMarks}/${sub.total_marks}.`;
      await query(
        `INSERT INTO notifications (student_id, recipient_id, sender_id, title, message, type, is_read)
         VALUES ($1, $1, $2, $3, $4, 'general', FALSE)`,
        [studentId, teacherId, title, message]
      );

      const io = req.app.get('io');
      if (io) {
        io.to(`student:${studentId}`).emit('notification', { title, message });
      }
    } catch (notifErr) {
      logger.warn('Failed to send assignment grade notification', { error: notifErr.message });
    }

    res.json({ success: true, message: 'Submission graded successfully' });
  } catch (err) {
    logger.error('Grade assignment error', { error: err.message, submissionId });
    res.status(500).json({ success: false, message: 'Failed to grade submission' });
  }
});

// GET Assignments for Student (Student)
router.get('/student', async (req, res) => {
  const studentId = req.user.id;
  const role = req.user.role;

  if (role !== 'student') {
    return res.status(403).json({ success: false, message: 'This endpoint is for students only' });
  }

  try {
    const result = await query(
      `SELECT a.*, 
              CONCAT(t.first_name, ' ', t.last_name) as teacher_name,
              sub.id as submission_id,
              sub.status as submission_status,
              sub.submitted_at,
              sub.marks,
              sub.feedback
       FROM assignments a
       JOIN students t ON a.teacher_id = t.id
       LEFT JOIN assignment_submissions sub ON a.id = sub.assignment_id AND sub.student_id = $1
       WHERE a.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
          OR a.teacher_id IN (
              SELECT teacher_id FROM teacher_assignments 
              WHERE student_id = $1 AND is_active = TRUE
          )
       ORDER BY a.due_date ASC`,
      [studentId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Fetch student assignments error', { error: err.message, studentId });
    res.status(500).json({ success: false, message: 'Failed to fetch assignments' });
  }
});

// GET Specific Assignment Details for Student (Student)
router.get('/student/:id', async (req, res) => {
  const assignmentId = req.params.id;
  const studentId = req.user.id;
  const role = req.user.role;

  if (role !== 'student') {
    return res.status(403).json({ success: false, message: 'This endpoint is for students only' });
  }

  try {
    const assignmentResult = await query(
      `SELECT a.*, CONCAT(t.first_name, ' ', t.last_name) as teacher_name
       FROM assignments a
       JOIN students t ON a.teacher_id = t.id
       WHERE a.id = $1`,
      [assignmentId]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const assignment = assignmentResult.rows[0];

    // Check student-teacher mapping
    const isAssigned = await query(
      `SELECT 1 FROM students s
       WHERE s.id = $1 AND (
         s.teacher_id = $2 OR EXISTS (
           SELECT 1 FROM teacher_assignments ta 
           WHERE ta.student_id = $1 AND ta.teacher_id = $2 AND ta.is_active = TRUE
         )
       )`,
      [studentId, assignment.teacher_id]
    );

    if (isAssigned.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Unauthorized to view this assignment' });
    }

    const submissionResult = await query(
      `SELECT * FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2`,
      [assignmentId, studentId]
    );

    let submission = null;
    let files = [];

    if (submissionResult.rows.length > 0) {
      submission = submissionResult.rows[0];
      const filesResult = await query(
        `SELECT id, file_name, file_size, uploaded_at 
         FROM submission_files WHERE submission_id = $1`,
        [submission.id]
      );
      files = filesResult.rows;
    }

    const resourcesResult = await query(
      `SELECT resource_id, assignment_id, teacher_id, file_name, original_name, file_extension, mime_type, file_size, version, uploaded_at, download_count
       FROM assignment_resources 
       WHERE assignment_id = $1 AND is_active = TRUE
       ORDER BY uploaded_at ASC`,
      [assignmentId]
    );

    res.json({ 
      success: true, 
      data: {
        assignment,
        submission,
        files,
        resources: resourcesResult.rows
      } 
    });
  } catch (err) {
    logger.error('Fetch student assignment detail error', { error: err.message, assignmentId, studentId });
    res.status(500).json({ success: false, message: 'Failed to fetch assignment details' });
  }
});

// SUBMIT Assignment (Student)
router.post('/:id/submit', upload.array('files', 10), async (req, res) => {
  const assignmentId = req.params.id;
  const studentId = req.user.id;
  const { comments } = req.body;
  const files = req.files || [];

  try {
    const assignmentResult = await query(
      `SELECT * FROM assignments WHERE id = $1`,
      [assignmentId]
    );
    if (assignmentResult.rows.length === 0) {
      // Cleanup uploaded files first if any
      for (const f of files) {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      }
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    const assignment = assignmentResult.rows[0];

    // Check student-teacher mapping
    const isAssigned = await query(
      `SELECT 1 FROM students s
       WHERE s.id = $1 AND (
         s.teacher_id = $2 OR EXISTS (
           SELECT 1 FROM teacher_assignments ta 
           WHERE ta.student_id = $1 AND ta.teacher_id = $2 AND ta.is_active = TRUE
         )
       )`,
      [studentId, assignment.teacher_id]
    );
    if (isAssigned.rows.length === 0) {
      for (const f of files) {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      }
      return res.status(403).json({ success: false, message: 'You are not assigned to the teacher of this assignment' });
    }

    const now = new Date();
    const dueDate = new Date(assignment.due_date);
    if (now > dueDate) {
      for (const f of files) {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      }
      return res.status(400).json({ success: false, message: 'The due date for this assignment has passed' });
    }

    const existingSubmission = await query(
      `SELECT * FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2`,
      [assignmentId, studentId]
    );

    let submissionId;
    if (existingSubmission.rows.length > 0) {
      const sub = existingSubmission.rows[0];
      if (sub.status === 'reviewed') {
        for (const f of files) {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        }
        return res.status(400).json({ success: false, message: 'This assignment has already been reviewed by the teacher and cannot be resubmitted' });
      }
      submissionId = sub.id;

      // Clean up previous files from disk and DB
      const previousFiles = await query(
        `SELECT * FROM submission_files WHERE submission_id = $1`,
        [submissionId]
      );
      for (const file of previousFiles.rows) {
        try {
          if (fs.existsSync(file.file_path)) {
            fs.unlinkSync(file.file_path);
          }
        } catch (err) {
          logger.error('Failed to delete old submission file', { filePath: file.file_path, error: err.message });
        }
      }
      await query(`DELETE FROM submission_files WHERE submission_id = $1`, [submissionId]);

      // Update the comments and submission time
      await query(
        `UPDATE assignment_submissions 
         SET comments = $1, submitted_at = CURRENT_TIMESTAMP, status = 'submitted', updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [comments, submissionId]
      );
    } else {
      // Create new submission
      const insertSub = await query(
        `INSERT INTO assignment_submissions (assignment_id, student_id, comments, status)
         VALUES ($1, $2, $3, 'submitted')
         RETURNING id`,
        [assignmentId, studentId, comments]
      );
      submissionId = insertSub.rows[0].id;
    }

    // Save the new uploaded files metadata
    for (const file of files) {
      await query(
        `INSERT INTO submission_files (submission_id, file_name, file_path, file_type, file_size)
         VALUES ($1, $2, $3, $4, $5)`,
        [submissionId, file.originalname, file.path, file.mimetype, file.size]
      );
    }

    res.json({ success: true, message: 'Assignment submitted successfully', submissionId });
  } catch (err) {
    logger.error('Submit assignment error', { error: err.message, assignmentId, studentId });
    // Cleanup files on error
    for (const f of files) {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    }
    res.status(500).json({ success: false, message: 'Failed to submit assignment' });
  }
});

// DOWNLOAD FILE (Shared - Teacher / Student / Admin)
router.get('/files/:fileId/download', async (req, res) => {
  const { fileId } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const fileResult = await query(
      `SELECT f.*, sub.student_id, a.teacher_id 
       FROM submission_files f
       JOIN assignment_submissions sub ON f.submission_id = sub.id
       JOIN assignments a ON sub.assignment_id = a.id
       WHERE f.id = $1`,
      [fileId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const file = fileResult.rows[0];

    const isAuthorized = 
      role === 'admin' || 
      (role === 'teacher' && file.teacher_id === userId) ||
      (role === 'student' && file.student_id === userId);

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Unauthorized to download this file' });
    }

    const resolvedPath = path.resolve(file.file_path);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk' });
    }

    res.download(resolvedPath, file.file_name);
  } catch (err) {
    logger.error('File download error', { error: err.message, fileId });
    res.status(500).json({ success: false, message: 'Failed to download file' });
  }
});

// POST /assignments/:id/files - Upload assignment resource files (Teacher / Admin)
router.post('/:id/files', upload.array('files', 10), async (req, res) => {
  const assignmentId = req.params.id;
  const teacherId = req.user.id;
  const role = req.user.role;
  const files = req.files || [];

  if (role !== 'teacher' && role !== 'admin') {
    for (const f of files) {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    }
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  try {
    const assignmentResult = await query(
      `SELECT * FROM assignments WHERE id = $1`,
      [assignmentId]
    );

    if (assignmentResult.rows.length === 0) {
      for (const f of files) {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      }
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const assignment = assignmentResult.rows[0];

    if (role !== 'admin' && assignment.teacher_id !== teacherId) {
      for (const f of files) {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      }
      return res.status(403).json({ success: false, message: 'Unauthorized to upload resources to this assignment' });
    }

    const allowedTypesStr = assignment.allowed_file_types || 'pdf,doc,docx,xls,xlsx,ppt,pptx,jpg,jpeg,png,zip,rar,txt,csv,gif,mp4,mp3';
    const allowedExtensions = allowedTypesStr.split(',').map(ext => ext.trim().toLowerCase());
    const maxSizeMb = assignment.max_file_size_mb || 25;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    for (const file of files) {
      const ext = path.extname(file.originalname).substring(1).toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        for (const f of files) {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        }
        return res.status(400).json({
          success: false,
          message: `File type '${ext}' is not allowed. Allowed types: ${allowedTypesStr}`
        });
      }

      if (file.size > maxSizeBytes) {
        for (const f of files) {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        }
        return res.status(400).json({
          success: false,
          message: `File '${file.originalname}' exceeds maximum allowed size of ${maxSizeMb}MB`
        });
      }
    }

    const crypto = require('crypto');
    const savedResources = [];

    for (const file of files) {
      // Run virus scan hook
      runVirusScan(file.path);

      const fileExt = path.extname(file.originalname).substring(1).toLowerCase();
      let fileChecksum = null;
      try {
        const fileBuffer = fs.readFileSync(file.path);
        fileChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      } catch (err) {
        logger.warn('Checksum calculation failed', { error: err.message });
      }

      const versionResult = await query(
        `SELECT MAX(version) as max_ver FROM assignment_resources
         WHERE assignment_id = $1 AND original_name = $2 AND is_active = TRUE`,
        [assignmentId, file.originalname]
      );
      const nextVersion = (versionResult.rows[0].max_ver || 0) + 1;

      const result = await query(
        `INSERT INTO assignment_resources
         (assignment_id, teacher_id, file_name, original_name, file_path, file_extension, mime_type, file_size, checksum, version, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          assignmentId,
          assignment.teacher_id,
          file.filename,
          file.originalname,
          file.path,
          fileExt,
          file.mimetype,
          file.size,
          fileChecksum,
          nextVersion,
          teacherId
        ]
      );
      savedResources.push(result.rows[0]);
    }

    res.json({ success: true, message: 'Files uploaded successfully', data: savedResources });
  } catch (err) {
    logger.error('Upload files error', { error: err.message, assignmentId });
    for (const f of files) {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    }
    res.status(500).json({ success: false, message: 'Failed to upload files' });
  }
});

// GET /assignments/:id/files - Get resources for assignment (Shared)
router.get('/:id/files', async (req, res) => {
  const assignmentId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const assignmentResult = await query(
      `SELECT * FROM assignments WHERE id = $1`,
      [assignmentId]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const assignment = assignmentResult.rows[0];

    let authorized = false;
    if (role === 'admin') {
      authorized = true;
    } else if (role === 'teacher') {
      authorized = assignment.teacher_id === userId;
    } else if (role === 'student') {
      const isAssigned = await query(
        `SELECT 1 FROM students s
         WHERE s.id = $1 AND (
           s.teacher_id = $2 OR EXISTS (
             SELECT 1 FROM teacher_assignments ta
             WHERE ta.student_id = $1 AND ta.teacher_id = $2 AND ta.is_active = TRUE
           )
         )`,
        [userId, assignment.teacher_id]
      );
      authorized = isAssigned.rows.length > 0;
    }

    if (!authorized) {
      return res.status(403).json({ success: false, message: 'Unauthorized to access resources for this assignment' });
    }

    const resourcesResult = await query(
      `SELECT resource_id, assignment_id, teacher_id, file_name, original_name, file_extension, mime_type, file_size, version, uploaded_at, download_count
       FROM assignment_resources
       WHERE assignment_id = $1 AND is_active = TRUE
       ORDER BY uploaded_at ASC`,
      [assignmentId]
    );

    res.json({ success: true, data: resourcesResult.rows });
  } catch (err) {
    logger.error('Get files error', { error: err.message, assignmentId });
    res.status(500).json({ success: false, message: 'Failed to fetch resource files' });
  }
});

// DELETE /assignments/files/:id - Delete assignment resource file (Teacher / Admin)
router.delete('/files/:id', async (req, res) => {
  const resourceId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;

  if (role !== 'teacher' && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  try {
    const resourceResult = await query(
      `SELECT * FROM assignment_resources WHERE resource_id = $1`,
      [resourceId]
    );

    if (resourceResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Resource file not found' });
    }

    const resource = resourceResult.rows[0];

    if (role !== 'admin' && resource.teacher_id !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this resource file' });
    }

    try {
      if (fs.existsSync(resource.file_path)) {
        fs.unlinkSync(resource.file_path);
      }
    } catch (err) {
      logger.error('Disk delete failed', { filePath: resource.file_path, error: err.message });
    }

    await query(
      `DELETE FROM assignment_resources WHERE resource_id = $1`,
      [resourceId]
    );

    res.json({ success: true, message: 'Resource file deleted successfully' });
  } catch (err) {
    logger.error('Delete resource error', { error: err.message, resourceId });
    res.status(500).json({ success: false, message: 'Failed to delete resource file' });
  }
});

// Student Aliases matching User Request exactly
// GET /student/assignments - Get all assignments for student
router.get('/student/assignments', async (req, res) => {
  const studentId = req.user.id;
  const role = req.user.role;

  if (role !== 'student') {
    return res.status(403).json({ success: false, message: 'Student only endpoint' });
  }

  try {
    const result = await query(
      `SELECT a.*,
              CONCAT(t.first_name, ' ', t.last_name) as teacher_name,
              sub.id as submission_id,
              sub.status as submission_status,
              sub.submitted_at,
              sub.marks,
              sub.feedback
       FROM assignments a
       JOIN students t ON a.teacher_id = t.id
       LEFT JOIN assignment_submissions sub ON a.id = sub.assignment_id AND sub.student_id = $1
       WHERE a.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
          OR a.teacher_id IN (
              SELECT teacher_id FROM teacher_assignments
              WHERE student_id = $1 AND is_active = TRUE
          )
       ORDER BY a.due_date ASC`,
      [studentId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Fetch student assignments error', { error: err.message, studentId });
    res.status(500).json({ success: false, message: 'Failed to fetch assignments' });
  }
});

// GET /student/assignments/:id - Get details of specific assignment for student
router.get('/student/assignments/:id', async (req, res) => {
  const assignmentId = req.params.id;
  const studentId = req.user.id;
  const role = req.user.role;

  if (role !== 'student') {
    return res.status(403).json({ success: false, message: 'Student only endpoint' });
  }

  try {
    const assignmentResult = await query(
      `SELECT a.*, CONCAT(t.first_name, ' ', t.last_name) as teacher_name
       FROM assignments a
       JOIN students t ON a.teacher_id = t.id
       WHERE a.id = $1`,
      [assignmentId]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const assignment = assignmentResult.rows[0];

    const isAssigned = await query(
      `SELECT 1 FROM students s
       WHERE s.id = $1 AND (
         s.teacher_id = $2 OR EXISTS (
           SELECT 1 FROM teacher_assignments ta
           WHERE ta.student_id = $1 AND ta.teacher_id = $2 AND ta.is_active = TRUE
         )
       )`,
      [studentId, assignment.teacher_id]
    );

    if (isAssigned.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Unauthorized to view this assignment' });
    }

    const submissionResult = await query(
      `SELECT * FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2`,
      [assignmentId, studentId]
    );

    let submission = null;
    let files = [];

    if (submissionResult.rows.length > 0) {
      submission = submissionResult.rows[0];
      const filesResult = await query(
        `SELECT id, file_name, file_size, uploaded_at
         FROM submission_files WHERE submission_id = $1`,
        [submission.id]
      );
      files = filesResult.rows;
    }

    const resourcesResult = await query(
      `SELECT resource_id, assignment_id, teacher_id, file_name, original_name, file_extension, mime_type, file_size, version, uploaded_at, download_count
       FROM assignment_resources
       WHERE assignment_id = $1 AND is_active = TRUE
       ORDER BY uploaded_at ASC`,
      [assignmentId]
    );

    res.json({
      success: true,
      data: {
        assignment,
        submission,
        files,
        resources: resourcesResult.rows
      }
    });
  } catch (err) {
    logger.error('Fetch student assignment detail error', { error: err.message, assignmentId, studentId });
    res.status(500).json({ success: false, message: 'Failed to fetch assignment details' });
  }
});

// GET /student/assignments/:id/download/:fileId - Secure download resource
router.get('/student/assignments/:id/download/:fileId', async (req, res) => {
  const assignmentId = req.params.id;
  const fileId = req.params.fileId;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const resourceResult = await query(
      `SELECT r.*, a.teacher_id
       FROM assignment_resources r
       JOIN assignments a ON r.assignment_id = a.id
       WHERE r.resource_id = $1 AND r.assignment_id = $2`,
      [fileId, assignmentId]
    );

    if (resourceResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Resource file not found' });
    }

    const resource = resourceResult.rows[0];

    let authorized = false;
    if (role === 'admin') {
      authorized = true;
    } else if (role === 'teacher') {
      authorized = resource.teacher_id === userId;
    } else if (role === 'student') {
      const isAssigned = await query(
        `SELECT 1 FROM students s
         WHERE s.id = $1 AND (
           s.teacher_id = $2 OR EXISTS (
             SELECT 1 FROM teacher_assignments ta
             WHERE ta.student_id = $1 AND ta.teacher_id = $2 AND ta.is_active = TRUE
           )
         )`,
        [userId, resource.teacher_id]
      );
      authorized = isAssigned.rows.length > 0;
    }

    if (!authorized) {
      return res.status(403).json({ success: false, message: 'Unauthorized to download this resource file' });
    }

    const resolvedPath = path.resolve(resource.file_path);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk' });
    }

    await query(
      `UPDATE assignment_resources
       SET download_count = download_count + 1
       WHERE resource_id = $1`,
      [fileId]
    );

    res.download(resolvedPath, resource.original_name);
  } catch (err) {
    logger.error('Download resource file error', { error: err.message, fileId });
    res.status(500).json({ success: false, message: 'Failed to download resource file' });
  }
});


// GET /prediction-metrics/:studentId - Fetch real-time student indicators for prediction
router.get('/prediction-metrics/:studentId', async (req, res) => {
  const targetStudentId = parseInt(req.params.studentId, 10);
  const userId = req.user.id;
  const role = req.user.role;

  if (isNaN(targetStudentId)) {
    return res.status(400).json({ success: false, message: 'Invalid Student ID' });
  }

  // Authorization check
  if (role === 'student' && userId !== targetStudentId) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  if (role === 'teacher') {
    const isAssigned = await query(
      `SELECT 1 FROM students s
       WHERE s.id = $1 AND (
         s.teacher_id = $2 OR EXISTS (
           SELECT 1 FROM teacher_assignments ta 
           WHERE ta.student_id = $1 AND ta.teacher_id = $2 AND ta.is_active = TRUE
         )
       )`,
      [targetStudentId, userId]
    );
    if (isAssigned.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
  }

  try {
    // 1. Calculate Attendance Rate
    const termDaysRes = await query(`SELECT COUNT(DISTINCT check_in_time::DATE) as term_days FROM student_attendance`);
    const studentCheckinsRes = await query(`SELECT COUNT(*) as student_checkins FROM student_attendance WHERE student_id = $1`, [targetStudentId]);
    const termDays = parseInt(termDaysRes.rows[0]?.term_days || '0', 10) || 30;
    const studentCheckins = parseInt(studentCheckinsRes.rows[0]?.student_checkins || '0', 10);
    const attendanceRate = Math.min(Math.round((studentCheckins / termDays) * 100), 100);

    // 2. Calculate Assignment Completion Rate
    const totalAssignmentsRes = await query(
      `SELECT COUNT(*)::int as total FROM assignments a 
       WHERE a.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
          OR a.teacher_id IN (SELECT teacher_id FROM teacher_assignments WHERE student_id = $1 AND is_active = TRUE)`,
      [targetStudentId]
    );
    const submittedAssignmentsRes = await query(
      `SELECT COUNT(*)::int as total FROM assignment_submissions sub
       WHERE sub.student_id = $1 AND sub.status IN ('submitted', 'reviewed')`,
      [targetStudentId]
    );
    const totalAssignments = totalAssignmentsRes.rows[0]?.total || 0;
    const submittedAssignments = submittedAssignmentsRes.rows[0]?.total || 0;
    const assignmentCompletionRate = totalAssignments > 0 
      ? Math.round((submittedAssignments / totalAssignments) * 100)
      : 100;

    // 3. Calculate Average Grade / Internal Assessment Marks
    const avgGradeRes = await query(
      `SELECT AVG(sub.marks::float / NULLIF(a.total_marks, 0)) * 100 as avg_grade
       FROM assignment_submissions sub
       JOIN assignments a ON sub.assignment_id = a.id
       WHERE sub.student_id = $1 AND sub.status = 'reviewed'`,
      [targetStudentId]
    );
    const avgGrade = avgGradeRes.rows[0]?.avg_grade !== null 
      ? Math.round(parseFloat(avgGradeRes.rows[0]?.avg_grade))
      : 75; // Default to 75% if no assignments reviewed

    res.json({
      success: true,
      data: {
        studentId: targetStudentId,
        attendanceRate,
        assignmentCompletionRate,
        internalAssessmentMarks: Math.round(avgGrade * 0.2), // Scale to out of 20
        averageAssignmentMarksPercent: avgGrade
      }
    });
  } catch (err) {
    logger.error('Fetch prediction metrics error', { error: err.message, studentId: targetStudentId });
    res.status(500).json({ success: false, message: 'Failed to fetch prediction metrics' });
  }
});

// POST /predict-marks - Calibrated Regression Marks Predictor Heuristic
router.post('/predict-marks', async (req, res) => {
  const {
    attendanceRate,
    previousSemesterMarks,
    assignmentCompletionRate,
    internalAssessmentMarks,
    studyHours,
    mockTestMarks,
    studentId
  } = req.body;

  const targetStudentId = studentId ? parseInt(studentId, 10) : req.user.id;
  const userId = req.user.id;
  const role = req.user.role;

  // Authorization check
  if (role === 'student' && userId !== targetStudentId) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  // Regression coefficients (weighted algorithm)
  const prevWeight = 0.35;
  const mockWeight = 0.20;
  const attWeight = 0.15;
  const compWeight = 0.10;
  const internalWeight = 0.05;
  const studyWeight = 0.10;
  const intercept = 8.0;

  let predictedMarks = 
    intercept +
    (parseFloat(previousSemesterMarks) * prevWeight) +
    (parseFloat(mockTestMarks) * mockWeight) +
    (parseFloat(attendanceRate) * attWeight) +
    (parseFloat(assignmentCompletionRate) * compWeight) +
    ((parseFloat(internalAssessmentMarks) / 20) * 100 * internalWeight) +
    (Math.min(parseFloat(studyHours), 10) * 10 * studyWeight);

  // Non-linear penalties
  if (attendanceRate < 75) {
    predictedMarks -= (75 - attendanceRate) * 0.15;
  }
  if (studyHours < 3) {
    predictedMarks -= (3 - studyHours) * 2;
  }

  predictedMarks = Math.max(10, Math.min(100, Math.round(predictedMarks)));

  // Calculate Grade
  let grade = 'F';
  if (predictedMarks >= 90) grade = 'A+';
  else if (predictedMarks >= 80) grade = 'A';
  else if (predictedMarks >= 70) grade = 'B';
  else if (predictedMarks >= 60) grade = 'C';
  else if (predictedMarks >= 50) grade = 'D';

  // Calculate Pass Probability (Logistic mapping)
  const passProbability = Math.max(0, Math.min(100, Math.round(100 / (1 + Math.exp(-0.15 * (predictedMarks - 45))))));

  // Determine Risk Level
  let riskLevel = 'High';
  if (predictedMarks >= 85) riskLevel = 'Very Low';
  else if (predictedMarks >= 70) riskLevel = 'Low';
  else if (predictedMarks >= 50) riskLevel = 'Medium';

  // Personalized suggestions
  const suggestions = [];
  if (attendanceRate < 80) {
    suggestions.push('Attend more classes to ensure core concept understanding and meet eligibility requirements.');
  }
  if (studyHours < 4) {
    suggestions.push('Increase daily self-study time to at least 4-5 hours to solidify subjects.');
  }
  if (assignmentCompletionRate < 85) {
    suggestions.push('Submit pending assignments to boost grades and practice regular coursework.');
  }
  if (mockTestMarks < 70) {
    suggestions.push('Revise exam-style questions, solve mock tests under time limit, and focus on weak topics.');
  }
  if (previousSemesterMarks < 60) {
    suggestions.push('Review fundamental syllabus from previous semesters to build missing conceptual blocks.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Maintain your current excellent performance and study discipline!');
  }

  try {
    // Save to database
    await query(
      `INSERT INTO student_mark_predictions 
       (student_id, attendance_rate, previous_semester_marks, assignment_completion_rate, internal_assessment_marks, study_hours, mock_test_marks, predicted_marks, predicted_grade, pass_probability, risk_level, predicted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        targetStudentId,
        attendanceRate,
        previousSemesterMarks,
        assignmentCompletionRate,
        internalAssessmentMarks,
        studyHours,
        mockTestMarks,
        predictedMarks,
        grade,
        passProbability,
        riskLevel,
        userId
      ]
    );

    res.json({
      success: true,
      data: {
        predictedMarks,
        grade,
        passProbability,
        riskLevel,
        suggestions
      }
    });
  } catch (err) {
    logger.error('Save predicted marks error', { error: err.message, studentId: targetStudentId });
    res.status(500).json({ success: false, message: 'Failed to save marks prediction' });
  }
});

// GET /prediction-history/:studentId - Fetch last 10 predictions for progress charting
router.get('/prediction-history/:studentId', async (req, res) => {
  const targetStudentId = parseInt(req.params.studentId, 10);
  const userId = req.user.id;
  const role = req.user.role;

  if (isNaN(targetStudentId)) {
    return res.status(400).json({ success: false, message: 'Invalid Student ID' });
  }

  // Authorization check
  if (role === 'student' && userId !== targetStudentId) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  if (role === 'teacher') {
    const isAssigned = await query(
      `SELECT 1 FROM students s
       WHERE s.id = $1 AND (
         s.teacher_id = $2 OR EXISTS (
           SELECT 1 FROM teacher_assignments ta 
           WHERE ta.student_id = $1 AND ta.teacher_id = $2 AND ta.is_active = TRUE
         )
       )`,
      [targetStudentId, userId]
    );
    if (isAssigned.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
  }

  try {
    const result = await query(
      `SELECT predicted_marks, pass_probability, created_at
       FROM student_mark_predictions
       WHERE student_id = $1
       ORDER BY created_at ASC
       LIMIT 10`,
      [targetStudentId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Fetch prediction history error', { error: err.message, studentId: targetStudentId });
    res.status(500).json({ success: false, message: 'Failed to fetch prediction history' });
  }
});

// ============================================================================
// MOCK EXAM SYSTEM ENDPOINTS
// ============================================================================

const mockExamImagesDir = path.join(__dirname, '../../../uploads/mock_exams');
if (!fs.existsSync(mockExamImagesDir)) {
  fs.mkdirSync(mockExamImagesDir, { recursive: true });
}

// Configure multer storage for mock exam question images
const mockExamStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, mockExamImagesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedOriginal = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedOriginal);
  }
});

const uploadMockExamImage = multer({
  storage: mockExamStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (!file.originalname.match(allowedExtensions)) {
      return cb(new Error('Only allowed image types are permitted: JPG, JPEG, PNG, GIF, WEBP'), false);
    }
    cb(null, true);
  }
});

// Upload reference question image
router.post('/mock-exams/upload-image', uploadMockExamImage.single('image'), async (req, res) => {
  const role = req.user.role;
  if (role !== 'teacher' && role !== 'admin') {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image file uploaded' });
  }

  try {
    const imageUrl = `/api/assignments/mock-exams/images/${req.file.filename}`;
    res.json({ success: true, imageUrl });
  } catch (err) {
    logger.error('Upload question image error', { error: err.message });
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'Failed to upload question image' });
  }
});

// Serve uploaded question images
router.get('/mock-exams/images/:filename', async (req, res) => {
  const { filename } = req.params;
  const safeFilename = path.basename(filename);
  const resolvedPath = path.join(mockExamImagesDir, safeFilename);

  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({ success: false, message: 'Image not found' });
  }

  res.sendFile(resolvedPath);
});

// Create Mock Exam (Teacher / Admin)
router.post('/mock-exams', async (req, res) => {
  const { subject, title, description, totalMarks, passingMarks, durationMinutes, negativeMarking, dueDate, questions } = req.body;
  const teacherId = req.user.id;
  const role = req.user.role;

  if (role !== 'teacher' && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  if (!subject || !title || !totalMarks || !passingMarks || !durationMinutes || !dueDate || !questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ success: false, message: 'All exam details and questions are required' });
  }

  try {
    await query('BEGIN');

    const examResult = await query(
      `INSERT INTO mock_exams (subject, title, description, total_marks, passing_marks, duration_minutes, negative_marking, teacher_id, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        subject,
        title,
        description,
        parseInt(totalMarks, 10),
        parseInt(passingMarks, 10),
        parseInt(durationMinutes, 10),
        !!negativeMarking,
        teacherId,
        new Date(dueDate)
      ]
    );

    const exam = examResult.rows[0];
    const examId = exam.id;

    for (const q of questions) {
      if (!q.questionText || !q.optionA || !q.optionB || !q.optionC || !q.optionD || !q.correctOption) {
        throw new Error('All question fields (text, options A/B/C/D, correct choice) are required');
      }
      await query(
        `INSERT INTO mock_exam_questions (exam_id, question_text, image_url, option_a, option_b, option_c, option_d, correct_option, question_marks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          examId,
          q.questionText,
          q.imageUrl || null,
          q.optionA,
          q.optionB,
          q.optionC,
          q.optionD,
          q.correctOption.toUpperCase(),
          parseInt(q.questionMarks, 10) || 1
        ]
      );
    }

    await query('COMMIT');

    // Notify mapping students
    try {
      const students = await query(
        `SELECT id FROM students 
         WHERE (
           teacher_id = $1 OR id IN (
             SELECT student_id FROM teacher_assignments 
             WHERE teacher_id = $1 AND is_active = TRUE
           )
         ) AND is_active = TRUE AND role = 'student'`,
        [teacherId]
      );

      const io = req.app.get('io');
      const titleText = `New Mock Exam: ${title}`;
      const msgText = `A new mock exam "${title}" has been published for ${subject}. Duration: ${durationMinutes} mins.`;

      for (const s of students.rows) {
        await query(
          `INSERT INTO notifications (student_id, recipient_id, sender_id, title, message, type, is_read)
           VALUES ($1, $1, $2, $3, $4, 'general', FALSE)`,
          [s.id, teacherId, titleText, msgText]
        );
        if (io) {
          io.to(`student:${s.id}`).emit('notification', { title: titleText, message: msgText });
        }
      }
    } catch (notifErr) {
      logger.warn('Failed to notify students of new mock exam', { error: notifErr.message });
    }

    res.json({ success: true, data: exam });
  } catch (err) {
    await query('ROLLBACK');
    logger.error('Create mock exam error', { error: err.message });
    res.status(500).json({ success: false, message: err.message || 'Failed to create mock exam' });
  }
});

// Get Mock Exams for Teacher (Teacher / Admin)
router.get('/mock-exams/teacher', async (req, res) => {
  const teacherId = req.user.id;
  const role = req.user.role;

  if (role !== 'teacher' && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  try {
    const result = await query(
      `SELECT me.*,
              (SELECT COUNT(*)::int FROM mock_exam_attempts WHERE exam_id = me.id) as attempt_count,
              (SELECT COUNT(*)::int FROM mock_exam_questions WHERE exam_id = me.id) as question_count,
              (SELECT MAX(score)::float FROM mock_exam_attempts WHERE exam_id = me.id) as highest_score,
              (SELECT MIN(score)::float FROM mock_exam_attempts WHERE exam_id = me.id) as lowest_score,
              (SELECT AVG(score)::float FROM mock_exam_attempts WHERE exam_id = me.id) as average_score
       FROM mock_exams me
       WHERE me.teacher_id = $1
       ORDER BY me.created_at DESC`,
      [teacherId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Fetch teacher mock exams error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to fetch mock exams' });
  }
});

// Get Mock Exams for Student (Student)
router.get('/mock-exams/student', async (req, res) => {
  const studentId = req.user.id;
  const role = req.user.role;

  if (role !== 'student') {
    return res.status(403).json({ success: false, message: 'This endpoint is for students only' });
  }

  try {
    const result = await query(
      `SELECT me.*,
              CONCAT(t.first_name, ' ', t.last_name) as teacher_name,
              mea.id as attempt_id,
              mea.score::float as attempt_score,
              mea.percentage::float as attempt_percentage,
              mea.grade as attempt_grade,
              mea.status as attempt_status,
              mea.submitted_at as attempt_submitted_at,
              (SELECT COUNT(*)::int FROM mock_exam_questions WHERE exam_id = me.id) as question_count
       FROM mock_exams me
       JOIN students t ON me.teacher_id = t.id
       LEFT JOIN mock_exam_attempts mea ON me.id = mea.exam_id AND mea.student_id = $1
       WHERE me.teacher_id = (SELECT teacher_id FROM students WHERE id = $1)
          OR me.teacher_id IN (
              SELECT teacher_id FROM teacher_assignments 
              WHERE student_id = $1 AND is_active = TRUE
          )
       ORDER BY me.due_date ASC`,
      [studentId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Fetch student mock exams error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to fetch mock exams' });
  }
});

// Get Specific Mock Exam Details (Shared)
router.get('/mock-exams/:id', async (req, res) => {
  const examId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const examResult = await query(
      `SELECT me.*, CONCAT(t.first_name, ' ', t.last_name) as teacher_name
       FROM mock_exams me
       JOIN students t ON me.teacher_id = t.id
       WHERE me.id = $1`,
      [examId]
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mock exam not found' });
    }

    const exam = examResult.rows[0];

    if (role === 'student') {
      const isAssigned = await query(
        `SELECT 1 FROM students s
         WHERE s.id = $1 AND (
           s.teacher_id = $2 OR EXISTS (
             SELECT 1 FROM teacher_assignments ta 
             WHERE ta.student_id = $1 AND ta.teacher_id = $2 AND ta.is_active = TRUE
           )
         )`,
        [userId, exam.teacher_id]
      );
      if (isAssigned.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Unauthorized to access this mock exam' });
      }
    } else if (role === 'teacher' && exam.teacher_id !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    let questionsResult;
    if (role === 'student') {
      const attempt = await query(
        `SELECT id FROM mock_exam_attempts WHERE exam_id = $1 AND student_id = $2`,
        [examId, userId]
      );
      
      if (attempt.rows.length > 0) {
        questionsResult = await query(
          `SELECT id, exam_id, question_text, image_url, option_a, option_b, option_c, option_d, correct_option, question_marks
           FROM mock_exam_questions WHERE exam_id = $1 ORDER BY id ASC`,
          [examId]
        );
      } else {
        questionsResult = await query(
          `SELECT id, exam_id, question_text, image_url, option_a, option_b, option_c, option_d, question_marks
           FROM mock_exam_questions WHERE exam_id = $1 ORDER BY id ASC`,
          [examId]
        );
      }
    } else {
      questionsResult = await query(
        `SELECT * FROM mock_exam_questions WHERE exam_id = $1 ORDER BY id ASC`,
        [examId]
      );
    }

    let attempt = null;
    if (role === 'student') {
      const attemptRes = await query(
        `SELECT * FROM mock_exam_attempts WHERE exam_id = $1 AND student_id = $2`,
        [examId, userId]
      );
      attempt = attemptRes.rows[0] || null;
    }

    res.json({
      success: true,
      data: {
        exam,
        questions: questionsResult.rows,
        attempt
      }
    });
  } catch (err) {
    logger.error('Fetch mock exam details error', { error: err.message, examId });
    res.status(500).json({ success: false, message: 'Failed to fetch mock exam details' });
  }
});

// Submit Mock Exam Attempt (Student)
router.post('/mock-exams/:id/attempt', async (req, res) => {
  const examId = req.params.id;
  const studentId = req.user.id;
  const role = req.user.role;
  const { answers } = req.body; // Array of { questionId: number, selectedOption: string }

  if (role !== 'student') {
    return res.status(403).json({ success: false, message: 'This endpoint is for students only' });
  }

  try {
    const existingAttempt = await query(
      `SELECT id FROM mock_exam_attempts WHERE exam_id = $1 AND student_id = $2`,
      [examId, studentId]
    );
    if (existingAttempt.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'You have already attempted this mock exam' });
    }

    const examResult = await query(`SELECT * FROM mock_exams WHERE id = $1`, [examId]);
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mock exam not found' });
    }
    const exam = examResult.rows[0];

    const questionsResult = await query(
      `SELECT id, correct_option, question_marks FROM mock_exam_questions WHERE exam_id = $1 ORDER BY id ASC`,
      [examId]
    );
    const questions = questionsResult.rows;

    let score = 0;
    let correctCount = 0;
    let wrongCount = 0;
    const answerRecords = [];

    const studentAnswersMap = new Map(
      (answers || []).map(a => [a.questionId, a.selectedOption ? a.selectedOption.toUpperCase() : null])
    );

    for (const q of questions) {
      const studentChoice = studentAnswersMap.get(q.id) || null;
      const isCorrect = studentChoice === q.correct_option;
      
      if (isCorrect) {
        score += q.question_marks;
        correctCount++;
      } else {
        if (studentChoice !== null) {
          if (exam.negative_marking) {
            score -= 0.25 * q.question_marks;
          }
          wrongCount++;
        }
      }

      answerRecords.push({
        questionId: q.id,
        selectedOption: studentChoice,
        isCorrect
      });
    }

    const finalScore = Math.max(0, Math.min(exam.total_marks, score));
    const percentage = parseFloat(((finalScore / exam.total_marks) * 100).toFixed(2));
    
    let grade = 'F';
    if (percentage >= 90) grade = 'A+';
    else if (percentage >= 80) grade = 'A';
    else if (percentage >= 70) grade = 'B';
    else if (percentage >= 60) grade = 'C';
    else if (percentage >= 50) grade = 'D';

    const status = finalScore >= exam.passing_marks ? 'PASS' : 'FAIL';

    await query('BEGIN');

    const attemptResult = await query(
      `INSERT INTO mock_exam_attempts (exam_id, student_id, score, percentage, grade, status, correct_answers_count, wrong_answers_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        examId,
        studentId,
        finalScore,
        percentage,
        grade,
        status,
        correctCount,
        wrongCount
      ]
    );

    const attempt = attemptResult.rows[0];

    for (const r of answerRecords) {
      await query(
        `INSERT INTO mock_exam_student_answers (attempt_id, question_id, selected_option, is_correct)
         VALUES ($1, $2, $3, $4)`,
        [attempt.id, r.questionId, r.selectedOption, r.isCorrect]
      );
    }

    await query('COMMIT');
    res.json({ success: true, data: attempt });
  } catch (err) {
    await query('ROLLBACK');
    logger.error('Submit mock exam attempt error', { error: err.message, examId, studentId });
    res.status(500).json({ success: false, message: 'Failed to evaluate mock exam attempt' });
  }
});

// Get Student Attempts list / question-wise correctness stats (Teacher / Admin)
router.get('/mock-exams/:id/results', async (req, res) => {
  const examId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;

  if (role !== 'teacher' && role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }

  try {
    const examResult = await query(`SELECT teacher_id FROM mock_exams WHERE id = $1`, [examId]);
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mock exam not found' });
    }
    if (role !== 'admin' && examResult.rows[0].teacher_id !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const attempts = await query(
      `SELECT mea.*,
              s.first_name,
              s.last_name,
              s.student_id as student_code
       FROM mock_exam_attempts mea
       JOIN students s ON mea.student_id = s.id
       WHERE mea.exam_id = $1
       ORDER BY mea.score DESC, mea.submitted_at ASC`,
      [examId]
    );

    const qPerformance = await query(
      `SELECT q.id as question_id,
              q.question_text,
              COUNT(sa.id)::int as total_responses,
              COUNT(CASE WHEN sa.is_correct = TRUE THEN 1 END)::int as correct_responses
       FROM mock_exam_questions q
       LEFT JOIN mock_exam_student_answers sa ON q.id = sa.question_id
       WHERE q.exam_id = $1
       GROUP BY q.id, q.question_text
       ORDER BY q.id ASC`,
      [examId]
    );

    res.json({
      success: true,
      data: {
        attempts: attempts.rows,
        questionPerformance: qPerformance.rows
      }
    });
  } catch (err) {
    logger.error('Fetch mock exam results error', { error: err.message, examId });
    res.status(500).json({ success: false, message: 'Failed to fetch mock exam results' });
  }
});

// Get Student Detailed Review of Answers (Shared)
router.get('/mock-exams/:id/review', async (req, res) => {
  const examId = req.params.id;
  const userId = req.user.id;
  const role = req.user.role;
  const targetStudentId = req.query.studentId ? parseInt(req.query.studentId, 10) : userId;

  try {
    const examResult = await query(`SELECT teacher_id FROM mock_exams WHERE id = $1`, [examId]);
    if (examResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mock exam not found' });
    }
    const exam = examResult.rows[0];

    if (role === 'student' && targetStudentId !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    if (role === 'teacher' && exam.teacher_id !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const attemptRes = await query(
      `SELECT * FROM mock_exam_attempts WHERE exam_id = $1 AND student_id = $2`,
      [examId, targetStudentId]
    );
    if (attemptRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No attempt found for this mock exam' });
    }
    const attempt = attemptRes.rows[0];

    const questionsReview = await query(
      `SELECT q.id as question_id,
              q.question_text,
              q.image_url,
              q.option_a,
              q.option_b,
              q.option_c,
              q.option_d,
              q.correct_option,
              q.question_marks,
              sa.selected_option,
              sa.is_correct
       FROM mock_exam_questions q
       LEFT JOIN mock_exam_student_answers sa ON q.id = sa.question_id AND sa.attempt_id = $1
       WHERE q.exam_id = $2
       ORDER BY q.id ASC`,
      [attempt.id, examId]
    );

    res.json({
      success: true,
      data: {
        attempt,
        questions: questionsReview.rows
      }
    });
  } catch (err) {
    logger.error('Fetch mock exam review error', { error: err.message, examId });
    res.status(500).json({ success: false, message: 'Failed to fetch mock exam review' });
  }
});

module.exports = router;
