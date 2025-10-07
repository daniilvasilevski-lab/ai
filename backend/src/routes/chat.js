const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

// Mock chat endpoints - будут реализованы позже
router.get('/', asyncHandler(async (req, res) => {
  res.json({ message: 'Chat endpoints - coming soon', chats: [] });
}));

router.post('/', asyncHandler(async (req, res) => {
  res.json({ message: 'Create chat - coming soon' });
}));

module.exports = router;
