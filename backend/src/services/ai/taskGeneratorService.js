/**
 * Task Generator Service
 * Автоматическое создание задач из анализа созвонов и AI предложений
 */

const aiProvider = require('./aiProvider');
const fs = require('fs');
const path = require('path');

class TaskGeneratorService {
  constructor() {
    this.generatedTasksPath = path.join(__dirname, '../../../uploads/generated_tasks');
    this.ensureTasksDirectory();
  }

  ensureTasksDirectory() {
    if (!fs.existsSync(this.generatedTasksPath)) {
      fs.mkdirSync(this.generatedTasksPath, { recursive: true });
    }
  }

  /**
   * Generate tasks from call analysis
   */
  async generateTasksFromCallAnalysis(callAnalysis) {
    try {
      console.log(`🧠 Generating tasks from call analysis: ${callAnalysis.callId}`);

      const prompt = this.buildTaskGenerationPrompt(callAnalysis);
      
      const aiResponse = await aiProvider.processCommand(prompt, {
        isTaskGeneration: true,
        callId: callAnalysis.callId,
        participants: callAnalysis.participants
      });

      if (!aiResponse.success) {
        throw new Error('AI failed to generate tasks');
      }

      // Extract tasks from AI response
      const extractedTasks = this.extractTasksFromResponse(aiResponse.response, callAnalysis);
      
      // Process and validate tasks
      const validTasks = await this.processExtractedTasks(extractedTasks, callAnalysis);

      // Save generated tasks
      await this.saveGeneratedTasks({
        callId: callAnalysis.callId,
        sourceType: 'call_analysis',
        tasks: validTasks,
        timestamp: new Date(),
        originalAnalysis: callAnalysis
      });

      console.log(`✅ Generated ${validTasks.length} tasks from call ${callAnalysis.callId}`);

      return {
        success: true,
        tasks: validTasks,
        count: validTasks.length
      };

    } catch (error) {
      console.error('Task generation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate task suggestions from conversation context
   */
  async generateTaskSuggestions(context) {
    try {
      const { messages, participants, chatId } = context;
      
      console.log(`💡 Generating task suggestions from chat: ${chatId}`);

      // Analyze recent messages for task opportunities
      const recentMessages = messages.slice(-20); // Last 20 messages
      const conversationText = recentMessages
        .map(msg => `${msg.sender}: ${msg.content}`)
        .join('\n');

      const prompt = `
        Analyze this conversation and suggest potential tasks or action items:
        
        Conversation:
        ${conversationText}
        
        Participants: ${participants.join(', ')}
        
        Please identify:
        1. Any mentioned deadlines or commitments
        2. Work items that need follow-up
        3. Decisions that require implementation
        4. Questions that need answers
        
        Format as actionable tasks with suggested assignees and priorities.
      `;

      const aiResponse = await aiProvider.processCommand(prompt, {
        isTaskSuggestion: true,
        chatId,
        participants
      });

      if (!aiResponse.success) {
        return { success: false, error: 'Failed to generate suggestions' };
      }

      const suggestions = this.extractTaskSuggestions(aiResponse.response, context);

      return {
        success: true,
        suggestions,
        count: suggestions.length
      };

    } catch (error) {
      console.error('Task suggestion error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Auto-create approved tasks
   */
  async autoCreateTasks(tasksData, approverId) {
    try {
      console.log(`🤖 Auto-creating ${tasksData.length} approved tasks`);

      const createdTasks = [];
      const failedTasks = [];

      for (const taskData of tasksData) {
        try {
          const task = await this.createTaskInSystem(taskData, approverId);
          if (task) {
            createdTasks.push(task);
          }
        } catch (error) {
          console.error(`Failed to create task: ${taskData.title}`, error);
          failedTasks.push({
            taskData,
            error: error.message
          });
        }
      }

      return {
        success: true,
        created: createdTasks,
        failed: failedTasks,
        createdCount: createdTasks.length,
        failedCount: failedTasks.length
      };

    } catch (error) {
      console.error('Auto-create tasks error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get task generation history
   */
  async getTaskGenerationHistory(limit = 50) {
    try {
      const historyPath = path.join(this.generatedTasksPath, 'generation_history.json');
      
      if (!fs.existsSync(historyPath)) {
        return { success: true, history: [] };
      }

      const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      
      return {
        success: true,
        history: history.slice(-limit).reverse()
      };

    } catch (error) {
      console.error('Failed to get task generation history:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build AI prompt for task generation
   */
  buildTaskGenerationPrompt(callAnalysis) {
    return `
      Analyze this call meeting summary and generate actionable tasks:

      Call Details:
      - Call ID: ${callAnalysis.callId}
      - Participants: ${callAnalysis.participants.join(', ')}
      - Duration: ${Math.round((callAnalysis.timestamp - callAnalysis.startTime) / 60000)} minutes
      
      Meeting Summary:
      ${callAnalysis.summary}
      
      Action Items Identified:
      ${callAnalysis.actionItems?.join('\n') || 'None explicitly mentioned'}
      
      Key Decisions:
      ${callAnalysis.keyDecisions?.join('\n') || 'None recorded'}
      
      Please generate specific, actionable tasks from this meeting. For each task, include:
      1. Clear, actionable title
      2. Detailed description
      3. Suggested assignee (from participants)
      4. Priority level (high/medium/low)
      5. Estimated due date
      6. Any dependencies or prerequisites
      
      Format each task clearly and make sure they are SMART (Specific, Measurable, Achievable, Relevant, Time-bound).
    `;
  }

  /**
   * Extract tasks from AI response
   */
  extractTasksFromResponse(aiResponse, callAnalysis) {
    const tasks = [];
    
    // Simple extraction - in real implementation, use more sophisticated NLP
    const lines = aiResponse.split('\n').filter(line => line.trim());
    
    let currentTask = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Detect task headers (various patterns)
      if (this.isTaskHeader(trimmedLine)) {
        if (currentTask) {
          tasks.push(currentTask);
        }
        currentTask = {
          title: this.extractTaskTitle(trimmedLine),
          description: '',
          priority: 'medium',
          assignee: null,
          dueDate: null,
          source: 'call_analysis',
          sourceCallId: callAnalysis.callId,
          extractionConfidence: 0.7
        };
      } else if (currentTask) {
        // Process task properties
        if (trimmedLine.toLowerCase().includes('assignee:') || 
            trimmedLine.toLowerCase().includes('assigned to:')) {
          currentTask.assignee = this.extractAssignee(trimmedLine, callAnalysis.participants);
        } else if (trimmedLine.toLowerCase().includes('priority:')) {
          currentTask.priority = this.extractPriority(trimmedLine);
        } else if (trimmedLine.toLowerCase().includes('due:') ||
                   trimmedLine.toLowerCase().includes('deadline:')) {
          currentTask.dueDate = this.extractDueDate(trimmedLine);
        } else if (trimmedLine && !this.isTaskHeader(trimmedLine)) {
          // Add to description
          currentTask.description += (currentTask.description ? ' ' : '') + trimmedLine;
        }
      }
    }
    
    // Add last task
    if (currentTask) {
      tasks.push(currentTask);
    }
    
    return tasks;
  }

  /**
   * Extract task suggestions from AI response
   */
  extractTaskSuggestions(aiResponse, context) {
    // Similar to extractTasksFromResponse but for suggestions
    const suggestions = [];
    
    const lines = aiResponse.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      if (this.isSuggestionLine(line)) {
        const suggestion = {
          title: this.extractSuggestionTitle(line),
          description: this.extractSuggestionDescription(line),
          confidence: this.calculateSuggestionConfidence(line),
          source: 'conversation_analysis',
          sourceChatId: context.chatId,
          participants: context.participants,
          suggestedAt: new Date()
        };
        
        suggestions.push(suggestion);
      }
    }
    
    return suggestions;
  }

  /**
   * Process and validate extracted tasks
   */
  async processExtractedTasks(extractedTasks, callAnalysis) {
    const validTasks = [];
    
    for (const task of extractedTasks) {
      // Validate task data
      if (!task.title || task.title.length < 5) {
        console.warn(`Skipping invalid task: ${task.title}`);
        continue;
      }
      
      // Enhance task data
      const enhancedTask = {
        ...task,
        id: `generated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'awaiting_approval',
        createdAt: new Date(),
        sourceAnalysis: {
          callId: callAnalysis.callId,
          participants: callAnalysis.participants,
          analysisTimestamp: callAnalysis.timestamp
        }
      };
      
      // Set default assignee if none specified
      if (!enhancedTask.assignee && callAnalysis.participants.length > 0) {
        enhancedTask.assignee = callAnalysis.participants[0];
        enhancedTask.extractionConfidence *= 0.8; // Lower confidence for auto-assigned
      }
      
      // Set default due date if none specified
      if (!enhancedTask.dueDate) {
        const defaultDue = new Date();
        defaultDue.setDate(defaultDue.getDate() + 7); // Default to 1 week
        enhancedTask.dueDate = defaultDue.toISOString().split('T')[0];
      }
      
      validTasks.push(enhancedTask);
    }
    
    return validTasks;
  }

  /**
   * Create task in the main system (integration point)
   */
  async createTaskInSystem(taskData, creatorId) {
    // TODO: Integrate with actual task creation API
    // For now, simulate task creation
    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: taskData.title,
      description: taskData.description,
      assigneeId: taskData.assignee,
      creatorId,
      priority: taskData.priority,
      dueDate: taskData.dueDate,
      status: 'awaiting_assignee_confirmation',
      source: 'ai_generated',
      sourceData: taskData,
      createdAt: new Date(),
      responses: []
    };
    
    console.log(`📝 Created AI-generated task: ${task.title}`);
    
    return task;
  }

  /**
   * Save generated tasks to history
   */
  async saveGeneratedTasks(generationData) {
    try {
      const historyPath = path.join(this.generatedTasksPath, 'generation_history.json');
      let history = [];
      
      if (fs.existsSync(historyPath)) {
        const existing = fs.readFileSync(historyPath, 'utf8');
        history = JSON.parse(existing);
      }
      
      history.push(generationData);
      
      // Keep last 100 generations
      if (history.length > 100) {
        history = history.slice(-100);
      }
      
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
      
      return { success: true };
    } catch (error) {
      console.error('Failed to save generated tasks:', error);
      throw error;
    }
  }

  // Helper methods for text extraction
  isTaskHeader(line) {
    const taskPatterns = [
      /^\d+\./,              // "1. Task title"
      /^Task \d+:/,          // "Task 1: Title"
      /^[-*]\s/,             // "- Task title" or "* Task title"
      /^#{1,3}\s/,           // "# Task title"
      /^\[.*\]/,             // "[Task] Title"
    ];
    
    return taskPatterns.some(pattern => pattern.test(line.trim()));
  }

  extractTaskTitle(line) {
    return line
      .replace(/^\d+\.\s*/, '')
      .replace(/^Task \d+:\s*/, '')
      .replace(/^[-*]\s*/, '')
      .replace(/^#{1,3}\s*/, '')
      .replace(/^\[.*\]\s*/, '')
      .trim();
  }

  extractAssignee(line, participants) {
    const assigneePattern = /(?:assignee:|assigned to:)\s*([^,\n]+)/i;
    const match = line.match(assigneePattern);
    
    if (match) {
      const assigneeName = match[1].trim();
      // Try to match with actual participants
      return participants.find(p => 
        p.toLowerCase().includes(assigneeName.toLowerCase()) ||
        assigneeName.toLowerCase().includes(p.toLowerCase())
      ) || assigneeName;
    }
    
    return null;
  }

  extractPriority(line) {
    if (/high|urgent|critical/i.test(line)) return 'high';
    if (/low|minor/i.test(line)) return 'low';
    return 'medium';
  }

  extractDueDate(line) {
    // Simple date extraction - can be enhanced
    const datePatterns = [
      /\d{4}-\d{2}-\d{2}/,  // YYYY-MM-DD
      /\d{1,2}\/\d{1,2}\/\d{4}/,  // MM/DD/YYYY
    ];
    
    for (const pattern of datePatterns) {
      const match = line.match(pattern);
      if (match) {
        return match[0];
      }
    }
    
    // Extract relative dates
    if (/tomorrow/i.test(line)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    
    if (/next week/i.test(line)) {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek.toISOString().split('T')[0];
    }
    
    return null;
  }

  isSuggestionLine(line) {
    return /suggest|recommend|consider|might want to/i.test(line) &&
           line.trim().length > 20;
  }

  extractSuggestionTitle(line) {
    return line.replace(/.*(?:suggest|recommend|consider|might want to)\s*/i, '').trim();
  }

  extractSuggestionDescription(line) {
    return line.trim();
  }

  calculateSuggestionConfidence(line) {
    let confidence = 0.5;
    
    if (/should|must|need to/i.test(line)) confidence += 0.2;
    if (/deadline|urgent|asap/i.test(line)) confidence += 0.1;
    if (/\b(?:by|before|until)\s+\w+/i.test(line)) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      generatedTasksPath: this.generatedTasksPath,
      capabilities: [
        'call_analysis_tasks',
        'conversation_suggestions', 
        'auto_task_creation',
        'smart_task_extraction'
      ]
    };
  }
}

module.exports = new TaskGeneratorService();
