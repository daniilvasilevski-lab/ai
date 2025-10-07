const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Mock database - в реальном приложении это будет Prisma
const tasks = [];
const requestResponses = [];
const notifications = [];
let taskIdCounter = 1;
let responseIdCounter = 1;
let notificationIdCounter = 1;

/**
 * GET /api/tasks - Get tasks for the authenticated user
 */
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { status, assigned_to, created_by } = req.query;

  let userTasks = tasks.filter(task => 
    task.assigned_to === userId || task.created_by === userId
  );

  // Filter by status if provided
  if (status) {
    userTasks = userTasks.filter(task => task.status === status);
  }

  // Filter by assigned user if provided (for managers)
  if (assigned_to && req.user.role === 'manager') {
    userTasks = tasks.filter(task => task.assigned_to === parseInt(assigned_to));
  }

  // Filter by creator if provided
  if (created_by) {
    userTasks = userTasks.filter(task => task.created_by === parseInt(created_by));
  }

  logger.info('Tasks retrieved', { 
    userId, 
    taskCount: userTasks.length,
    filters: { status, assigned_to, created_by }
  });

  res.json({
    tasks: userTasks,
    total: userTasks.length
  });
}));

/**
 * GET /api/tasks/:id - Get specific task
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const taskId = parseInt(req.params.id);
  const userId = req.user.id;

  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    return res.status(404).json({
      error: 'Task not found',
      code: 'TASK_NOT_FOUND'
    });
  }

  // Check if user can access this task
  if (task.assigned_to !== userId && task.created_by !== userId && req.user.role !== 'manager') {
    return res.status(403).json({
      error: 'Access denied',
      code: 'ACCESS_DENIED'
    });
  }

  res.json({ task });
}));

/**
 * POST /api/tasks - Create new task
 */
router.post('/', asyncHandler(async (req, res) => {
  const { title, description, assigned_to, due_date, priority = 'medium' } = req.body;
  const createdBy = req.user.id;

  // Validation
  if (!title || !assigned_to) {
    return res.status(400).json({
      error: 'Title and assigned_to are required',
      code: 'VALIDATION_ERROR'
    });
  }

  // Create task
  const task = {
    id: taskIdCounter++,
    title,
    description,
    status: 'awaiting_assignee_confirmation',
    priority,
    assigned_to: parseInt(assigned_to),
    created_by: createdBy,
    due_date: due_date ? new Date(due_date) : null,
    accepted_at: null,
    declined_at: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  tasks.push(task);

  // Create notification for assignee
  const notification = {
    id: notificationIdCounter++,
    user_id: assigned_to,
    type: 'task_assigned',
    title: 'Новая задача',
    message: `Вам назначена задача: ${title}`,
    is_read: false,
    action_required: true,
    related_type: 'task',
    related_id: task.id,
    created_at: new Date()
  };

  notifications.push(notification);

  logger.info('Task created', { 
    taskId: task.id, 
    createdBy, 
    assignedTo: assigned_to,
    title 
  });

  // In real app, send WebSocket notification here
  // io.to(`user_${assigned_to}`).emit('new_notification', notification);

  res.status(201).json({
    message: 'Task created successfully',
    task,
    notification
  });
}));

/**
 * POST /api/tasks/:id/respond - Respond to task assignment
 */
router.post('/:id/respond', asyncHandler(async (req, res) => {
  const taskId = parseInt(req.params.id);
  const userId = req.user.id;
  const { response, comment } = req.body;

  // Validation
  if (!response || !['accepted', 'declined'].includes(response)) {
    return res.status(400).json({
      error: 'Response must be "accepted" or "declined"',
      code: 'INVALID_RESPONSE'
    });
  }

  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    return res.status(404).json({
      error: 'Task not found',
      code: 'TASK_NOT_FOUND'
    });
  }

  // Check if user is assigned to this task
  if (task.assigned_to !== userId) {
    return res.status(403).json({
      error: 'You are not assigned to this task',
      code: 'NOT_ASSIGNED'
    });
  }

  // Check if task is still awaiting confirmation
  if (task.status !== 'awaiting_assignee_confirmation') {
    return res.status(400).json({
      error: 'Task is no longer awaiting confirmation',
      code: 'INVALID_STATUS',
      currentStatus: task.status
    });
  }

  // Update task status
  if (response === 'accepted') {
    task.status = 'accepted';
    task.accepted_at = new Date();
  } else {
    task.status = 'declined';
    task.declined_at = new Date();
  }
  
  task.updated_at = new Date();

  // Create response record
  const responseRecord = {
    id: responseIdCounter++,
    request_type: 'task',
    request_id: taskId,
    user_id: userId,
    response_type: response,
    comment: comment || null,
    created_at: new Date()
  };

  requestResponses.push(responseRecord);

  // Create notification for task creator
  const creatorNotification = {
    id: notificationIdCounter++,
    user_id: task.created_by,
    type: 'task_response',
    title: `Ответ на задачу`,
    message: `${req.user.name || 'Пользователь'} ${response === 'accepted' ? 'принял' : 'отклонил'} задачу: ${task.title}${comment ? ` (${comment})` : ''}`,
    is_read: false,
    action_required: false,
    related_type: 'task',
    related_id: task.id,
    created_at: new Date()
  };

  notifications.push(creatorNotification);

  logger.info('Task response recorded', {
    taskId,
    userId,
    response,
    hasComment: !!comment
  });

  // In real app, send WebSocket notifications here
  // io.to(`user_${task.created_by}`).emit('task_response', {
  //   task,
  //   response: responseRecord,
  //   notification: creatorNotification
  // });

  res.json({
    message: `Task ${response} successfully`,
    task,
    response: responseRecord,
    creatorNotification
  });
}));

/**
 * GET /api/tasks/:id/responses - Get responses for a task
 */
router.get('/:id/responses', asyncHandler(async (req, res) => {
  const taskId = parseInt(req.params.id);
  const userId = req.user.id;

  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    return res.status(404).json({
      error: 'Task not found',
      code: 'TASK_NOT_FOUND'
    });
  }

  // Check if user can access task responses
  if (task.created_by !== userId && req.user.role !== 'manager') {
    return res.status(403).json({
      error: 'Access denied',
      code: 'ACCESS_DENIED'
    });
  }

  const responses = requestResponses.filter(r => 
    r.request_type === 'task' && r.request_id === taskId
  );

  res.json({
    task_id: taskId,
    responses,
    total: responses.length
  });
}));

/**
 * PUT /api/tasks/:id - Update task
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const taskId = parseInt(req.params.id);
  const userId = req.user.id;
  const updates = req.body;

  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    return res.status(404).json({
      error: 'Task not found',
      code: 'TASK_NOT_FOUND'
    });
  }

  // Check permissions
  const canUpdate = task.created_by === userId || 
                   task.assigned_to === userId || 
                   req.user.role === 'manager';

  if (!canUpdate) {
    return res.status(403).json({
      error: 'Access denied',
      code: 'ACCESS_DENIED'
    });
  }

  // Update allowed fields
  const allowedUpdates = ['title', 'description', 'status', 'priority', 'due_date'];
  const actualUpdates = {};

  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      actualUpdates[key] = updates[key];
    }
  }

  // Apply updates
  Object.assign(task, actualUpdates);
  task.updated_at = new Date();

  logger.info('Task updated', {
    taskId,
    updatedBy: userId,
    updates: Object.keys(actualUpdates)
  });

  res.json({
    message: 'Task updated successfully',
    task
  });
}));

/**
 * DELETE /api/tasks/:id - Delete task
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const taskId = parseInt(req.params.id);
  const userId = req.user.id;

  const taskIndex = tasks.findIndex(t => t.id === taskId);
  
  if (taskIndex === -1) {
    return res.status(404).json({
      error: 'Task not found',
      code: 'TASK_NOT_FOUND'
    });
  }

  const task = tasks[taskIndex];

  // Only creator or manager can delete
  if (task.created_by !== userId && req.user.role !== 'manager') {
    return res.status(403).json({
      error: 'Access denied',
      code: 'ACCESS_DENIED'
    });
  }

  tasks.splice(taskIndex, 1);

  logger.info('Task deleted', {
    taskId,
    deletedBy: userId
  });

  res.json({
    message: 'Task deleted successfully',
    taskId
  });
}));

module.exports = router;
