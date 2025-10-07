const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

// Mock meeting endpoints - будут реализованы позже
router.get('/', asyncHandler(async (req, res) => {
  res.json({ message: 'Meeting endpoints - coming soon', meetings: [] });
}));

router.post('/', asyncHandler(async (req, res) => {
  res.json({ message: 'Create meeting - coming soon' });
}));

router.post('/:id/respond', asyncHandler(async (req, res) => {
  res.json({ message: 'Meeting response - coming soon' });
}));

module.exports = router;
