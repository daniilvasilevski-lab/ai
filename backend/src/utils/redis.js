const redis = require('redis');
const logger = require('./logger');

let redisClient = null;

/**
 * Connect to Redis
 */
const connectRedis = async () => {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('🔴 Connected to Redis');
    });

    redisClient.on('ready', () => {
      logger.info('🔴 Redis is ready');
    });

    redisClient.on('end', () => {
      logger.info('🔴 Redis connection closed');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

/**
 * Get Redis client instance
 */
const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

/**
 * Cache data in Redis
 */
const setCache = async (key, value, expireInSeconds = 3600) => {
  try {
    const client = getRedisClient();
    await client.setEx(key, expireInSeconds, JSON.stringify(value));
    logger.debug(`Cache set for key: ${key}`);
  } catch (error) {
    logger.error('Error setting cache:', error);
    throw error;
  }
};

/**
 * Get cached data from Redis
 */
const getCache = async (key) => {
  try {
    const client = getRedisClient();
    const value = await client.get(key);
    
    if (value) {
      logger.debug(`Cache hit for key: ${key}`);
      return JSON.parse(value);
    }
    
    logger.debug(`Cache miss for key: ${key}`);
    return null;
  } catch (error) {
    logger.error('Error getting cache:', error);
    throw error;
  }
};

/**
 * Delete cached data from Redis
 */
const deleteCache = async (key) => {
  try {
    const client = getRedisClient();
    await client.del(key);
    logger.debug(`Cache deleted for key: ${key}`);
  } catch (error) {
    logger.error('Error deleting cache:', error);
    throw error;
  }
};

/**
 * Store user session
 */
const setUserSession = async (userId, sessionData, expireInSeconds = 86400) => {
  const key = `session:${userId}`;
  await setCache(key, sessionData, expireInSeconds);
};

/**
 * Get user session
 */
const getUserSession = async (userId) => {
  const key = `session:${userId}`;
  return await getCache(key);
};

/**
 * Delete user session
 */
const deleteUserSession = async (userId) => {
  const key = `session:${userId}`;
  await deleteCache(key);
};

/**
 * Store user in online users set
 */
const setUserOnline = async (userId, socketId) => {
  try {
    const client = getRedisClient();
    await client.hSet('online_users', userId.toString(), socketId);
    logger.debug(`User ${userId} is online with socket ${socketId}`);
  } catch (error) {
    logger.error('Error setting user online:', error);
  }
};

/**
 * Remove user from online users set
 */
const setUserOffline = async (userId) => {
  try {
    const client = getRedisClient();
    await client.hDel('online_users', userId.toString());
    logger.debug(`User ${userId} is offline`);
  } catch (error) {
    logger.error('Error setting user offline:', error);
  }
};

/**
 * Get all online users
 */
const getOnlineUsers = async () => {
  try {
    const client = getRedisClient();
    return await client.hGetAll('online_users');
  } catch (error) {
    logger.error('Error getting online users:', error);
    return {};
  }
};

/**
 * Check if user is online
 */
const isUserOnline = async (userId) => {
  try {
    const client = getRedisClient();
    const socketId = await client.hGet('online_users', userId.toString());
    return !!socketId;
  } catch (error) {
    logger.error('Error checking user online status:', error);
    return false;
  }
};

module.exports = {
  connectRedis,
  getRedisClient,
  setCache,
  getCache,
  deleteCache,
  setUserSession,
  getUserSession,
  deleteUserSession,
  setUserOnline,
  setUserOffline,
  getOnlineUsers,
  isUserOnline
};
