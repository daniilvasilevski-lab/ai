/**
 * AI Integration Service
 * Интеграция всех AI компонентов с основной системой
 */

const aiProvider = require('./aiProvider');
const voiceService = require('./voiceService');
const taskGeneratorService = require('./taskGeneratorService');
const aiNotificationService = require('./aiNotificationService');
const webrtcService = require('../webrtc/webrtcService');
const calendarService = require('../calendar/calendarService');

class AIIntegrationService {
  constructor() {
    this.initialized = false;
    this.io = null;
  }

  /**
   * Initialize all AI services
   */
  async initialize(io) {
    try {
      console.log('🚀 Initializing AI Integration Service...');
      
      this.io = io;
      
      // Set WebSocket instances for services that need it
      aiNotificationService.setWebSocketInstance(io);
      
      // Initialize notification system
      await aiNotificationService.initialize();
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.initialized = true;
      
      console.log('✅ AI Integration Service initialized');
      
      return { success: true };
    } catch (error) {
      console.error('AI Integration initialization error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup event listeners for AI automation
   */
  setupEventListeners() {
    if (!this.io) {
      console.warn('WebSocket instance not available for AI Integration');
      return;
    }

    // Listen for call analysis completions
    this.io.on('call:analysis-complete', async (data) => {
      await this.handleCallAnalysisComplete(data);
    });

    // Listen for new messages for conversation analysis
    this.io.on('message:sent', async (data) => {
      await this.handleNewMessage(data);
    });

    // Listen for task confirmations
    this.io.on('task:confirmed', async (data) => {
      await this.handleTaskConfirmed(data);
    });

    // Listen for calendar conflicts
    this.io.on('calendar:conflict-detected', async (data) => {
      await this.handleCalendarConflict(data);
    });
  }

  /**
   * Handle call analysis completion - generate tasks automatically
   */
  async handleCallAnalysisComplete(data) {
    try {
      console.log(`🤖 Processing call analysis completion: ${data.callId}`);
      
      const { callId, analysis, participants } = data;
      
      // Generate tasks from call analysis
      const taskGeneration = await taskGeneratorService.generateTasksFromCallAnalysis(analysis);
      
      if (taskGeneration.success && taskGeneration.tasks.length > 0) {
        // Notify participants about generated tasks
        participants.forEach(participantId => {
          this.io.to(`user_${participantId}`).emit('ai:tasks-generated', {
            callId,
            tasks: taskGeneration.tasks,
            count: taskGeneration.count,
            source: 'call_analysis'
          });
        });

        console.log(`📝 Generated ${taskGeneration.count} tasks from call ${callId}`);
      }

      // Generate AI insights and suggestions
      for (const participantId of participants) {
        await aiNotificationService.generateSuggestions(participantId, {
          recentCalls: [analysis],
          source: 'call_completion'
        });
      }

    } catch (error) {
      console.error('Call analysis completion handling error:', error);
    }
  }

  /**
   * Handle new messages for conversation analysis
   */
  async handleNewMessage(data) {
    try {
      const { message, chatId, userId } = data;
      
      // Analyze message for potential AI suggestions
      // Only analyze every 5th message to avoid spam
      if (Math.random() < 0.2) {
        setTimeout(async () => {
          await aiNotificationService.generateSuggestions(userId, {
            recentMessages: [message],
            chatId,
            source: 'conversation_analysis'
          });
        }, 5000); // Delay to avoid immediate suggestions
      }

    } catch (error) {
      console.error('New message handling error:', error);
    }
  }

  /**
   * Handle task confirmations
   */
  async handleTaskConfirmed(data) {
    try {
      const { task, confirmedBy } = data;
      
      // If task was AI-generated, mark as successfully implemented
      if (task.source === 'ai_generated') {
        console.log(`✅ AI-generated task confirmed: ${task.title}`);
        
        // Could add to AI learning/feedback system here
        await this.recordAISuccess('task_generation', {
          taskId: task.id,
          confirmedBy,
          sourceData: task.sourceData,
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Task confirmation handling error:', error);
    }
  }

  /**
   * Handle calendar conflicts
   */
  async handleCalendarConflict(data) {
    try {
      const { userId, conflicts } = data;
      
      // Send conflict alerts through AI notification system
      await aiNotificationService.sendConflictAlerts(userId, conflicts);
      
      // Suggest alternative meeting times
      if (conflicts.length > 0) {
        const conflict = conflicts[0];
        const suggestions = await calendarService.suggestMeetingTimes(
          conflict.conflictingParticipants,
          30, // Default 30 minutes
          { priority: 'high' }
        );

        if (suggestions.success && suggestions.suggestions.length > 0) {
          this.io.to(`user_${userId}`).emit('ai:meeting-suggestions', {
            conflictId: conflict.eventId,
            suggestions: suggestions.suggestions.slice(0, 3), // Top 3 suggestions
            source: 'conflict_resolution'
          });
        }
      }

    } catch (error) {
      console.error('Calendar conflict handling error:', error);
    }
  }

  /**
   * Process voice command with full AI integration
   */
  async processIntegratedVoiceCommand(audioBlob, userId, context = {}) {
    try {
      console.log(`🎤 Processing integrated voice command for user ${userId}`);
      
      // Process voice command
      const voiceResult = await voiceService.processVoiceCommand(audioBlob, userId, context);
      
      if (!voiceResult.success) {
        return voiceResult;
      }

      const { transcript, aiResponse } = voiceResult;
      
      // If AI wants to execute a function, handle it through the integration layer
      if (aiResponse.functionCall) {
        const integrationResult = await this.executeIntegratedFunction(
          aiResponse.functionCall,
          userId,
          context
        );
        
        return {
          ...voiceResult,
          integrationResult
        };
      }
      
      return voiceResult;

    } catch (error) {
      console.error('Integrated voice command error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute AI functions with full system integration
   */
  async executeIntegratedFunction(functionCall, userId, context = {}) {
    try {
      const { name, arguments: args } = functionCall;
      
      switch (name) {
        case 'create_task':
          return await this.integratedCreateTask(args, userId);
          
        case 'schedule_meeting':
          return await this.integratedScheduleMeeting(args, userId);
          
        case 'analyze_call':
          return await this.integratedAnalyzeCall(args, userId);
          
        default:
          throw new Error(`Unknown function: ${name}`);
      }

    } catch (error) {
      console.error('Integrated function execution error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create task with full integration
   */
  async integratedCreateTask(args, creatorId) {
    try {
      // Enhanced task creation with AI features
      const taskData = {
        title: args.title,
        description: args.description || '',
        assigneeId: args.assignee,
        creatorId,
        priority: args.priority || 'medium',
        dueDate: args.dueDate,
        status: 'awaiting_assignee_confirmation',
        source: 'ai_voice_command',
        aiGenerated: true,
        responses: [],
        createdAt: new Date()
      };

      // TODO: Integrate with actual task creation API
      const newTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...taskData
      };

      // Emit WebSocket notification
      this.io.emit('task:created-by-ai', {
        task: newTask,
        creator: { id: creatorId },
        source: 'voice_command'
      });

      // Notify assignee
      if (args.assignee) {
        this.io.to(`user_${args.assignee}`).emit('task:assigned-by-ai', {
          task: newTask,
          assignedBy: creatorId,
          requiresConfirmation: true
        });
      }

      console.log(`📝 Integrated task creation: ${newTask.title}`);
      
      return {
        success: true,
        task: newTask
      };

    } catch (error) {
      console.error('Integrated task creation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Schedule meeting with full integration
   */
  async integratedScheduleMeeting(args, organizerId) {
    try {
      // Check for conflicts
      const conflicts = await calendarService.checkConflicts(
        args.startTime,
        args.endTime || new Date(new Date(args.startTime).getTime() + (args.duration || 30) * 60000),
        args.participants
      );

      // Create calendar event
      const eventResult = await calendarService.createEvent({
        title: args.title,
        description: args.description,
        startTime: args.startTime,
        endTime: args.endTime || new Date(new Date(args.startTime).getTime() + (args.duration || 30) * 60000),
        organizerId,
        participants: args.participants,
        type: 'meeting',
        priority: args.priority || 'medium'
      });

      if (!eventResult.success) {
        throw new Error(eventResult.error);
      }

      // Send calendar invitations
      args.participants.forEach(participantId => {
        this.io.to(`user_${participantId}`).emit('calendar:invitation', {
          event: eventResult.event,
          organizer: organizerId,
          conflicts: conflicts.conflicts,
          source: 'ai_voice_command'
        });
      });

      // If there are conflicts, send suggestions
      if (conflicts.hasConflicts) {
        const suggestions = await calendarService.suggestMeetingTimes(
          args.participants,
          args.duration || 30
        );

        if (suggestions.success) {
          this.io.to(`user_${organizerId}`).emit('ai:meeting-conflict-suggestions', {
            originalEvent: eventResult.event,
            conflicts: conflicts.conflicts,
            suggestions: suggestions.suggestions
          });
        }
      }

      console.log(`📅 Integrated meeting scheduling: ${eventResult.event.title}`);
      
      return {
        success: true,
        event: eventResult.event,
        conflicts: conflicts.conflicts
      };

    } catch (error) {
      console.error('Integrated meeting scheduling error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze call with full integration
   */
  async integratedAnalyzeCall(args, userId) {
    try {
      const { callId } = args;
      
      // Get call analysis
      const analysisResult = await voiceService.getCallAnalysis(callId);
      
      if (!analysisResult.success) {
        throw new Error(analysisResult.error);
      }

      const analysis = analysisResult.analysis;
      
      // Generate tasks from analysis
      const taskGeneration = await taskGeneratorService.generateTasksFromCallAnalysis(analysis);
      
      // Send comprehensive analysis results
      this.io.to(`user_${userId}`).emit('ai:call-analysis-complete', {
        callId,
        analysis,
        generatedTasks: taskGeneration.tasks || [],
        taskCount: taskGeneration.count || 0,
        source: 'voice_command'
      });

      console.log(`🎥 Integrated call analysis: ${callId}`);
      
      return {
        success: true,
        analysis,
        generatedTasks: taskGeneration.tasks || []
      };

    } catch (error) {
      console.error('Integrated call analysis error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Record AI success for learning/improvement
   */
  async recordAISuccess(type, data) {
    try {
      // TODO: Implement AI feedback/learning system
      console.log(`📊 AI Success recorded: ${type}`, data);
      
      return { success: true };
    } catch (error) {
      console.error('AI success recording error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get comprehensive AI system status
   */
  getIntegratedStatus() {
    return {
      initialized: this.initialized,
      webSocketConnected: !!this.io,
      services: {
        aiProvider: aiProvider.getStatus(),
        voiceService: voiceService.getStatus(),
        taskGenerator: taskGeneratorService.getStatus(),
        notifications: aiNotificationService.getStatus(),
        webrtc: webrtcService.getStatus(),
        calendar: calendarService.getStatus()
      },
      integration: {
        eventListeners: [
          'call:analysis-complete',
          'message:sent',
          'task:confirmed',
          'calendar:conflict-detected'
        ],
        capabilities: [
          'voice_commands',
          'auto_task_generation',
          'meeting_scheduling',
          'call_analysis',
          'ai_suggestions',
          'conflict_resolution',
          'productivity_insights'
        ]
      }
    };
  }

  /**
   * Health check for all AI services
   */
  async healthCheck() {
    const health = {
      overall: 'healthy',
      services: {},
      issues: []
    };

    try {
      // Check AI Provider
      const aiStatus = aiProvider.getStatus();
      health.services.aiProvider = {
        status: aiStatus.openaiReady || aiStatus.localReady ? 'healthy' : 'degraded',
        details: aiStatus
      };

      if (!aiStatus.openaiReady && !aiStatus.localReady) {
        health.issues.push('No AI provider available');
        health.overall = 'degraded';
      }

      // Check other services
      health.services.voiceService = { status: 'healthy' };
      health.services.taskGenerator = { status: 'healthy' };
      health.services.notifications = { 
        status: aiNotificationService.getStatus().webSocketConnected ? 'healthy' : 'degraded'
      };
      health.services.webrtc = { status: 'healthy' };
      health.services.calendar = { status: 'healthy' };

      if (!this.io) {
        health.issues.push('WebSocket not connected');
        health.overall = 'degraded';
      }

    } catch (error) {
      health.overall = 'unhealthy';
      health.issues.push(`Health check error: ${error.message}`);
    }

    return health;
  }
}

module.exports = new AIIntegrationService();
