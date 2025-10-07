export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager' | 'user';
  avatar?: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assigneeId: string;
  assignee?: User;
  creatorId: string;
  creator?: User;
  status: 'awaiting_assignee_confirmation' | 'confirmed' | 'in_progress' | 'completed' | 'rejected';
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  responses: TaskResponse[];
}

export interface TaskResponse {
  id: string;
  taskId: string;
  userId: string;
  user?: User;
  type: 'confirmation' | 'rejection' | 'comment';
  comment?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  sender?: User;
  receiverId?: string;
  receiver?: User;
  channelId?: string;
  content: string;
  type: 'text' | 'file' | 'image' | 'voice' | 'system';
  attachments?: Attachment[];
  replyToId?: string;
  replyTo?: Message;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  type: 'direct' | 'group' | 'public';
  creatorId: string;
  creator?: User;
  members: User[];
  lastMessage?: Message;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  organizerId: string;
  organizer?: User;
  participants: User[];
  startTime: string;
  endTime: string;
  location?: string;
  meetingUrl?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  agenda?: string;
  recordingUrl?: string;
  transcriptUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'task_assigned' | 'task_confirmed' | 'task_rejected' | 'message' | 'meeting' | 'system';
  title: string;
  message: string;
  data?: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

export interface VoiceCommand {
  id: string;
  userId: string;
  user?: User;
  transcript: string;
  intent: string;
  entities: Record<string, any>;
  confidence: number;
  action: 'create_task' | 'schedule_meeting' | 'send_message' | 'unknown';
  result?: string;
  createdAt: string;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Form types
export interface LoginForm {
  email: string;
  password: string;
}

export interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
}

export interface CreateTaskForm {
  title: string;
  description?: string;
  assigneeId: string;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
}

export interface TaskResponseForm {
  type: 'confirmation' | 'rejection';
  comment?: string;
}

export interface CreateMeetingForm {
  title: string;
  description?: string;
  participantIds: string[];
  startTime: string;
  endTime: string;
  location?: string;
  agenda?: string;
}

export interface SendMessageForm {
  content: string;
  receiverId?: string;
  channelId?: string;
  attachments?: File[];
}

// Store types
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterForm) => Promise<void>;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export interface TaskState {
  tasks: Task[];
  currentTask: Task | null;
  isLoading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  createTask: (task: CreateTaskForm) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  respondToTask: (id: string, response: TaskResponseForm) => Promise<Task>;
}

export interface ChatState {
  messages: Record<string, Message[]>;
  channels: Channel[];
  activeChannelId: string | null;
  isLoading: boolean;
  sendMessage: (message: SendMessageForm) => Promise<void>;
  loadMessages: (channelId: string) => Promise<void>;
  markAsRead: (channelId: string) => Promise<void>;
}

export interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

// WebSocket types
export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: string;
}

export interface SocketEvents {
  'task:created': (task: Task) => void;
  'task:updated': (task: Task) => void;
  'task:response': (response: TaskResponse) => void;
  'message:new': (message: Message) => void;
  'notification:new': (notification: Notification) => void;
  'user:status': (data: { userId: string; status: string }) => void;
  'meeting:reminder': (meeting: Meeting) => void;
}

// Utility types
export type Status = 'idle' | 'loading' | 'success' | 'error';

export interface FilterOptions {
  status?: string[];
  priority?: string[];
  assignee?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface TableColumn<T = any> {
  key: keyof T;
  title: string;
  sortable?: boolean;
  render?: (value: any, record: T) => React.ReactNode;
}

