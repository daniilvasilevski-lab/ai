const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate JWT tokens
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      error: 'Access token required',
      code: 'MISSING_TOKEN'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn('Invalid token attempt', { 
        token: token.substring(0, 20) + '...', 
        error: err.message 
      });
      
      return res.status(403).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = user;
    next();
  });
};

/**
 * Middleware to check if user has required role
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      logger.warn('Unauthorized access attempt', {
        userId: req.user.id,
        userRole: userRole,
        requiredRoles: allowedRoles,
        endpoint: req.originalUrl
      });

      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: allowedRoles,
        current: userRole
      });
    }

    next();
  };
};

/**
 * Middleware to check if user can access resource
 */
const requireOwnership = (resourceType, getResourceUserId) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      // Admin can access everything
      if (userRole === 'admin') {
        return next();
      }

      // Get the user ID associated with the resource
      const resourceUserId = await getResourceUserId(req);

      if (!resourceUserId) {
        return res.status(404).json({
          error: `${resourceType} not found`,
          code: 'RESOURCE_NOT_FOUND'
        });
      }

      // Check if user owns the resource or is a manager
      if (resourceUserId !== userId && userRole !== 'manager') {
        logger.warn('Access denied to resource', {
          userId: userId,
          resourceType: resourceType,
          resourceUserId: resourceUserId,
          endpoint: req.originalUrl
        });

        return res.status(403).json({
          error: `Access denied to ${resourceType}`,
          code: 'ACCESS_DENIED'
        });
      }

      next();
    } catch (error) {
      logger.error('Error in ownership check:', error);
      res.status(500).json({
        error: 'Internal server error during authorization',
        code: 'AUTH_ERROR'
      });
    }
  };
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (!err) {
      req.user = user;
    }
    next();
  });
};

module.exports = {
  authenticateToken,
  requireRole,
  requireOwnership,
  optionalAuth
};
