import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Settings, Brain, HelpCircle, Volume2 } from 'lucide-react';
import { Button, Input, Modal, Badge } from '@/components/ui';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
import { aiService, AIResponse } from '@/services/aiService';
import { useAuthStore } from '../../store/auth';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  isVoice?: boolean;
  transcript?: string;
  functionCall?: any;
  requiresConfirmation?: boolean;
  provider?: 'local' | 'openai';
}

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIChat: React.FC<AIChatProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceRecorderOpen, setIsVoiceRecorderOpen] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [aiStatus, setAIStatus] = useState<any>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    if (isOpen) {
      loadAIStatus();
      // Add welcome message
      setMessages([{
        id: 'welcome',
        type: 'system',
        content: 'Welcome to AI Assistant! I can help you create tasks, schedule meetings, and analyze calls. Type a message or use voice commands.',
        timestamp: new Date()
      }]);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadAIStatus = async () => {
    try {
      const status = await aiService.getStatus();
      setAIStatus(status);
    } catch (error) {
      console.error('Failed to load AI status:', error);
    }
  };

  const sendMessage = async (content: string, isVoice = false, transcript?: string) => {
    if (!content.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: isVoice ? (transcript || content) : content,
      timestamp: new Date(),
      isVoice,
      transcript: isVoice ? transcript : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response: AIResponse = await aiService.sendMessage(content, {
        user,
        language: 'ru',
        teamMembers: [], // TODO: Get from context
      });

      const aiMessage: ChatMessage = {
        id: Date.now().toString() + '_ai',
        type: 'ai',
        content: aiService.formatResponse(response),
        timestamp: new Date(),
        functionCall: response.functionCall,
        requiresConfirmation: response.requiresConfirmation,
        provider: response.provider
      };

      setMessages(prev => [...prev, aiMessage]);

      // If AI wants to execute a function, show confirmation
      if (response.functionCall && response.requiresConfirmation) {
        showFunctionConfirmation(response.functionCall);
      }

    } catch (error) {
      console.error('AI message error:', error);
      const errorMessage: ChatMessage = {
        id: Date.now().toString() + '_error',
        type: 'system',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceCommand = async (audioBlob: Blob) => {
    setIsProcessingVoice(true);
    
    try {
      const result = await aiService.processVoiceCommand(audioBlob, {
        user,
        language: 'ru'
      });

      if (result.success && result.transcript) {
        // Send the transcribed text as a message
        await sendMessage(result.transcript, true, result.transcript);
      } else {
        const errorMessage: ChatMessage = {
          id: Date.now().toString() + '_voice_error',
          type: 'system',
          content: 'Sorry, I could not process your voice command. Please try again.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Voice command error:', error);
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const showFunctionConfirmation = (functionCall: any) => {
    const confirmationMessage: ChatMessage = {
      id: Date.now().toString() + '_confirm',
      type: 'system',
      content: `Do you want me to ${functionCall.name.replace('_', ' ')}? Click Confirm to proceed.`,
      timestamp: new Date(),
      functionCall,
      requiresConfirmation: true
    };
    setMessages(prev => [...prev, confirmationMessage]);
  };

  const confirmFunction = async (functionCall: any) => {
    setIsLoading(true);
    
    try {
      const result = await aiService.executeFunction(
        functionCall.name,
        functionCall.arguments
      );

      const successMessage: ChatMessage = {
        id: Date.now().toString() + '_success',
        type: 'system',
        content: result.data?.message || 'Function executed successfully!',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, successMessage]);

    } catch (error) {
      console.error('Function execution error:', error);
      const errorMessage: ChatMessage = {
        id: Date.now().toString() + '_func_error',
        type: 'system',
        content: 'Failed to execute function. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const switchProvider = async (provider: 'local' | 'openai') => {
    try {
      const result = await aiService.switchProvider(provider);
      if (result.success) {
        setAIStatus((prev: any) => ({
          ...prev,
          ai: { ...prev.ai, currentProvider: provider }
        }));
        
        const systemMessage: ChatMessage = {
          id: Date.now().toString() + '_provider',
          type: 'system',
          content: `AI provider switched to ${provider}. ${provider === 'local' ? 'Enhanced privacy mode.' : 'Advanced features enabled.'}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, systemMessage]);
      }
    } catch (error) {
      console.error('Provider switch error:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <div className="flex items-center space-x-2">
            <Brain className="h-5 w-5 text-primary-500" />
            <span>AI Assistant</span>
            {aiStatus && (
              <Badge 
                variant={aiStatus.ai.currentProvider === 'local' ? 'warning' : 'success'}
                size="sm"
              >
                {aiStatus.ai.currentProvider}
              </Badge>
            )}
          </div>
        }
        size="xl"
        footer={
          <div className="flex space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHelp(true)}
              leftIcon={<HelpCircle className="h-4 w-4" />}
            >
              Help
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(true)}
              leftIcon={<Settings className="h-4 w-4" />}
            >
              Settings
            </Button>
          </div>
        }
      >
        <div className="flex flex-col h-[500px]">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 p-4 bg-gray-50 rounded-lg">
            <AnimatePresence>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={`flex ${
                    message.type === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.type === 'user'
                        ? 'bg-primary-500 text-white'
                        : message.type === 'ai'
                        ? 'bg-white border border-primary-200'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    <div className="flex items-start space-x-2">
                      {message.isVoice && message.type === 'user' && (
                        <Volume2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm">{message.content}</p>
                        {message.provider && (
                          <p className="text-xs mt-1 opacity-70">
                            via {message.provider}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {message.requiresConfirmation && message.functionCall && (
                      <div className="mt-3 flex space-x-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => confirmFunction(message.functionCall)}
                        >
                          Confirm
                        </Button>
                        <Button size="sm" variant="ghost">
                          Cancel
                        </Button>
                      </div>
                    )}
                    
                    <p className="text-xs mt-1 opacity-70">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="bg-white border border-primary-200 p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500"></div>
                    <span className="text-sm text-gray-600">AI is thinking...</span>
                  </div>
                </div>
              </motion.div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex space-x-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message or question..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={() => sendMessage(inputValue)}
                disabled={isLoading || !inputValue.trim()}
                leftIcon={<Send className="h-4 w-4" />}
              >
                Send
              </Button>
              <Button
                variant="secondary"
                onClick={() => setIsVoiceRecorderOpen(true)}
                disabled={isLoading}
                leftIcon={<Mic className="h-4 w-4" />}
              >
                Voice
              </Button>
            </div>
            
            <div className="text-xs text-gray-500">
              💡 Try: "Create task for John", "Schedule meeting tomorrow", or use voice commands
            </div>
          </div>
        </div>
      </Modal>

      {/* Voice Recorder Modal */}
      <VoiceRecorder
        isOpen={isVoiceRecorderOpen}
        onClose={() => setIsVoiceRecorderOpen(false)}
        onVoiceCommand={handleVoiceCommand}
        isProcessing={isProcessingVoice}
      />

      {/* Settings Modal */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="AI Settings"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              AI Provider
            </label>
            <div className="flex space-x-2">
              <Button
                variant={aiStatus?.ai.currentProvider === 'local' ? 'primary' : 'ghost'}
                onClick={() => switchProvider('local')}
                disabled={!aiStatus?.ai.localReady}
              >
                Local (Private)
              </Button>
              <Button
                variant={aiStatus?.ai.currentProvider === 'openai' ? 'primary' : 'ghost'}
                onClick={() => switchProvider('openai')}
                disabled={!aiStatus?.ai.openaiReady}
              >
                GPT-4 (Advanced)
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Local: Enhanced privacy, basic features. GPT-4: Advanced AI capabilities.
            </p>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">System Status</h4>
            <div className="text-xs space-y-1">
              <p>Local AI: {aiStatus?.ai.localReady ? '✅ Ready' : '❌ Not Available'}</p>
              <p>OpenAI: {aiStatus?.ai.openaiReady ? '✅ Ready' : '❌ Not Available'}</p>
              <p>Voice Processing: ✅ Available</p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Help Modal */}
      <Modal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="Voice Commands Help"
        size="lg"
      >
        <div className="space-y-4">
          {aiService.getVoiceCommandsHelp().map((category, index) => (
            <div key={index}>
              <h4 className="font-medium text-gray-800 mb-2">{category.category}</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                {category.commands.map((command, cmdIndex) => (
                  <li key={cmdIndex}>"{command}"</li>
                ))}
              </ul>
            </div>
          ))}
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">Tips for Voice Commands</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-blue-700">
              <li>Speak clearly and at moderate speed</li>
              <li>Use names when assigning tasks or scheduling meetings</li>
              <li>Include time references (tomorrow, Monday, etc.)</li>
              <li>Specify priority levels (high, urgent, low)</li>
            </ul>
          </div>
        </div>
      </Modal>
    </>
  );
};
