/**
 * AI Notification Service
 * Система уведомлений для AI предложений и автоматизации
 */

const fs = require('fs');
const path = require('path');
const aiProvider = require('./aiProvider');
const taskGeneratorService = require('./taskGeneratorService');
const calendarService = require('../calendar/calendarService');

class AINotificationService {
  constructor() {
    this.notificationsPath = path.join(__dirname, '../../../uploads/ai_notifications');
    this.suggestionsPath = path.join(this.notificationsPath, 'suggestions.json');
    this.settingsPath = path.join(this.notificationsPath, 'settings.json');
    this.ensureNotificationsDirectory();
    
    // WebSocket instance will be injected
    this.io = null;
    
    // Suggestion analysis intervals
    this.suggestionIntervals = new Map();
    
    // Default settings
    this.defaultSettings = {
      enabled: true,
      taskSuggestions: true,
      meetingSuggestions: true,
      deadlineReminders: true,
      conflictAlerts: true,
      productivityInsights: true,
      analysisFrequency: 30, // minutes
      suggestionThreshold: 0.7, // confidence threshold
      maxSuggestionsPerDay: 10
    };
  }

  setWebSocketInstance(io) {
    this.io = io;
  }

  ensureNotificationsDirectory() {
    if (!fs.existsSync(this.notificationsPath)) {
      fs.mkdirSync(this.notificationsPath, { recursive: true });
    }
  }

  /**
   * Initialize AI notification system
   */
  async initialize() {
    try {
      console.log('🤖 Initializing AI Notification System...');
      
      // Load settings
      await this.loadSettings();
      
      // Start periodic analysis
      this.startPeriodicAnalysis();
      
      // Schedule deadline checking
      this.scheduleDeadlineChecks();
      
      console.log('✅ AI Notification System initialized');
      
      return { success: true };
    } catch (error) {
      console.error('AI notification initialization error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate AI suggestions based on user activity
   */
  async generateSuggestions(userId, context = {}) {
    try {
      console.log(`💡 Generating AI suggestions for user ${userId}`);

      const userSettings = await this.getUserSettings(userId);
      if (!userSettings.enabled) {
        return { success: true, suggestions: [] };
      }

      const suggestions = [];
      const today = new Date();
      const suggestionCount = await this.getDailySuggestionCount(userId, today);

      if (suggestionCount >= userSettings.maxSuggestionsPerDay) {
        return { success: true, suggestions: [], reason: 'Daily limit reached' };
      }

      // Task suggestions from recent activity
      if (userSettings.taskSuggestions) {
        const taskSuggestions = await this.generateTaskSuggestions(userId, context);
        suggestions.push(...taskSuggestions);
      }

      // Meeting suggestions
      if (userSettings.meetingSuggestions) {
        const meetingSuggestions = await this.generateMeetingSuggestions(userId, context);
        suggestions.push(...meetingSuggestions);
      }

      // Productivity insights
      if (userSettings.productivityInsights) {
        const insights = await this.generateProductivityInsights(userId);
        suggestions.push(...insights);
      }

      // Filter by confidence threshold
      const qualifiedSuggestions = suggestions.filter(
        s => s.confidence >= userSettings.suggestionThreshold
      );

      // Save and send suggestions
      if (qualifiedSuggestions.length > 0) {
        await this.saveSuggestions(userId, qualifiedSuggestions);
        await this.sendSuggestionNotifications(userId, qualifiedSuggestions);
      }

      console.log(`💡 Generated ${qualifiedSuggestions.length} AI suggestions for user ${userId}`);

      return {
        success: true,
        suggestions: qualifiedSuggestions,
        count: qualifiedSuggestions.length
      };

    } catch (error) {
      console.error('AI suggestion generation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate task suggestions from user activity
   */
  async generateTaskSuggestions(userId, context) {
    const suggestions = [];

    try {
      // Analyze recent messages for task opportunities
      if (context.recentMessages) {
        const taskSuggestions = await taskGeneratorService.generateTaskSuggestions({
          messages: context.recentMessages,
          participants: [userId],
          chatId: context.chatId || 'general'
        });

        if (taskSuggestions.success) {
          suggestions.push(...taskSuggestions.suggestions.map(s => ({
            ...s,
            type: 'task_suggestion',
            priority: 'medium',
            actions: [
              {
                type: 'create_task',
                label: 'Create Task',
                data: s
              },
              {
                type: 'dismiss',
                label: 'Dismiss'
              }
            ]
          })));
        }
      }

      // Analyze incomplete tasks for follow-up suggestions
      const incompleteTasks = await this.getIncompleteUserTasks(userId);
      if (incompleteTasks.length > 0) {
        const overdueTasks = incompleteTasks.filter(task => {
          const dueDate = new Date(task.dueDate);
          return dueDate < new Date();
        });

        if (overdueTasks.length > 0) {
          suggestions.push({
            id: `overdue_tasks_${Date.now()}`,
            type: 'overdue_reminder',
            title: `You have ${overdueTasks.length} overdue tasks`,
            description: `Tasks: ${overdueTasks.slice(0, 3).map(t => t.title).join(', ')}${overdueTasks.length > 3 ? '...' : ''}`,
            confidence: 0.9,
            priority: 'high',
            actions: [
              {
                type: 'view_tasks',
                label: 'View Tasks',
                data: { filter: 'overdue' }
              },
              {
                type: 'extend_deadline',
                label: 'Extend Deadlines'
              }
            ]
          });
        }
      }

    } catch (error) {
      console.error('Task suggestion generation error:', error);
    }

    return suggestions;
  }

  /**
   * Generate meeting suggestions
   */
  async generateMeetingSuggestions(userId, context) {
    const suggestions = [];

    try {
      // Suggest follow-up meetings for completed calls
      if (context.recentCalls) {
        const callsNeedingFollowUp = context.recentCalls.filter(call => 
          call.actionItems && call.actionItems.length > 0 &&
          !call.hasFollowUpMeeting
        );

        for (const call of callsNeedingFollowUp) {
          suggestions.push({
            id: `followup_meeting_${call.id}`,
            type: 'meeting_suggestion',
            title: 'Schedule Follow-up Meeting',
            description: `Follow up on action items from "${call.title}"`,
            confidence: 0.8,
            priority: 'medium',
            data: {
              participants: call.participants,
              duration: 30,
              title: `Follow-up: ${call.title}`,
              relatedCallId: call.id
            },
            actions: [
              {
                type: 'schedule_meeting',
                label: 'Schedule Meeting',
                data: {
                  participants: call.participants,
                  duration: 30,
                  title: `Follow-up: ${call.title}`
                }
              },
              {
                type: 'dismiss',
                label: 'Not Now'
              }
            ]
          });
        }
      }

      // Suggest one-on-one meetings with team members
      const teamMembers = await this.getTeamMembers(userId);
      const oneOnOneSuggestions = await this.suggestOneOnOneMeetings(userId, teamMembers);
      suggestions.push(...oneOnOneSuggestions);

    } catch (error) {
      console.error('Meeting suggestion generation error:', error);
    }

    return suggestions;
  }

  /**
   * Generate productivity insights
   */
  async generateProductivityInsights(userId) {
    const insights = [];

    try {
      // Analyze user's calendar and task patterns
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7); // Last 7 days
      const endDate = new Date();

      const calendarStats = await calendarService.getCalendarStats(userId, startDate, endDate);
      
      if (calendarStats.success) {
        const stats = calendarStats.stats;

        // Meeting overload detection
        if (stats.totalHours > 25) { // More than 25 hours in meetings per week
          insights.push({
            id: `meeting_overload_${Date.now()}`,
            type: 'productivity_insight',
            title: 'High Meeting Load Detected',
            description: `You spent ${stats.totalHours} hours in meetings this week. Consider blocking focus time.`,
            confidence: 0.8,
            priority: 'medium',
            category: 'time_management',
            actions: [
              {
                type: 'block_focus_time',
                label: 'Block Focus Time'
              },
              {
                type: 'analyze_meetings',
                label: 'Analyze Meetings'
              }
            ]
          });
        }

        // Meeting conflicts insight
        if (stats.conflicts > 0) {
          insights.push({
            id: `conflicts_detected_${Date.now()}`,
            type: 'productivity_insight',
            title: 'Scheduling Conflicts Detected',
            description: `You have ${stats.conflicts} scheduling conflicts that may need attention.`,
            confidence: 0.9,
            priority: 'high',
            category: 'scheduling',
            actions: [
              {
                type: 'resolve_conflicts',
                label: 'Resolve Conflicts'
              },
              {
                type: 'view_calendar',
                label: 'View Calendar'
              }
            ]
          });
        }

        // Optimal meeting duration insights
        if (stats.averageDuration > 60) {
          insights.push({
            id: `long_meetings_${Date.now()}`,
            type: 'productivity_insight',
            title: 'Consider Shorter Meetings',
            description: `Your average meeting duration is ${stats.averageDuration} minutes. Consider 25-45 minute meetings for better focus.`,
            confidence: 0.7,
            priority: 'low',
            category: 'efficiency',
            actions: [
              {
                type: 'set_default_duration',
                label: 'Set Default Durations'
              },
              {
                type: 'learn_more',
                label: 'Learn More'
              }
            ]
          });
        }
      }

    } catch (error) {
      console.error('Productivity insights generation error:', error);
    }

    return insights;
  }

  /**
   * Send deadline reminders
   */
  async sendDeadlineReminders() {
    try {
      console.log('⏰ Checking deadlines for reminders...');

      // Get all upcoming deadlines
      const upcomingDeadlines = await this.getUpcomingDeadlines();
      
      for (const deadline of upcomingDeadlines) {
        const userSettings = await this.getUserSettings(deadline.userId);
        
        if (userSettings.deadlineReminders) {
          await this.sendDeadlineReminder(deadline);
        }
      }

      console.log(`⏰ Sent ${upcomingDeadlines.length} deadline reminders`);

    } catch (error) {
      console.error('Deadline reminder error:', error);
    }
  }

  /**
   * Send conflict alerts
   */
  async sendConflictAlerts(userId, conflicts) {
    try {
      const userSettings = await this.getUserSettings(userId);
      
      if (!userSettings.conflictAlerts) {
        return;
      }

      const notification = {
        id: `conflict_alert_${Date.now()}`,
        type: 'conflict_alert',
        userId,
        title: 'Scheduling Conflict Detected',
        description: `You have ${conflicts.length} scheduling conflicts that need attention.`,
        priority: 'high',
        data: { conflicts },
        timestamp: new Date(),
        actions: [
          {
            type: 'resolve_conflicts',
            label: 'Resolve Now'
          },
          {
            type: 'view_calendar',
            label: 'View Calendar'
          }
        ]
      };

      await this.sendNotification(userId, notification);

    } catch (error) {
      console.error('Conflict alert error:', error);
    }
  }

  /**
   * Get user notification settings
   */
  async getUserSettings(userId) {
    try {
      let allSettings = {};
      
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        allSettings = JSON.parse(data);
      }

      return {
        ...this.defaultSettings,
        ...allSettings[userId]
      };

    } catch (error) {
      console.error('Error getting user settings:', error);
      return this.defaultSettings;
    }
  }

  /**
   * Update user notification settings
   */
  async updateUserSettings(userId, settings) {
    try {
      let allSettings = {};
      
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        allSettings = JSON.parse(data);
      }

      allSettings[userId] = {
        ...this.defaultSettings,
        ...allSettings[userId],
        ...settings,
        updatedAt: new Date()
      };

      fs.writeFileSync(this.settingsPath, JSON.stringify(allSettings, null, 2));

      return { success: true };

    } catch (error) {
      console.error('Error updating user settings:', error);
      return { success: false, error: error.message };
    }
  }

  // Helper methods

  async loadSettings() {
    // Initialize default settings if file doesn't exist
    if (!fs.existsSync(this.settingsPath)) {
      fs.writeFileSync(this.settingsPath, JSON.stringify({}, null, 2));
    }
  }

  startPeriodicAnalysis() {
    // Run suggestion analysis every 30 minutes by default
    setInterval(async () => {
      try {
        // Get all active users
        const activeUsers = await this.getActiveUsers();
        
        for (const userId of activeUsers) {
          const userSettings = await this.getUserSettings(userId);
          
          if (userSettings.enabled) {
            await this.generateSuggestions(userId, {
              // Add context as needed
            });
          }
        }
      } catch (error) {
        console.error('Periodic analysis error:', error);
      }
    }, this.defaultSettings.analysisFrequency * 60 * 1000);
  }

  scheduleDeadlineChecks() {
    // Check deadlines every hour
    setInterval(() => {
      this.sendDeadlineReminders();
    }, 60 * 60 * 1000);

    // Check at the start
    setTimeout(() => {
      this.sendDeadlineReminders();
    }, 1000);
  }

  async saveSuggestions(userId, suggestions) {
    try {
      const suggestionData = {
        userId,
        suggestions,
        timestamp: new Date(),
        count: suggestions.length
      };

      let allSuggestions = [];
      if (fs.existsSync(this.suggestionsPath)) {
        const data = fs.readFileSync(this.suggestionsPath, 'utf8');
        allSuggestions = JSON.parse(data);
      }

      allSuggestions.push(suggestionData);

      // Keep last 500 suggestion batches
      if (allSuggestions.length > 500) {
        allSuggestions = allSuggestions.slice(-500);
      }

      fs.writeFileSync(this.suggestionsPath, JSON.stringify(allSuggestions, null, 2));

    } catch (error) {
      console.error('Error saving suggestions:', error);
    }
  }

  async sendSuggestionNotifications(userId, suggestions) {
    for (const suggestion of suggestions) {
      await this.sendNotification(userId, {
        ...suggestion,
        userId,
        timestamp: new Date()
      });
    }
  }

  async sendNotification(userId, notification) {
    try {
      if (this.io) {
        this.io.to(`user_${userId}`).emit('ai:suggestion', notification);
      }

      console.log(`📢 Sent AI notification to user ${userId}: ${notification.title}`);

    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  // Mock helper methods (to be replaced with real implementations)
  async getActiveUsers() {
    return ['user1', 'user2']; // TODO: Get from actual user service
  }

  async getIncompleteUserTasks(userId) {
    return []; // TODO: Get from task service
  }

  async getTeamMembers(userId) {
    return []; // TODO: Get from user service
  }

  async getUpcomingDeadlines() {
    return []; // TODO: Get from task and calendar services
  }

  async getDailySuggestionCount(userId, date) {
    try {
      if (!fs.existsSync(this.suggestionsPath)) {
        return 0;
      }

      const data = fs.readFileSync(this.suggestionsPath, 'utf8');
      const allSuggestions = JSON.parse(data);
      
      const today = date.toDateString();
      
      return allSuggestions
        .filter(s => 
          s.userId === userId && 
          new Date(s.timestamp).toDateString() === today
        )
        .reduce((sum, batch) => sum + batch.count, 0);

    } catch (error) {
      console.error('Error getting daily suggestion count:', error);
      return 0;
    }
  }

  async suggestOneOnOneMeetings(userId, teamMembers) {
    // TODO: Implement one-on-one meeting suggestions
    return [];
  }

  async sendDeadlineReminder(deadline) {
    // TODO: Implement deadline reminder logic
    console.log(`⏰ Deadline reminder: ${deadline.title}`);
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      notificationsPath: this.notificationsPath,
      webSocketConnected: !!this.io,
      activeIntervals: this.suggestionIntervals.size,
      capabilities: [
        'ai_suggestions',
        'deadline_reminders',
        'conflict_alerts',
        'productivity_insights',
        'meeting_suggestions',
        'task_suggestions'
      ]
    };
  }
}

module.exports = new AINotificationService();
