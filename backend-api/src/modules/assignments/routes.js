const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { query } = require('../../config/database');
const { logger } = require('../../config/logger');

const router = express.Router();

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

    res.json({ 
      success: true, 
      data: {
        assignment,
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

    res.json({ 
      success: true, 
      data: {
        assignment,
        submission,
        files
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

module.exports = router;
