const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

// Mock response endpoints - будут реализованы позже
router.get('/my', asyncHandler(async (req, res) => {
  res.json({ message: 'My responses - coming soon', responses: [] });
}));

router.post('/', asyncHandler(async (req, res) => {
  res.json({ message: 'Create response - coming soon' });
}));

module.exports = router;
