/**
 * AI Routes
 * API endpoints для ИИ функций
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const aiProvider = require('../services/ai/aiProvider');
const voiceService = require('../services/ai/voiceService');
const taskGeneratorService = require('../services/ai/taskGeneratorService');
const aiNotificationService = require('../services/ai/aiNotificationService');
const aiIntegrationService = require('../services/ai/aiIntegrationService');
const calendarService = require('../services/calendar/calendarService');
const webrtcService = require('../services/webrtc/webrtcService');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Настройка multer для загрузки аудио файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/temp'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `voice-${uniqueSuffix}.${file.originalname.split('.').pop()}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/ogg', 'audio/webm'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format'));
    }
  }
});

// Проверяем авторизацию для всех AI endpoints
// router.use(authenticateToken); // Moved to index.js middleware

/**
 * POST /api/ai/chat
 * Обработка текстовых сообщений через ИИ
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    const user = req.user;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    console.log(`💬 AI Chat request from ${user.firstName} ${user.lastName}: "${message}"`);

    const response = await aiProvider.processCommand(message, {
      user,
      ...context
    });

    res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({
      success: false,
      message: 'AI processing failed',
      error: error.message
    });
  }
});

/**
 * POST /api/ai/voice
 * Обработка голосовых команд
 */
router.post('/voice', upload.single('audio'), async (req, res) => {
  try {
    const user = req.user;
    const audioFile = req.file;
    const context = JSON.parse(req.body.context || '{}');

    if (!audioFile) {
      return res.status(400).json({
        success: false,
        message: 'Audio file is required'
      });
    }

    console.log(`🎤 Voice command from ${user.firstName} ${user.lastName}`);

    const result = await voiceService.processVoiceCommand(
      audioFile, 
      user.id, 
      { user, ...context }
    );

    if (result.success) {
      // Отправляем WebSocket уведомление о голосовой команде
      req.io?.emit('voice:processed', {
        userId: user.id,
        transcript: result.transcript,
        response: result.aiResponse
      });
    }

    res.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Voice processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Voice processing failed',
      error: error.message
    });
  }
});

/**
 * POST /api/ai/execute-function
 * Выполнение ИИ функций (создание задач, встреч и т.д.)
 */
router.post('/execute-function', async (req, res) => {
  try {
    const { functionName, arguments: args, confirmationId } = req.body;
    const user = req.user;

    if (!functionName || !args) {
      return res.status(400).json({
        success: false,
        message: 'Function name and arguments are required'
      });
    }

    console.log(`⚡ Executing AI function: ${functionName} for ${user.firstName} ${user.lastName}`);

    let result;

    switch (functionName) {
      case 'create_task':
        result = await executeCreateTask(args, user, req.io);
        break;
      case 'schedule_meeting':
        result = await executeScheduleMeeting(args, user, req.io);
        break;
      case 'analyze_call':
        result = await executeAnalyzeCall(args, user);
        break;
      default:
        throw new Error(`Unknown function: ${functionName}`);
    }

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Function execution error:', error);
    res.status(500).json({
      success: false,
      message: 'Function execution failed',
      error: error.message
    });
  }
});

/**
 * GET /api/ai/voice-history
 * Получение истории голосовых команд
 */
router.get('/voice-history', async (req, res) => {
  try {
    const user = req.user;
    const limit = parseInt(req.query.limit) || 20;

    const history = await voiceService.getVoiceCommandHistory(user.id, limit);

    res.json({
      success: history.success,
      data: history.commands || [],
      total: history.commands?.length || 0
    });

  } catch (error) {
    console.error('Voice history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get voice history',
      error: error.message
    });
  }
});

/**
 * POST /api/ai/switch-provider
 * Переключение между локальным и облачным ИИ
 */
router.post('/switch-provider', async (req, res) => {
  try {
    const { provider } = req.body;
    const user = req.user;

    // Только администраторы могут переключать провайдера
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can switch AI providers'
      });
    }

    const result = aiProvider.switchProvider(provider);

    if (result.success) {
      console.log(`🔄 AI provider switched to ${provider} by ${user.firstName} ${user.lastName}`);
      
      // Уведомляем всех пользователей о смене провайдера
      req.io?.emit('ai:provider-changed', {
        provider,
        changedBy: user.firstName + ' ' + user.lastName,
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);

  } catch (error) {
    console.error('Provider switch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to switch provider',
      error: error.message
    });
  }
});

/**
 * GET /api/ai/status
 * Статус ИИ системы
 */
router.get('/status', async (req, res) => {
  try {
    const aiStatus = aiProvider.getStatus();
    const voiceStatus = voiceService.getStatus();

    res.json({
      success: true,
      data: {
        ai: aiStatus,
        voice: voiceStatus,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('AI status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get AI status',
      error: error.message
    });
  }
});

// Вспомогательные функции для выполнения ИИ команд

async function executeCreateTask(args, user, io) {
  // TODO: Интегрировать с существующим API задач
  const taskData = {
    title: args.title,
    description: args.description || '',
    assigneeId: await findUserByName(args.assignee), // TODO: реализовать поиск пользователя
    creatorId: user.id,
    priority: args.priority || 'medium',
    dueDate: args.dueDate,
    status: 'awaiting_assignee_confirmation'
  };

  console.log('📝 Creating task via AI:', taskData);

  // Эмулируем создание задачи
  const newTask = {
    id: Date.now().toString(),
    ...taskData,
    createdAt: new Date().toISOString(),
    responses: []
  };

  // WebSocket уведомление
  io?.emit('task:created-by-ai', {
    task: newTask,
    creator: user,
    source: 'ai'
  });

  return {
    success: true,
    task: newTask,
    message: 'Task created successfully via AI'
  };
}

async function executeScheduleMeeting(args, user, io) {
  // TODO: Интегрировать с системой календаря
  const meetingData = {
    title: args.title,
    description: args.description || '',
    organizerId: user.id,
    participants: await findUsersByNames(args.participants), // TODO: реализовать поиск участников
    startTime: args.startTime,
    endTime: new Date(new Date(args.startTime).getTime() + (args.duration || 60) * 60000).toISOString(),
    status: 'scheduled'
  };

  console.log('📅 Scheduling meeting via AI:', meetingData);

  const newMeeting = {
    id: Date.now().toString(),
    ...meetingData,
    createdAt: new Date().toISOString()
  };

  // WebSocket уведомление
  io?.emit('meeting:scheduled-by-ai', {
    meeting: newMeeting,
    organizer: user,
    source: 'ai'
  });

  return {
    success: true,
    meeting: newMeeting,
    message: 'Meeting scheduled successfully via AI'
  };
}

async function executeAnalyzeCall(args, user) {
  const callId = args.callId;
  
  // Получаем анализ созвона
  const analysis = await voiceService.getCallAnalysis(callId);
  
  if (!analysis.success) {
    throw new Error('Call analysis not found');
  }

  return {
    success: true,
    analysis: analysis.analysis,
    message: 'Call analysis retrieved successfully'
  };
}

// Заглушки для поиска пользователей (TODO: реализовать с базой данных)
async function findUserByName(name) {
  // Mock implementation
  return 'user-id-' + name.toLowerCase().replace(/\s+/g, '-');
}

async function findUsersByNames(names) {
  // Mock implementation
  return names.map(name => 'user-id-' + name.toLowerCase().replace(/\s+/g, '-'));
}

module.exports = router;

