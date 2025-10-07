const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { setUserOnline, setUserOffline, getOnlineUsers } = require('../utils/redis');

/**
 * Setup WebSocket server with Socket.IO
 */
const setupWebSocket = (io) => {
  // Middleware for authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
      socket.userId = decoded.id;
      socket.userEmail = decoded.email;
      socket.userName = decoded.name;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      logger.error('WebSocket authentication failed:', err);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    const userName = socket.userName;

    logger.info('User connected to WebSocket', {
      userId,
      userName,
      socketId: socket.id
    });

    try {
      // Mark user as online
      await setUserOnline(userId, socket.id);
      
      // Join user to their personal room
      socket.join(`user_${userId}`);
      
      // Notify other users that this user is online
      socket.broadcast.emit('user_online', {
        userId,
        userName
      });

      // Send current online users to the connected user
      const onlineUsers = await getOnlineUsers();
      socket.emit('online_users', onlineUsers);

    } catch (error) {
      logger.error('Error handling user connection:', error);
    }

    // Handle user joining chat rooms
    socket.on('join_chat', (chatId) => {
      socket.join(`chat_${chatId}`);
      logger.debug('User joined chat', { userId, chatId, socketId: socket.id });
    });

    // Handle user leaving chat rooms
    socket.on('leave_chat', (chatId) => {
      socket.leave(`chat_${chatId}`);
      logger.debug('User left chat', { userId, chatId, socketId: socket.id });
    });

    // Handle chat messages
    socket.on('send_message', (data) => {
      const { chatId, message, type = 'text' } = data;
      
      logger.info('Message sent via WebSocket', {
        userId,
        chatId,
        messageType: type,
        socketId: socket.id
      });

      // Broadcast message to all users in the chat
      io.to(`chat_${chatId}`).emit('message_received', {
        id: Date.now(), // In real app, this would be from database
        chatId,
        userId,
        userName,
        message,
        type,
        timestamp: new Date()
      });
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit('user_typing', {
        userId,
        userName,
        chatId
      });
    });

    socket.on('typing_stop', (data) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit('user_stopped_typing', {
        userId,
        userName,
        chatId
      });
    });

    // Handle voice commands
    socket.on('voice_command', (data) => {
      const { command, audioData } = data;
      
      logger.info('Voice command received', {
        userId,
        command: command?.substring(0, 100) + '...',
        hasAudio: !!audioData,
        socketId: socket.id
      });

      // Process voice command (in real app, this would call AI service)
      socket.emit('command_processed', {
        id: Date.now(),
        status: 'pending',
        message: 'Команда получена и обрабатывается...',
        requiresConfirmation: true
      });
    });

    // Handle action confirmations
    socket.on('confirm_action', (data) => {
      const { actionId, confirmed } = data;
      
      logger.info('Action confirmation received', {
        userId,
        actionId,
        confirmed,
        socketId: socket.id
      });

      if (confirmed) {
        // Execute the action (create task, schedule meeting, etc.)
        socket.emit('action_completed', {
          actionId,
          status: 'completed',
          message: 'Действие выполнено успешно!'
        });
      } else {
        socket.emit('action_cancelled', {
          actionId,
          status: 'cancelled',
          message: 'Действие отменено.'
        });
      }
    });

    // Handle task responses
    socket.on('task_response', (data) => {
      const { taskId, response, comment } = data;
      
      logger.info('Task response via WebSocket', {
        userId,
        taskId,
        response,
        hasComment: !!comment,
        socketId: socket.id
      });

      // In real app, this would update the database
      // For now, just emit to the task creator
      socket.broadcast.emit('task_response_received', {
        taskId,
        userId,
        userName,
        response,
        comment,
        timestamp: new Date()
      });
    });

    // Handle meeting responses
    socket.on('meeting_response', (data) => {
      const { meetingId, response, comment } = data;
      
      logger.info('Meeting response via WebSocket', {
        userId,
        meetingId,
        response,
        hasComment: !!comment,
        socketId: socket.id
      });

      // Broadcast to meeting organizer
      socket.broadcast.emit('meeting_response_received', {
        meetingId,
        userId,
        userName,
        response,
        comment,
        timestamp: new Date()
      });
    });

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      logger.info('User disconnected from WebSocket', {
        userId,
        userName,
        reason,
        socketId: socket.id
      });

      try {
        // Mark user as offline
        await setUserOffline(userId);
        
        // Notify other users that this user is offline
        socket.broadcast.emit('user_offline', {
          userId,
          userName
        });

      } catch (error) {
        logger.error('Error handling user disconnection:', error);
      }
    });

    // Handle custom events for notifications
    socket.on('mark_notification_read', (data) => {
      const { notificationId } = data;
      
      logger.debug('Notification marked as read', {
        userId,
        notificationId,
        socketId: socket.id
      });

      // In real app, update database
      socket.emit('notification_updated', {
        notificationId,
        status: 'read'
      });
    });

    // Handle error events
    socket.on('error', (error) => {
      logger.error('WebSocket error', {
        userId,
        error: error.message,
        socketId: socket.id
      });
    });
  });

  // Handle server-side events for broadcasting
  io.broadcastNotification = (userId, notification) => {
    io.to(`user_${userId}`).emit('new_notification', notification);
  };

  io.broadcastTaskUpdate = (taskCreatorId, taskData) => {
    io.to(`user_${taskCreatorId}`).emit('task_updated', taskData);
  };

  io.broadcastMeetingUpdate = (participantIds, meetingData) => {
    participantIds.forEach(userId => {
      io.to(`user_${userId}`).emit('meeting_updated', meetingData);
    });
  };

  logger.info('WebSocket server initialized successfully');
};

module.exports = {
  setupWebSocket
};
