const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { setUserSession, deleteUserSession } = require('../utils/redis');

// Mock users database - в реальном приложении использовать Prisma
const users = [
  {
    id: 1,
    email: 'manager@company.com',
    password_hash: bcrypt.hashSync('password123', 10),
    name: 'Анна Менеджерова',
    role: 'manager',
    department: 'Management',
    avatar_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 2,
    email: 'user@company.com',
    password_hash: bcrypt.hashSync('password123', 10),
    name: 'Иван Петров',
    role: 'user',
    department: 'Development',
    avatar_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 3,
    email: 'admin@company.com',
    password_hash: bcrypt.hashSync('admin123', 10),
    name: 'Админ Администратор',
    role: 'admin',
    department: 'IT',
    avatar_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  }
];

let userIdCounter = 4;

/**
 * Generate JWT tokens
 */
const generateTokens = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    firstName: user.name.split(' ')[0], // Add firstName for AI integration
    lastName: user.name.split(' ')[1] || '', // Add lastName for AI integration
    name: user.name,
    role: user.role,
    department: user.department
  };

  const accessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET || 'default-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.REFRESH_TOKEN_SECRET || 'refresh-secret',
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

/**
 * POST /api/auth/register - Register new user
 */
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, name, department = 'General' } = req.body;

  // Validation
  if (!email || !password || !name) {
    return res.status(400).json({
      error: 'Email, password, and name are required',
      code: 'VALIDATION_ERROR'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters long',
      code: 'PASSWORD_TOO_SHORT'
    });
  }

  // Check if user already exists
  const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    return res.status(409).json({
      error: 'User with this email already exists',
      code: 'USER_EXISTS'
    });
  }

  // Hash password
  const password_hash = await bcrypt.hash(password, 10);

  // Create user
  const user = {
    id: userIdCounter++,
    email: email.toLowerCase(),
    password_hash,
    name,
    role: 'user',
    department,
    avatar_url: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  };

  users.push(user);

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user);

  // Store refresh token in Redis
  await setUserSession(user.id, { refreshToken }, 7 * 24 * 60 * 60); // 7 days

  logger.info('User registered', { 
    userId: user.id, 
    email: user.email, 
    name: user.name 
  });

  res.status(201).json({
    message: 'User registered successfully',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.name.split(' ')[0],
      lastName: user.name.split(' ')[1] || '',
      role: user.role,
      department: user.department,
      avatar_url: user.avatar_url
    },
    accessToken,
    refreshToken
  });
}));

/**
 * POST /api/auth/login - User login
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required',
      code: 'VALIDATION_ERROR'
    });
  }

  // Find user
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS'
    });
  }

  // Check if user is active
  if (!user.is_active) {
    return res.status(401).json({
      error: 'Account is deactivated',
      code: 'ACCOUNT_DEACTIVATED'
    });
  }

  // Verify password
  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS'
    });
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user);

  // Store refresh token in Redis
  await setUserSession(user.id, { refreshToken }, 7 * 24 * 60 * 60); // 7 days

  logger.info('User logged in', { 
    userId: user.id, 
    email: user.email 
  });

  res.json({
    message: 'Login successful',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.name.split(' ')[0],
      lastName: user.name.split(' ')[1] || '',
      role: user.role,
      department: user.department,
      avatar_url: user.avatar_url
    },
    accessToken,
    refreshToken
  });
}));

/**
 * POST /api/auth/refresh - Refresh access token
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      error: 'Refresh token required',
      code: 'MISSING_REFRESH_TOKEN'
    });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'refresh-secret');
    const userId = decoded.id;

    // Find user
    const user = users.find(u => u.id === userId);
    if (!user || !user.is_active) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    // Generate new access token
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    // Update refresh token in Redis
    await setUserSession(user.id, { refreshToken: newRefreshToken }, 7 * 24 * 60 * 60);

    res.json({
      accessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN'
    });
  }
}));

/**
 * POST /api/auth/logout - User logout
 */
router.post('/logout', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'refresh-secret');
      await deleteUserSession(decoded.id);
    } catch (error) {
      // Token might be invalid, but still proceed with logout
      logger.warn('Invalid refresh token during logout:', error.message);
    }
  }

  res.json({
    message: 'Logout successful'
  });
}));

/**
 * GET /api/auth/me - Get current user info
 */
router.get('/me', asyncHandler(async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Access token required',
      code: 'MISSING_TOKEN'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    const user = users.find(u => u.id === decoded.id);

    if (!user || !user.is_active) {
      return res.status(401).json({
        error: 'User not found or deactivated',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.name.split(' ')[0],
        lastName: user.name.split(' ')[1] || '',
        role: user.role,
        department: user.department,
        avatar_url: user.avatar_url,
        created_at: user.created_at
      }
    });
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }
}));

module.exports = router;
