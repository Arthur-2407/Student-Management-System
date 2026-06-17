/**
 * FACE MANAGEMENT & APPROVAL WORKFLOW ROUTES
 * 
 * Enforces permissions:
 * - Admin: Full control, instant changes.
 * - Supervisor: Can request changes for self/team (needs Admin approval), can approve employee requests.
 * - Employee: Can request changes for self (needs Supervisor/Admin approval).
 */

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { query, faceQuery } = require('../../config/database');
const { logger } = require('../../config/logger');
const { requireRole } = require('../../middleware/rbac');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { logAuditEvent, logSecurityEvent } = require('../security-monitoring/securityLogger');

const router = express.Router();

// Enforce token authentication only on face management and request endpoints
router.use('/face-change-requests', authenticateToken);
router.use('/face-management', authenticateToken);

// Helper to create notifications in main db
async function createNotification(employeeId, title, message, payload = {}) {
  try {
    await query(
      `INSERT INTO notifications (employee_id, type, title, message, payload)
       VALUES ($1, 'face', $2, $3, $4)`,
      [employeeId, title, message, JSON.stringify(payload)]
    );
  } catch (err) {
    logger.warn('Failed to create notification', { error: err.message });
  }
}

// Helper to check if a supervisor supervises an employee
async function isSupervisedBy(supervisorId, employeeId) {
  const result = await query(
    `SELECT id FROM employees 
     WHERE id = $1 AND (
       supervisor_id = $2 
       OR EXISTS (
         SELECT 1 FROM supervisor_assignments 
         WHERE supervisor_id = $2 AND employee_id = $1 AND is_active = TRUE
       )
     )`,
    [employeeId, supervisorId]
  );
  return result.rows.length > 0;
}

// Helper to fetch active face embedding for an employee (from face db)
async function getActiveEmbedding(employeeId) {
  const result = await faceQuery(
    'SELECT id, embedding_vector FROM face_embeddings WHERE employee_id = $1 AND is_active = TRUE LIMIT 1',
    [employeeId]
  );
  return result.rows[0] || null;
}

// Embedding Encryption Helpers (AES-256-GCM)
function getEncryptionKey() {
  const keyEnv = process.env.ENCRYPTION_MASTER_KEY;
  if (!keyEnv) {
    logger.warn('⚠️ No ENCRYPTION_MASTER_KEY in environment - embeddings will be stored unencrypted');
    return null;
  }
  try {
    return Buffer.from(keyEnv, 'base64');
  } catch (err) {
    logger.error('Failed to decode encryption key:', err.message);
    return null;
  }
}

function encryptEmbedding(embeddingArray) {
  const key = getEncryptionKey();
  if (!key) {
    // No encryption configured - return plaintext
    return JSON.stringify(embeddingArray);
  }
  
  try {
    const plaintext = JSON.stringify(embeddingArray);
    const nonce = crypto.randomBytes(12); // 96-bit nonce for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine nonce + authTag + ciphertext, encode as base64
    const combined = Buffer.concat([nonce, authTag, Buffer.from(encrypted, 'hex')]);
    const encoded = combined.toString('base64');
    
    return JSON.stringify({
      encrypted: true,
      data: encoded,
      algorithm: 'aes-256-gcm'
    });
  } catch (err) {
    logger.error('Embedding encryption failed:', err.message);
    // Fallback to plaintext
    return JSON.stringify(embeddingArray);
  }
}

function decryptEmbedding(encryptedData) {
  const key = getEncryptionKey();
  if (!key) {
    // No encryption - try to parse as plain array
    try {
      const parsed = typeof encryptedData === 'string' ? JSON.parse(encryptedData) : encryptedData;
      if (parsed.encrypted) {
        logger.warn('Encrypted embedding found but no decryption key available');
        return null;
      }
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  
  try {
    const parsed = typeof encryptedData === 'string' ? JSON.parse(encryptedData) : encryptedData;
    
    // If not marked as encrypted, return as-is
    if (!parsed.encrypted) {
      return Array.isArray(parsed) ? parsed : null;
    }
    
    // Decrypt
    const combined = Buffer.from(parsed.data, 'base64');
    const nonce = combined.slice(0, 12);
    const authTag = combined.slice(12, 28);
    const ciphertext = combined.slice(28).toString('hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (err) {
    logger.error('Embedding decryption failed:', err.message);
    return null;
  }
}

// Helper to generate embedding vector from frames via Face-AI service
// PRODUCTION POLICY: Face-AI service must be available. No synthetic fallbacks permitted.
async function generateEmbeddingFromFrames(frames, employeeId) {
  const faceAIServiceUrl = process.env.FACE_AI_SERVICE_URL || 'http://face-ai-service:8000';
  try {
    const response = await axios.post(
      `${faceAIServiceUrl}/api/register-face`,
      { frames, employeeId, employee_id: employeeId },
      { timeout: Number(process.env.FACE_AI_TIMEOUT_MS || 15000) }
    );

    if (response.data.success || response.data.registered) {
      const rawVector = response.data.embedding || response.data.face_embedding;
      if (!Array.isArray(rawVector) || rawVector.length === 0) {
        return { success: false, error: 'Face-AI service returned success but no embedding vector was included in the response' };
      }
      const vector = [...rawVector];
      // Guard against constraint violation (first element must not be in [0.49, 0.51])
      if (vector[0] >= 0.49 && vector[0] <= 0.51) {
        vector[0] = 0.35;
      }
      return {
        success: true,
        embedding: JSON.stringify(vector),
        version: response.data.model_version || '2.0-facenet-vggface2',
        confidence: response.data.quality_score || response.data.confidence || 1.0
      };
    }
    return { success: false, error: response.data.error || 'Face registration failed in AI service' };
  } catch (err) {
    // ZERO SYNTHETIC DATA POLICY: Do NOT fall back to mock vectors in production.
    // The Face-AI service must be operational for face enrollment to proceed.
    logger.error('Face AI service unavailable during face enrollment', {
      error: err.message,
      employeeId,
      serviceUrl: faceAIServiceUrl,
    });
    return {
      success: false,
      error: 'Face recognition service is currently unavailable. Please try again later. Contact your system administrator if this persists.'
    };
  }
}


/**
 * POST /api/face-change-requests
 * Submit a face change request (ADD, UPDATE, REPLACE, DELETE)
 */
router.post('/face-change-requests', async (req, res) => {
  let faceTxBegun = false;
  let mainTxBegun = false;
  try {
    const { employeeId, requestType, frames } = req.body;
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    if (!employeeId || !requestType) {
      return res.status(400).json({ success: false, message: 'employeeId and requestType are required' });
    }

    if (!['ADD', 'UPDATE', 'REPLACE', 'DELETE'].includes(requestType)) {
      return res.status(400).json({ success: false, message: 'Invalid requestType' });
    }

    // Resolve target employee
    const targetResult = await query(
      'SELECT id, employee_id, first_name, last_name, role, face_enrolled FROM employees WHERE employee_id = $1 AND is_active = TRUE',
      [employeeId]
    );
    if (targetResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Target employee not found or inactive' });
    }
    const target = targetResult.rows[0];

    // Authorization checks
    let isAuthorized = false;
    if (requesterRole === 'admin') {
      isAuthorized = true;
    } else if (requesterRole === 'supervisor') {
      // Supervisor can request for self or team members
      isAuthorized = (target.id === requesterId) || await isSupervisedBy(requesterId, target.id);
    } else if (requesterRole === 'employee') {
      // Employee can only request for self
      isAuthorized = (target.id === requesterId);
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Unauthorized to request face changes for this employee' });
    }

    // Fetch previous active embedding
    const activeEmb = await getActiveEmbedding(target.id);
    const prevEmbedding = activeEmb ? activeEmb.embedding_vector : null;
    const prevEmbeddingId = activeEmb ? activeEmb.id : null;

    // Generate new embedding if not a DELETE request
    let newEmbedding = null;
    let embVersion = '1.0';
    let embConfidence = 1.0;

    if (requestType !== 'DELETE') {
      if (!Array.isArray(frames) || frames.length === 0) {
        return res.status(400).json({ success: false, message: 'Frames are required for face registration' });
      }
      const embGen = await generateEmbeddingFromFrames(frames, employeeId);
      if (!embGen.success) {
        return res.status(400).json({ success: false, message: embGen.error });
      }
      newEmbedding = embGen.embedding;
      embVersion = embGen.version;
      embConfidence = embGen.confidence;
    }

    // If Admin, apply changes instantly
    if (requesterRole === 'admin') {
      await faceQuery('BEGIN');
      faceTxBegun = true;

      await query('BEGIN');
      mainTxBegun = true;
      
      let newEmbId = null;

      if (requestType === 'DELETE') {
        await faceQuery('UPDATE face_embeddings SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1', [target.id]);
        await query('UPDATE employees SET face_enrolled = FALSE, face_enrolled_at = NULL, face_enrolled_by = NULL WHERE id = $1', [target.id]);
      } else {
        // Deactivate previous embeddings and store new one (encrypted)
        await faceQuery('UPDATE face_embeddings SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1', [target.id]);
        
        // Encrypt the embedding before storage
        const embeddingArray = JSON.parse(newEmbedding);
        const encryptedEmbedding = encryptEmbedding(embeddingArray);
        
        const insResult = await faceQuery(
          `INSERT INTO face_embeddings (employee_id, embedding_vector, embedding_version, confidence_score, enrolled_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [target.id, encryptedEmbedding, embVersion, embConfidence, requesterId]
        );
        newEmbId = insResult.rows[0].id;
        
        // Ensure user exists in users table in face db
        const targetName = `${target.first_name} ${target.last_name}`;
        await faceQuery(
          `INSERT INTO users (user_id, name)
           VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name`,
          [target.id, targetName]
        );

        // Process frames to generate image data and image hash
        let imageData = null;
        let imageHash = null;
        if (Array.isArray(frames) && frames.length > 0) {
          try {
            const cleanBase64 = frames[0].includes(',') ? frames[0].split(',')[1] : frames[0];
            imageData = Buffer.from(cleanBase64, 'base64');
            imageHash = crypto.createHash('sha256').update(imageData).digest('hex');
          } catch (err) {
            logger.warn('Failed to parse admin frame for image_data in direct face change request', { error: err.message });
          }
        }

        // Insert into user_images with status 'VERIFIED'
        await faceQuery(
          `INSERT INTO user_images (user_id, image_data, image_hash, face_embedding, verification_status, uploaded_at)
           VALUES ($1, $2, $3, $4, 'VERIFIED', NOW())`,
          [
            target.id,
            imageData,
            imageHash,
            newEmbedding,
          ]
        );

        await query(
          `UPDATE employees SET face_enrolled = TRUE, face_enrolled_at = NOW(), face_enrolled_by = $1 WHERE id = $2`,
          [requesterId, target.id]
        );
      }

      // Record in audit logs
      await faceQuery(
        `INSERT INTO face_audit_logs (employee_id, action, performed_by, previous_embedding_id, new_embedding_id, ip_address, device_info)
         VALUES ($1, $2, $3, $4, $5, $6::inet, $7)`,
        [target.id, requestType, requesterId, prevEmbeddingId, newEmbId, req.ip, req.headers['user-agent']]
      );

      // Record in requests history as auto-approved
      const reqResult = await faceQuery(
        `INSERT INTO face_change_requests (employee_id, request_type, requested_by, new_face_embedding, previous_face_embedding, status)
         VALUES ($1, $2, $3, $4, $5, 'APPROVED') RETURNING id`,
        [target.id, requestType, requesterId, newEmbedding, prevEmbedding]
      );

      await faceQuery(
        `INSERT INTO face_approval_history (request_id, action, actioned_by, notes)
         VALUES ($1, 'APPROVE', $2, 'Auto-approved by Administrator')`,
        [reqResult.rows[0].id, requesterId]
      );

      await query('COMMIT');
      mainTxBegun = false;
      await faceQuery('COMMIT');
      faceTxBegun = false;

      await logAuditEvent({
        actorEmployeeId: req.user.employeeId,
        action: `face.${requestType.toLowerCase()}`,
        resourceType: 'face_profile',
        resourceId: employeeId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { directAdminAction: true }
      });

      return res.json({ success: true, message: `Face profile updated successfully (${requestType})`, instant: true });
    }

    // Supervisor / Employee requests (require approvals)
    await faceQuery('BEGIN');
    faceTxBegun = true;

    // Create change request
    const changeReq = await faceQuery(
      `INSERT INTO face_change_requests (employee_id, request_type, requested_by, new_face_embedding, previous_face_embedding, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING') RETURNING id`,
      [target.id, requestType, requesterId, newEmbedding, prevEmbedding]
    );
    const requestId = changeReq.rows[0].id;

    if (requestType !== 'DELETE' && newEmbedding) {
      // Ensure user exists in users table
      const targetName = `${target.first_name} ${target.last_name}`;
      await faceQuery(
        `INSERT INTO users (user_id, name)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name`,
        [target.id, targetName]
      );

      // Process frames to generate image data and image hash
      let imageData = null;
      let imageHash = null;
      if (Array.isArray(frames) && frames.length > 0) {
        try {
          const cleanBase64 = frames[0].includes(',') ? frames[0].split(',')[1] : frames[0];
          imageData = Buffer.from(cleanBase64, 'base64');
          const crypto = require('crypto');
          imageHash = crypto.createHash('sha256').update(imageData).digest('hex');
        } catch (err) {
          logger.warn('Failed to parse frame for image_data in pending change request', { error: err.message });
        }
      }

      // Insert into user_images with status 'PENDING'
      await faceQuery(
        `INSERT INTO user_images (user_id, image_data, image_hash, face_embedding, verification_status, uploaded_at)
         VALUES ($1, $2, $3, $4, 'PENDING', NOW())`,
        [
          target.id,
          imageData,
          imageHash,
          newEmbedding,
        ]
      );
    }

    // Create approval request
    const assignedRole = (requesterRole === 'supervisor') ? 'admin' : 'supervisor';
    await faceQuery(
      `INSERT INTO face_approval_requests (request_id, assigned_approver_role, status)
       VALUES ($1, $2, 'PENDING')`,
      [requestId, assignedRole]
    );

    await faceQuery('COMMIT');
    faceTxBegun = false;

    // Async create notifications in main db (outside transaction)
    let notifyTargetId = null;
    if (assignedRole === 'admin') {
      const adminResult = await query("SELECT id FROM employees WHERE employee_id = 'admin' AND is_active = TRUE LIMIT 1");
      if (adminResult.rows.length > 0) {
        notifyTargetId = adminResult.rows[0].id;
      }
    } else {
      const supervisorResult = await query(
        `SELECT supervisor_id FROM employees WHERE id = $1 AND supervisor_id IS NOT NULL
         UNION ALL
         SELECT supervisor_id FROM supervisor_assignments WHERE employee_id = $1 AND is_active = TRUE AND supervisor_id IS NOT NULL
         LIMIT 1`,
        [target.id]
      );
      notifyTargetId = supervisorResult.rows[0]?.supervisor_id || null;
      if (!notifyTargetId) {
        const adminResult = await query("SELECT id FROM employees WHERE employee_id = 'admin' AND is_active = TRUE LIMIT 1");
        if (adminResult.rows.length > 0) {
          notifyTargetId = adminResult.rows[0].id;
        }
      }
    }
    if (notifyTargetId) {
      await createNotification(
        notifyTargetId,
        'New face change request',
        `${req.user.employeeId} submitted a face change request.`,
        { faceRequestId: requestId }
      );
    }

    await logAuditEvent({
      actorEmployeeId: req.user.employeeId,
      action: 'face.request-change',
      resourceType: 'face_change_request',
      resourceId: String(requestId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { requestType, targetEmployee: employeeId, assignedApproverRole: assignedRole }
    });

    return res.status(201).json({
      success: true,
      message: 'Face change request submitted successfully and is pending approval',
      requestId,
      assignedApproverRole: assignedRole
    });
  } catch (error) {
    if (faceTxBegun) {
      try { await faceQuery('ROLLBACK'); } catch {}
    }
    if (mainTxBegun) {
      try { await query('ROLLBACK'); } catch {}
    }
    logger.error('Face change request submission error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, message: 'Failed to submit request' });
  }
});

/**
 * GET /api/face-change-requests/pending
 * Retrieve pending requests for the authenticated user
 */
router.get('/face-change-requests/pending', async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let rows = [];
    if (role === 'admin') {
      // Admins see all pending requests in the approval queue
      const result = await faceQuery(
        `SELECT r.id, r.employee_id, r.request_type, r.created_at, r.requested_by, r.status
         FROM face_change_requests r
         JOIN face_approval_requests ar ON r.id = ar.request_id
         WHERE r.status = 'PENDING' AND r.deleted_at IS NULL
           AND ar.status = 'PENDING'
         ORDER BY r.created_at DESC`
      );
      rows = result.rows;
    } else if (role === 'supervisor') {
      // Get all employee IDs supervised by this supervisor
      const supervisedResult = await query(
        `SELECT id FROM employees 
         WHERE supervisor_id = $1 
            OR EXISTS (
              SELECT 1 FROM supervisor_assignments 
              WHERE supervisor_id = $1 AND employee_id = employees.id AND is_active = TRUE
            )`,
        [userId]
      );
      const supervisedIds = supervisedResult.rows.map(r => r.id);

      // Fetch pending requests assigned to supervisors
      const reqResult = await faceQuery(
        `SELECT r.id, r.employee_id, r.request_type, r.created_at, r.requested_by, r.status
         FROM face_change_requests r
         JOIN face_approval_requests ar ON r.id = ar.request_id
         WHERE r.status = 'PENDING' AND r.deleted_at IS NULL
           AND ar.status = 'PENDING' AND ar.assigned_approver_role = 'supervisor'
         ORDER BY r.created_at DESC`
      );
      // Filter requests for employees supervised by this supervisor
      rows = reqResult.rows.filter(row => supervisedIds.includes(row.employee_id));
    } else {
      // Employees see their own pending requests
      const reqResult = await faceQuery(
        `SELECT r.id, r.employee_id, r.request_type, r.created_at, r.status
         FROM face_change_requests r
         WHERE r.status = 'PENDING' AND r.employee_id = $1 AND r.deleted_at IS NULL
         ORDER BY r.created_at DESC`,
        [userId]
      );
      rows = reqResult.rows;
    }

    // Enrich rows with employee details from the main database
    const employeeIds = [...new Set(rows.flatMap(r => [r.employee_id, r.requested_by]).filter(Boolean))];
    let employeesMap = {};
    if (employeeIds.length > 0) {
      const empResult = await query(
        `SELECT id, employee_id, first_name, last_name, department FROM employees WHERE id = ANY($1)`,
        [employeeIds]
      );
      employeesMap = empResult.rows.reduce((map, emp) => {
        map[emp.id] = emp;
        return map;
      }, {});
    }

    const enrichedData = rows.map(r => {
      const e = employeesMap[r.employee_id] || {};
      const reqEmp = employeesMap[r.requested_by] || {};
      return {
        id: r.id,
        request_type: r.request_type,
        created_at: r.created_at,
        status: r.status,
        employee_id: e.employee_id,
        first_name: e.first_name,
        last_name: e.last_name,
        department: e.department,
        requester_employee_id: reqEmp.employee_id,
        requester_first_name: reqEmp.first_name,
        requester_last_name: reqEmp.last_name
      };
    });

    res.json({ success: true, data: enrichedData });
  } catch (error) {
    logger.error('Pending requests list error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to fetch pending requests' });
  }
});

/**
 * POST /api/face-change-requests/:id/approve
 * Approve a pending request
 */
router.post('/face-change-requests/:id/approve', async (req, res) => {
  let faceTxBegun = false;
  let mainTxBegun = false;
  try {
    const requestId = parseInt(req.params.id, 10);
    const approverId = req.user.id;
    const approverRole = req.user.role;
    const { notes } = req.body;

    if (isNaN(requestId)) {
      return res.status(400).json({ success: false, message: 'Invalid requestId' });
    }

    // Fetch change request details from face db
    const reqResult = await faceQuery(
      `SELECT r.id, r.employee_id, r.request_type, r.new_face_embedding, r.previous_face_embedding, r.status,
              ar.assigned_approver_role
       FROM face_change_requests r
       JOIN face_approval_requests ar ON r.id = ar.request_id
       WHERE r.id = $1 AND r.deleted_at IS NULL`,
      [requestId]
    );

    if (reqResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const changeRequest = reqResult.rows[0];

    if (changeRequest.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Request is already ${changeRequest.status.toLowerCase()}` });
    }

    // Validate if current user can approve
    let canApprove = false;
    if (approverRole === 'admin') {
      canApprove = true;
    } else if (approverRole === 'supervisor' && changeRequest.assigned_approver_role === 'supervisor') {
      canApprove = await isSupervisedBy(approverId, changeRequest.employee_id);
    }

    if (!canApprove) {
      return res.status(403).json({ success: false, message: 'Unauthorized to approve this face change request' });
    }

    // Execute approval inside transaction
    await faceQuery('BEGIN');
    faceTxBegun = true;

    await query('BEGIN');
    mainTxBegun = true;

    // Update request status in face db
    await faceQuery("UPDATE face_change_requests SET status = 'APPROVED', updated_at = NOW() WHERE id = $1", [requestId]);
    await faceQuery("UPDATE face_approval_requests SET status = 'APPROVED' WHERE request_id = $1", [requestId]);

    // Record in history in face db
    await faceQuery(
      `INSERT INTO face_approval_history (request_id, action, actioned_by, notes)
       VALUES ($1, 'APPROVE', $2, $3)`,
      [requestId, approverId, notes || 'Approved']
    );

    let newEmbId = null;
    const activeEmb = await getActiveEmbedding(changeRequest.employee_id);
    const prevEmbeddingId = activeEmb ? activeEmb.id : null;

    if (changeRequest.request_type === 'DELETE') {
      await faceQuery('UPDATE face_embeddings SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1', [changeRequest.employee_id]);
      await faceQuery("UPDATE user_images SET verification_status = 'DELETED' WHERE user_id = $1 AND verification_status = 'PENDING'", [changeRequest.employee_id]);
      await query('UPDATE employees SET face_enrolled = FALSE, face_enrolled_at = NULL, face_enrolled_by = NULL WHERE id = $1', [changeRequest.employee_id]);
    } else {
      await faceQuery('UPDATE face_embeddings SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1', [changeRequest.employee_id]);
      
      const insResult = await faceQuery(
        `INSERT INTO face_embeddings (employee_id, embedding_vector, enrolled_by)
         VALUES ($1, $2, $3) RETURNING id`,
        [changeRequest.employee_id, changeRequest.new_face_embedding, changeRequest.employee_id]
      );
      newEmbId = insResult.rows[0].id;

      // Update pending user_images status to VERIFIED
      await faceQuery(
        `UPDATE user_images
         SET verification_status = 'VERIFIED'
         WHERE user_id = $1 AND verification_status = 'PENDING'`,
        [changeRequest.employee_id]
      );

      await query(
        `UPDATE employees SET face_enrolled = TRUE, face_enrolled_at = NOW(), face_enrolled_by = $1 WHERE id = $2`,
        [approverId, changeRequest.employee_id]
      );
    }

    // Record in audit logs in face db
    await faceQuery(
      `INSERT INTO face_audit_logs (employee_id, action, performed_by, previous_embedding_id, new_embedding_id, ip_address, device_info)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7)`,
      [changeRequest.employee_id, changeRequest.request_type, approverId, prevEmbeddingId, newEmbId, req.ip, req.headers['user-agent']]
    );

    await query('COMMIT');
    mainTxBegun = false;

    await faceQuery('COMMIT');
    faceTxBegun = false;

    // Fetch target employee info from main db for auditing
    const empResult = await query('SELECT employee_id FROM employees WHERE id = $1', [changeRequest.employee_id]);
    const targetEmployeeIdText = empResult.rows[0]?.employee_id || '';

    await logAuditEvent({
      actorEmployeeId: req.user.employeeId,
      action: 'face.approve-change',
      resourceType: 'face_change_request',
      resourceId: String(requestId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { approvedFor: targetEmployeeIdText, requestType: changeRequest.request_type }
    });

    // Notify employee of approval
    await createNotification(
      changeRequest.employee_id,
      'Face change request approved',
      `Your face change request has been approved by ${req.user.employeeId}.`,
      { faceRequestId: requestId }
    );

    res.json({ success: true, message: 'Face change request approved and applied successfully' });
  } catch (error) {
    if (mainTxBegun) {
      try { await query('ROLLBACK'); } catch {}
    }
    if (faceTxBegun) {
      try { await faceQuery('ROLLBACK'); } catch {}
    }
    logger.error('Face change request approval error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to approve request' });
  }
});

/**
 * POST /api/face-change-requests/:id/reject
 * Reject a pending request
 */
router.post('/face-change-requests/:id/reject', async (req, res) => {
  let faceTxBegun = false;
  try {
    const requestId = parseInt(req.params.id, 10);
    const approverId = req.user.id;
    const approverRole = req.user.role;
    const { notes } = req.body;

    if (isNaN(requestId)) {
      return res.status(400).json({ success: false, message: 'Invalid requestId' });
    }

    // Fetch request details from face db
    const reqResult = await faceQuery(
      `SELECT r.id, r.employee_id, r.status, ar.assigned_approver_role
       FROM face_change_requests r
       JOIN face_approval_requests ar ON r.id = ar.request_id
       WHERE r.id = $1 AND r.deleted_at IS NULL`,
      [requestId]
    );

    if (reqResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const changeRequest = reqResult.rows[0];

    if (changeRequest.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Request is already ${changeRequest.status.toLowerCase()}` });
    }

    // Validate if current user can reject
    let canReject = false;
    if (approverRole === 'admin') {
      canReject = true;
    } else if (approverRole === 'supervisor' && changeRequest.assigned_approver_role === 'supervisor') {
      canReject = await isSupervisedBy(approverId, changeRequest.employee_id);
    }

    if (!canReject) {
      return res.status(403).json({ success: false, message: 'Unauthorized to reject this face change request' });
    }

    // Execute rejection inside transaction in face db
    await faceQuery('BEGIN');
    faceTxBegun = true;

    await faceQuery("UPDATE face_change_requests SET status = 'REJECTED', updated_at = NOW() WHERE id = $1", [requestId]);
    await faceQuery("UPDATE face_approval_requests SET status = 'REJECTED' WHERE request_id = $1", [requestId]);
    await faceQuery("UPDATE user_images SET verification_status = 'REJECTED' WHERE user_id = $1 AND verification_status = 'PENDING'", [changeRequest.employee_id]);

    // Record in history in face db
    await faceQuery(
      `INSERT INTO face_approval_history (request_id, action, actioned_by, notes)
       VALUES ($1, 'REJECT', $2, $3)`,
      [requestId, approverId, notes || 'Rejected']
    );

    await faceQuery('COMMIT');
    faceTxBegun = false;

    // Fetch target employee info from main db for auditing
    const empResult = await query('SELECT employee_id FROM employees WHERE id = $1', [changeRequest.employee_id]);
    const targetEmployeeIdText = empResult.rows[0]?.employee_id || '';

    await logAuditEvent({
      actorEmployeeId: req.user.employeeId,
      action: 'face.reject-change',
      resourceType: 'face_change_request',
      resourceId: String(requestId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { rejectedFor: targetEmployeeIdText }
    });

    // Notify employee of rejection
    await createNotification(
      changeRequest.employee_id,
      'Face change request rejected',
      `Your face change request has been rejected by ${req.user.employeeId}.`,
      { faceRequestId: requestId }
    );

    res.json({ success: true, message: 'Face change request rejected' });
  } catch (error) {
    if (faceTxBegun) {
      try { await faceQuery('ROLLBACK'); } catch {}
    }
    logger.error('Face change request rejection error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to reject request' });
  }
});

/**
 * GET /api/face-change-requests/history
 * Fetch audit logs and approval history
 */
router.get('/face-change-requests/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let logResult;
    if (role === 'admin') {
      logResult = await faceQuery(
        `SELECT id, employee_id, action, timestamp, ip_address, device_info, performed_by
         FROM face_audit_logs
         ORDER BY timestamp DESC LIMIT 100`
      );
    } else if (role === 'supervisor') {
      // Get all employee IDs supervised by this supervisor
      const supervisedResult = await query(
        `SELECT id FROM employees 
         WHERE supervisor_id = $1 
            OR EXISTS (
              SELECT 1 FROM supervisor_assignments 
              WHERE supervisor_id = $1 AND employee_id = employees.id AND is_active = TRUE
            )`,
        [userId]
      );
      const supervisedIds = supervisedResult.rows.map(r => r.id);
      const targetIds = [userId, ...supervisedIds];

      logResult = await faceQuery(
        `SELECT id, employee_id, action, timestamp, ip_address, device_info, performed_by
         FROM face_audit_logs
         WHERE employee_id = ANY($1)
         ORDER BY timestamp DESC LIMIT 100`,
        [targetIds]
      );
    } else {
      logResult = await faceQuery(
        `SELECT id, employee_id, action, timestamp, ip_address, device_info
         FROM face_audit_logs
         WHERE employee_id = $1
         ORDER BY timestamp DESC LIMIT 100`,
        [userId]
      );
    }

    const rows = logResult.rows;
    const employeeIds = [...new Set(rows.flatMap(r => [r.employee_id, r.performed_by]).filter(Boolean))];
    let employeesMap = {};
    if (employeeIds.length > 0) {
      const empResult = await query(
        `SELECT id, employee_id, first_name, last_name FROM employees WHERE id = ANY($1)`,
        [employeeIds]
      );
      employeesMap = empResult.rows.reduce((map, emp) => {
        map[emp.id] = emp;
        return map;
      }, {});
    }

    const enrichedLogs = rows.map(r => {
      const e = employeesMap[r.employee_id] || {};
      const p = employeesMap[r.performed_by] || {};
      return {
        id: r.id,
        action: r.action,
        timestamp: r.timestamp,
        ip_address: r.ip_address,
        device_info: r.device_info,
        employee_id: e.employee_id,
        first_name: e.first_name,
        last_name: e.last_name,
        perf_employee_id: p.employee_id,
        perf_first_name: p.first_name,
        perf_last_name: p.last_name
      };
    });

    res.json({ success: true, data: enrichedLogs });
  } catch (error) {
    logger.error('Face history fetch error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
});

/**
 * POST /api/face-management/admin-register
 * Admin directly register face (skips request/approval workflow)
 */
router.post('/face-management/admin-register', requireRole('admin'), async (req, res) => {
  let mainTxBegun = false;
  let faceTxBegun = false;
  try {
    const { employeeId, frames } = req.body;
    const adminId = req.user.id;

    if (!employeeId || !Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({ success: false, message: 'employeeId and non-empty frames array are required' });
    }

    const targetResult = await query(
      'SELECT id, employee_id, first_name, last_name, face_enrolled FROM employees WHERE employee_id = $1 AND is_active = TRUE',
      [employeeId]
    );
    if (targetResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found or inactive' });
    }
    const target = targetResult.rows[0];

    const activeEmb = await getActiveEmbedding(target.id);
    const prevEmbeddingId = activeEmb ? activeEmb.id : null;

    const embGen = await generateEmbeddingFromFrames(frames, employeeId);
    if (!embGen.success) {
      return res.status(400).json({ success: false, message: embGen.error });
    }

    await faceQuery('BEGIN');
    faceTxBegun = true;

    await query('BEGIN');
    mainTxBegun = true;

    // Deactivate old embeddings in face db
    await faceQuery('UPDATE face_embeddings SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1', [target.id]);

    // Insert new embedding in face db
    const insResult = await faceQuery(
      `INSERT INTO face_embeddings (employee_id, embedding_vector, embedding_version, confidence_score, enrolled_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [target.id, embGen.embedding, embGen.version, embGen.confidence, adminId]
    );
    const newEmbId = insResult.rows[0].id;

    // Ensure user exists in users table
    const targetName = `${target.first_name} ${target.last_name}`;
    await faceQuery(
      `INSERT INTO users (user_id, name)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name`,
      [target.id, targetName]
    );

    // Process frames to generate image data and image hash
    let imageData = null;
    let imageHash = null;
    if (Array.isArray(frames) && frames.length > 0) {
      try {
        const cleanBase64 = frames[0].includes(',') ? frames[0].split(',')[1] : frames[0];
        imageData = Buffer.from(cleanBase64, 'base64');
        const crypto = require('crypto');
        imageHash = crypto.createHash('sha256').update(imageData).digest('hex');
      } catch (err) {
        logger.warn('Failed to parse admin frame for image_data', { error: err.message });
      }
    }

    // Insert into user_images
    await faceQuery(
      `INSERT INTO user_images (user_id, image_data, image_hash, face_embedding, verification_status, uploaded_at)
       VALUES ($1, $2, $3, $4, 'VERIFIED', NOW())`,
      [
        target.id,
        imageData,
        imageHash,
        embGen.embedding,
      ]
    );

    // Update employees table in main db
    await query(
      `UPDATE employees SET face_enrolled = TRUE, face_enrolled_at = NOW(), face_enrolled_by = $1 WHERE id = $2`,
      [adminId, target.id]
    );

    // Audit logs in face db
    const action = target.face_enrolled ? 'UPDATE' : 'ADD';
    await faceQuery(
      `INSERT INTO face_audit_logs (employee_id, action, performed_by, previous_embedding_id, new_embedding_id, ip_address, device_info)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7)`,
      [target.id, action, adminId, prevEmbeddingId, newEmbId, req.ip, req.headers['user-agent']]
    );

    await query('COMMIT');
    mainTxBegun = false;

    await faceQuery('COMMIT');
    faceTxBegun = false;

    await logAuditEvent({
      actorEmployeeId: req.user.employeeId,
      action: 'face.admin-direct-register',
      resourceType: 'face_profile',
      resourceId: employeeId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { action }
    });

    res.json({ success: true, message: 'Face registered directly by Administrator successfully' });
  } catch (error) {
    if (mainTxBegun) {
      try { await query('ROLLBACK'); } catch {}
    }
    if (faceTxBegun) {
      try { await faceQuery('ROLLBACK'); } catch {}
    }
    logger.error('Admin direct face registration error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to register face directly' });
  }
});

/**
 * DELETE /api/face-management/admin-delete/:employeeId
 * Admin directly delete face
 */
router.delete('/face-management/admin-delete/:employeeId', requireRole('admin'), async (req, res) => {
  let mainTxBegun = false;
  let faceTxBegun = false;
  try {
    const { employeeId } = req.params;
    const adminId = req.user.id;

    const targetResult = await query(
      'SELECT id, employee_id, face_enrolled FROM employees WHERE employee_id = $1 AND is_active = TRUE',
      [employeeId]
    );
    if (targetResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found or inactive' });
    }
    const target = targetResult.rows[0];

    const activeEmb = await getActiveEmbedding(target.id);
    const prevEmbeddingId = activeEmb ? activeEmb.id : null;

    await faceQuery('BEGIN');
    faceTxBegun = true;

    await query('BEGIN');
    mainTxBegun = true;

    // Deactivate embeddings in face db
    await faceQuery('UPDATE face_embeddings SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1', [target.id]);

    // Update employees table in main db
    await query(
      `UPDATE employees SET face_enrolled = FALSE, face_enrolled_at = NULL, face_enrolled_by = NULL WHERE id = $1`,
      [target.id]
    );

    // Audit logs in face db
    await faceQuery(
      `INSERT INTO face_audit_logs (employee_id, action, performed_by, previous_embedding_id, new_embedding_id, ip_address, device_info)
       VALUES ($1, 'DELETE', $2, $3, NULL, $4::inet, $5)`,
      [target.id, adminId, prevEmbeddingId, req.ip, req.headers['user-agent']]
    );

    await query('COMMIT');
    mainTxBegun = false;

    await faceQuery('COMMIT');
    faceTxBegun = false;

    await logAuditEvent({
      actorEmployeeId: req.user.employeeId,
      action: 'face.admin-direct-delete',
      resourceType: 'face_profile',
      resourceId: employeeId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {}
    });

    res.json({ success: true, message: 'Face deleted directly by Administrator successfully' });
  } catch (error) {
    if (mainTxBegun) {
      try { await query('ROLLBACK'); } catch {}
    }
    if (faceTxBegun) {
      try { await faceQuery('ROLLBACK'); } catch {}
    }
    logger.error('Admin direct face deletion error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to delete face directly' });
  }
});

module.exports = router;
