import React, { useState, useEffect } from 'react';
import { Brain, Mic, Calendar, Phone, Settings, Activity } from 'lucide-react';
import { Button, Card, Badge, Modal } from '@/components/ui';
import { AIChat } from '@/components/ai/AIChat';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
import { aiService } from '@/services/aiService';
import { useAuthStore } from '../../store/auth';
import { motion, AnimatePresence } from 'framer-motion';

interface AISuggestion {
  id: string;
  type: string;
  title: string;
  description: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high';
  actions: Array<{
    type: string;
    label: string;
    data?: any;
  }>;
  timestamp: Date;
}

interface AIIntegrationPanelProps {
  className?: string;
}

export const AIIntegrationPanel: React.FC<AIIntegrationPanelProps> = ({ className }) => {
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isVoiceRecorderOpen, setIsVoiceRecorderOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [aiStatus, setAIStatus] = useState<any>(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    loadAIStatus();
    // Listen for AI suggestions
    // TODO: Connect to WebSocket for real-time suggestions
  }, []);

  const loadAIStatus = async () => {
    try {
      const status = await aiService.getStatus();
      setAIStatus(status);
    } catch (error) {
      console.error('Failed to load AI status:', error);
    }
  };

  const handleVoiceCommand = async (audioBlob: Blob) => {
    setIsProcessingVoice(true);
    try {
      const result = await aiService.processVoiceCommand(audioBlob, {
        user,
        language: 'ru'
      });

      if (result.success) {
        // Add suggestion based on voice command result
        if (result.transcript) {
          addSuggestion({
            id: Date.now().toString(),
            type: 'voice_processed',
            title: 'Voice Command Processed',
            description: `"${result.transcript}"`,
            confidence: result.aiResponse?.confidence || 0.8,
            priority: 'medium',
            actions: [
              {
                type: 'view_result',
                label: 'View Result'
              }
            ],
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      console.error('Voice command error:', error);
    } finally {
      setIsProcessingVoice(false);
      setIsVoiceRecorderOpen(false);
    }
  };

  const addSuggestion = (suggestion: AISuggestion) => {
    setSuggestions(prev => [suggestion, ...prev.slice(0, 9)]); // Keep last 10
  };

  const handleSuggestionAction = async (suggestion: AISuggestion, action: any) => {
    try {
      switch (action.type) {
        case 'create_task':
          await aiService.executeFunction('create_task', action.data);
          removeSuggestion(suggestion.id);
          break;
        case 'schedule_meeting':
          await aiService.executeFunction('schedule_meeting', action.data);
          removeSuggestion(suggestion.id);
          break;
        case 'dismiss':
          removeSuggestion(suggestion.id);
          break;
        default:
          console.log('Unknown action:', action);
      }
    } catch (error) {
      console.error('Action execution error:', error);
    }
  };

  const removeSuggestion = (suggestionId: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'task_suggestion': return '📝';
      case 'meeting_suggestion': return '📅';
      case 'productivity_insight': return '📊';
      case 'voice_processed': return '🎤';
      case 'conflict_alert': return '⚠️';
      default: return '🤖';
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* AI Control Panel */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Brain className="h-5 w-5 text-primary-500" />
            <h3 className="font-semibold">AI Assistant</h3>
            {aiStatus && (
              <Badge 
                variant={aiStatus.ai?.currentProvider === 'local' ? 'warning' : 'success'}
                size="sm"
              >
                {aiStatus.ai?.currentProvider || 'Unknown'}
              </Badge>
            )}
          </div>
          <div className="flex space-x-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={loadAIStatus}
              leftIcon={<Activity className="h-4 w-4" />}
            >
              Status
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsAIChatOpen(true)}
            leftIcon={<Brain className="h-4 w-4" />}
          >
            Chat
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsVoiceRecorderOpen(true)}
            leftIcon={<Mic className="h-4 w-4" />}
          >
            Voice
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Calendar className="h-4 w-4" />}
          >
            Schedule
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Phone className="h-4 w-4" />}
          >
            Call
          </Button>
        </div>
      </Card>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-800">AI Suggestions</h4>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSuggestions([])}
            >
              Clear All
            </Button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            <AnimatePresence>
              {suggestions.map((suggestion) => (
                <motion.div
                  key={suggestion.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="border rounded-lg p-3 bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-lg">
                          {getTypeIcon(suggestion.type)}
                        </span>
                        <span className="font-medium text-sm text-gray-800">
                          {suggestion.title}
                        </span>
                        <Badge
                          variant={getPriorityColor(suggestion.priority)}
                          size="sm"
                        >
                          {suggestion.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">
                        {suggestion.description}
                      </p>
                      <div className="flex space-x-2">
                        {suggestion.actions.map((action, index) => (
                          <Button
                            key={index}
                            size="sm"
                            variant={action.type === 'dismiss' ? 'ghost' : 'primary'}
                            onClick={() => handleSuggestionAction(suggestion, action)}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => removeSuggestion(suggestion.id)}
                      className="text-gray-400 hover:text-gray-600 ml-2"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    {suggestion.timestamp.toLocaleString()}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Card>
      )}

      {/* System Status */}
      {aiStatus && (
        <Card className="p-3">
          <div className="text-xs text-gray-600 space-y-1">
            <div className="flex justify-between">
              <span>AI Provider:</span>
              <span className="font-medium">
                {aiStatus.ai?.currentProvider}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Voice Processing:</span>
              <span className="font-medium text-green-600">
                ✓ Available
              </span>
            </div>
            <div className="flex justify-between">
              <span>Local AI:</span>
              <span className={`font-medium ${
                aiStatus.ai?.localReady ? 'text-green-600' : 'text-gray-400'
              }`}>
                {aiStatus.ai?.localReady ? '✓ Ready' : '○ Not Available'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>OpenAI:</span>
              <span className={`font-medium ${
                aiStatus.ai?.openaiReady ? 'text-green-600' : 'text-gray-400'
              }`}>
                {aiStatus.ai?.openaiReady ? '✓ Ready' : '○ Not Available'}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* AI Chat Modal */}
      <AIChat
        isOpen={isAIChatOpen}
        onClose={() => setIsAIChatOpen(false)}
      />

      {/* Voice Recorder Modal */}
      <VoiceRecorder
        isOpen={isVoiceRecorderOpen}
        onClose={() => setIsVoiceRecorderOpen(false)}
        onVoiceCommand={handleVoiceCommand}
        isProcessing={isProcessingVoice}
      />
    </div>
  );
};
