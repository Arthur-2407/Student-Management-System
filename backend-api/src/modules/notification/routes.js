const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const { logger } = require('../../config/logger');

function clampPagination(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

router.get('/', async (req, res) => {
  try {
    const studentId = req.user.id;
    const limit = clampPagination(req.query.limit, 20, 100);
    const offset = clampPagination(req.query.offset, 0, 10000);
    const { unread_only: unreadOnly } = req.query;

    let queryText = `
      SELECT id, type, title, message, payload, is_read, read_at, created_at
      FROM notifications
      WHERE student_id = $1
    `;
    const params = [studentId];

    if (unreadOnly === 'true') {
      queryText += ' AND is_read = FALSE';
    }

    queryText += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
    params.push(limit, offset);

    const result = await query(queryText, params);
    const unreadResult = await query(
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE student_id = $1 AND is_read = FALSE`,
      [studentId]
    );

    res.json({
      success: true,
      data: result.rows,
      unread_count: parseInt(unreadResult.rows[0].count, 10),
    });
  } catch (error) {
    logger.error('Notification fetch error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

router.patch('/read-all', async (req, res) => {
  try {
    const studentId = req.user.id;

    const result = await query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE student_id = $1 AND is_read = FALSE
       RETURNING id`,
      [studentId]
    );

    res.json({
      success: true,
      message: 'All notifications marked as read',
      updated: result.rowCount,
    });
  } catch (error) {
    logger.error('Mark all read error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const studentId = req.user.id;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid notification id' });
    }

    const result = await query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND student_id = $2
       RETURNING id`,
      [id, studentId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    logger.error('Mark read error', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
});

module.exports = router;
