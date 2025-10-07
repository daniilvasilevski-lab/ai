const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

// Mock analytics endpoints - будут реализованы позже
router.get('/dashboard', asyncHandler(async (req, res) => {
  res.json({ message: 'Analytics dashboard - coming soon', data: {} });
}));

router.get('/tasks', asyncHandler(async (req, res) => {
  res.json({ message: 'Task analytics - coming soon', data: {} });
}));

module.exports = router;
