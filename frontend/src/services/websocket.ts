import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '@/types';

class WebSocketService {
  private socket: Socket | null = null;
  private url: string;
  private token: string | null = null;

  constructor() {
    this.url = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
  }

  connect(token: string): void {
    this.token = token;
    
    if (this.socket?.connected) {
      this.disconnect();
    }

    this.socket = io(this.url, {
      auth: {
        token: this.token,
      },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Event listeners
  on(event: string, callback: (...args: any[]) => void): void {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: any[]) => void): void {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }

  // Emit events
  emit(event: string, data?: any): void {
    this.socket?.emit(event, data);
  }

  // Join/leave rooms
  joinRoom(room: string): void {
    this.socket?.emit('join', room);
  }

  leaveRoom(room: string): void {
    this.socket?.emit('leave', room);
  }

  // User status
  updateStatus(status: 'online' | 'offline' | 'busy' | 'away'): void {
    this.socket?.emit('user:status', { status });
  }

  // Typing indicators
  startTyping(channelId: string): void {
    this.socket?.emit('typing:start', { channelId });
  }

  stopTyping(channelId: string): void {
    this.socket?.emit('typing:stop', { channelId });
  }

  // Send message
  sendMessage(data: { channelId?: string; receiverId?: string; content: string }): void {
    this.socket?.emit('message:send', data);
  }

  // Task events
  createTask(taskData: any): void {
    this.socket?.emit('task:create', taskData);
  }

  updateTask(taskId: string, updates: any): void {
    this.socket?.emit('task:update', { taskId, updates });
  }

  respondToTask(taskId: string, response: any): void {
    this.socket?.emit('task:respond', { taskId, response });
  }

  // Meeting events
  joinMeeting(meetingId: string): void {
    this.socket?.emit('meeting:join', { meetingId });
  }

  leaveMeeting(meetingId: string): void {
    this.socket?.emit('meeting:leave', { meetingId });
  }

  // Voice commands
  sendVoiceCommand(transcript: string): void {
    this.socket?.emit('voice:command', { transcript });
  }

  // Notifications
  markNotificationRead(notificationId: string): void {
    this.socket?.emit('notification:read', { notificationId });
  }

  // Get socket instance for advanced usage
  getSocket(): Socket | null {
    return this.socket;
  }
}

export const websocketService = new WebSocketService();
export default websocketService;

