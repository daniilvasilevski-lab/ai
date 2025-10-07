import api from './api';

export interface AIResponse {
  success: boolean;
  response: string;
  intent?: string;
  confidence?: number;
  functionCall?: {
    name: string;
    arguments: any;
  };
  requiresConfirmation?: boolean;
  provider?: 'local' | 'openai';
}

export interface VoiceCommandResult {
  success: boolean;
  transcript?: string;
  language?: string;
  aiResponse?: AIResponse;
  processingTime?: number;
}

export interface VoiceCommandHistoryItem {
  userId: string;
  transcript: string;
  language: string;
  intent: string;
  confidence: number;
  response: string;
  functionCall?: any;
  timestamp: string;
}

export interface AIStatus {
  ai: {
    currentProvider: string;
    openaiReady: boolean;
    localReady: boolean;
    capabilities: string[];
  };
  voice: {
    recordingsPath: string;
    capabilities: string[];
  };
  timestamp: string;
}

class AIService {
  /**
   * Send a text message to AI for processing
   */
  async sendMessage(message: string, context?: any): Promise<AIResponse> {
    const response = await api.post('/ai/chat', {
      message,
      context: context || {}
    });
    return response.data;
  }

  /**
   * Process voice command
   */
  async processVoiceCommand(audioBlob: Blob, context?: any): Promise<VoiceCommandResult> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'voice-command.webm');
    formData.append('context', JSON.stringify(context || {}));

    const response = await api.postForm('/ai/voice', formData);

    return response.data;
  }

  /**
   * Execute AI function (create task, schedule meeting, etc.)
   */
  async executeFunction(
    functionName: string, 
    args: any, 
    confirmationId?: string
  ): Promise<any> {
    const response = await api.post('/ai/execute-function', {
      functionName,
      arguments: args,
      confirmationId
    });
    return response.data;
  }

  /**
   * Get voice command history
   */
  async getVoiceHistory(limit: number = 20): Promise<VoiceCommandHistoryItem[]> {
    const response = await api.get(`/ai/voice-history?limit=${limit}`);
    return response.data || [];
  }

  /**
   * Switch between local and cloud AI providers
   */
  async switchProvider(provider: 'local' | 'openai'): Promise<{ success: boolean; provider?: string }> {
    const response = await api.post('/ai/switch-provider', { provider });
    return response.data;
  }

  /**
   * Get AI system status
   */
  async getStatus(): Promise<AIStatus> {
    const response = await api.get('/ai/status');
    return response.data;
  }

  /**
   * Parse voice command intent from transcript
   */
  parseIntent(transcript: string): {
    intent: string;
    entities: any;
    confidence: number;
  } {
    const lowerTranscript = transcript.toLowerCase();
    
    // Task creation patterns
    if (this.matchesPattern(lowerTranscript, [
      /создай задач/i,
      /create task/i,
      /assign.*to/i,
      /поставь задач/i
    ])) {
      return {
        intent: 'create_task',
        entities: this.extractTaskEntities(transcript),
        confidence: 0.9
      };
    }

    // Meeting scheduling patterns
    if (this.matchesPattern(lowerTranscript, [
      /запланируй встреч/i,
      /schedule meeting/i,
      /созвон/i,
      /встреча/i
    ])) {
      return {
        intent: 'schedule_meeting',
        entities: this.extractMeetingEntities(transcript),
        confidence: 0.8
      };
    }

    // Call analysis patterns
    if (this.matchesPattern(lowerTranscript, [
      /анализ.*звонк/i,
      /analyze.*call/i,
      /сводка.*созвон/i
    ])) {
      return {
        intent: 'analyze_call',
        entities: this.extractCallEntities(transcript),
        confidence: 0.7
      };
    }

    return {
      intent: 'general',
      entities: {},
      confidence: 0.5
    };
  }

  private matchesPattern(text: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text));
  }

  private extractTaskEntities(transcript: string): any {
    const entities: any = {};
    
    // Extract assignee names (simple approach)
    const assigneePatterns = [
      /для\s+([А-ЯA-Z][а-яa-z]+(?:\s+[А-ЯA-Z][а-яa-z]+)?)/i,
      /to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /assign.*to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
    ];
    
    for (const pattern of assigneePatterns) {
      const match = transcript.match(pattern);
      if (match) {
        entities.assignee = match[1].trim();
        break;
      }
    }
    
    // Extract priority
    if (/высокий|high|urgent|срочн/i.test(transcript)) {
      entities.priority = 'high';
    } else if (/низкий|low/i.test(transcript)) {
      entities.priority = 'low';
    } else {
      entities.priority = 'medium';
    }
    
    // Extract due date
    if (/завтра|tomorrow/i.test(transcript)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      entities.dueDate = tomorrow.toISOString().split('T')[0];
    } else if (/понедельник|monday/i.test(transcript)) {
      entities.dueDate = this.getNextDayOfWeek(1);
    } else if (/пятниц|friday/i.test(transcript)) {
      entities.dueDate = this.getNextDayOfWeek(5);
    }
    
    return entities;
  }

  private extractMeetingEntities(transcript: string): any {
    const entities: any = {};
    
    // Extract participants
    const participantPatterns = [
      /с\s+([А-ЯA-Z][а-яa-z]+(?:\s+и\s+[А-ЯA-Z][а-яa-z]+)*)/i,
      /with\s+([A-Z][a-z]+(?:\s+and\s+[A-Z][a-z]+)*)/i
    ];
    
    for (const pattern of participantPatterns) {
      const match = transcript.match(pattern);
      if (match) {
        entities.participants = match[1].split(/\s+(?:и|and)\s+/);
        break;
      }
    }
    
    // Extract time
    if (/завтра|tomorrow/i.test(transcript)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0); // Default to 10 AM
      entities.startTime = tomorrow.toISOString();
    } else if (/понедельник|monday/i.test(transcript)) {
      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + (1 + 7 - nextMonday.getDay()) % 7);
      nextMonday.setHours(10, 0, 0, 0);
      entities.startTime = nextMonday.toISOString();
    }
    
    // Extract duration
    if (/час|hour/i.test(transcript)) {
      entities.duration = 60;
    } else if (/30.*минут|30.*min/i.test(transcript)) {
      entities.duration = 30;
    } else {
      entities.duration = 30; // Default 30 minutes
    }
    
    return entities;
  }

  private extractCallEntities(transcript: string): any {
    const entities: any = {};
    
    // Extract call ID if mentioned
    const callIdMatch = transcript.match(/звонок?\s*№?\s*(\d+)|call\s*#?(\d+)/i);
    if (callIdMatch) {
      entities.callId = callIdMatch[1] || callIdMatch[2];
    }
    
    return entities;
  }

  private getNextDayOfWeek(dayOfWeek: number): string {
    const today = new Date();
    const daysUntil = (dayOfWeek + 7 - today.getDay()) % 7 || 7;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntil);
    return targetDate.toISOString().split('T')[0];
  }

  /**
   * Format AI response for display
   */
  formatResponse(response: AIResponse): string {
    if (response.functionCall) {
      const { name, arguments: args } = response.functionCall;
      
      switch (name) {
        case 'create_task':
          return `📝 Ready to create task: "${args.title}" for ${args.assignee} (Priority: ${args.priority}${args.dueDate ? `, Due: ${args.dueDate}` : ''})`;
        
        case 'schedule_meeting':
          return `📅 Ready to schedule meeting: "${args.title}" with ${args.participants?.join(', ')} at ${new Date(args.startTime).toLocaleString()}`;
        
        case 'analyze_call':
          return `🎥 Ready to analyze call #${args.callId}`;
        
        default:
          return response.response;
      }
    }
    
    return response.response;
  }

  /**
   * Get supported voice commands help
   */
  getVoiceCommandsHelp(): { category: string; commands: string[] }[] {
    return [
      {
        category: 'Task Management',
        commands: [
          'Создай задачу для Иванова проверить отчет',
          'Create task for John to review document',
          'Поставь срочную задачу для команды',
          'Assign high priority task to Maria'
        ]
      },
      {
        category: 'Meeting Scheduling', 
        commands: [
          'Запланируй встречу с командой на завтра',
          'Schedule meeting with John and Mary',
          'Созвон в понедельник на час',
          'Plan call tomorrow at 2 PM'
        ]
      },
      {
        category: 'Call Analysis',
        commands: [
          'Анализ звонка номер 123',
          'Analyze call recording',
          'Сводка по последнему созвону',
          'Get summary of meeting'
        ]
      }
    ];
  }
}

export const aiService = new AIService();

