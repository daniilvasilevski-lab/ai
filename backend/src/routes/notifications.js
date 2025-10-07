const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

// Mock notification endpoints - будут реализованы позже
router.get('/', asyncHandler(async (req, res) => {
  res.json({ message: 'Notification endpoints - coming soon', notifications: [] });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  res.json({ message: 'Mark notification as read - coming soon' });
}));

module.exports = router;
