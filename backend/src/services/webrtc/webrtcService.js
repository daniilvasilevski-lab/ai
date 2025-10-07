/**
 * WebRTC Service
 * Управление видео/аудио звонками через WebRTC
 */

const fs = require('fs');
const path = require('path');

class WebRTCService {
  constructor() {
    this.activeCalls = new Map(); // callId -> callData
    this.userConnections = new Map(); // userId -> socketId
    this.recordingsPath = path.join(__dirname, '../../../uploads/recordings');
    this.ensureRecordingsDirectory();
  }

  ensureRecordingsDirectory() {
    if (!fs.existsSync(this.recordingsPath)) {
      fs.mkdirSync(this.recordingsPath, { recursive: true });
    }
  }

  /**
   * Initiate a new call
   */
  async initiateCall(callData) {
    const { callId, initiatorId, participants, type, title } = callData;
    
    const call = {
      id: callId,
      initiatorId,
      participants,
      type, // 'audio' | 'video' | 'screen_share'
      title: title || 'Call',
      status: 'initiating',
      startTime: new Date(),
      endTime: null,
      duration: 0,
      recording: null,
      messages: [],
      connectionStatus: {},
    };

    // Initialize connection status for all participants
    participants.forEach(participantId => {
      call.connectionStatus[participantId] = 'pending';
    });

    this.activeCalls.set(callId, call);
    
    console.log(`🎥 Call initiated: ${callId} by user ${initiatorId}`);
    
    return {
      success: true,
      call
    };
  }

  /**
   * Join a call
   */
  async joinCall(callId, userId, socketId) {
    const call = this.activeCalls.get(callId);
    
    if (!call) {
      return { success: false, error: 'Call not found' };
    }

    // Check if user is invited
    if (!call.participants.includes(userId) && call.initiatorId !== userId) {
      return { success: false, error: 'User not invited to this call' };
    }

    // Update connection status
    call.connectionStatus[userId] = 'connected';
    this.userConnections.set(userId, socketId);

    // If all participants connected, mark call as active
    const allConnected = call.participants.every(
      participantId => call.connectionStatus[participantId] === 'connected'
    );

    if (allConnected && call.status === 'initiating') {
      call.status = 'active';
      call.startTime = new Date();
    }

    console.log(`👤 User ${userId} joined call ${callId}`);
    
    return {
      success: true,
      call,
      participantCount: Object.values(call.connectionStatus)
        .filter(status => status === 'connected').length
    };
  }

  /**
   * Leave a call
   */
  async leaveCall(callId, userId) {
    const call = this.activeCalls.get(callId);
    
    if (!call) {
      return { success: false, error: 'Call not found' };
    }

    // Update connection status
    call.connectionStatus[userId] = 'disconnected';
    this.userConnections.delete(userId);

    // Check if call should end (all participants left or only initiator remains)
    const connectedUsers = Object.entries(call.connectionStatus)
      .filter(([_, status]) => status === 'connected')
      .map(([userId, _]) => userId);

    if (connectedUsers.length === 0 || 
        (connectedUsers.length === 1 && connectedUsers[0] === call.initiatorId)) {
      await this.endCall(callId);
    }

    console.log(`👋 User ${userId} left call ${callId}`);
    
    return {
      success: true,
      call,
      participantCount: connectedUsers.length
    };
  }

  /**
   * End a call
   */
  async endCall(callId) {
    const call = this.activeCalls.get(callId);
    
    if (!call) {
      return { success: false, error: 'Call not found' };
    }

    call.status = 'ended';
    call.endTime = new Date();
    call.duration = call.endTime - call.startTime;

    // Save call to history
    await this.saveCallToHistory(call);

    // Clean up active call
    this.activeCalls.delete(callId);

    // Clear user connections for this call
    call.participants.forEach(participantId => {
      this.userConnections.delete(participantId);
    });

    console.log(`📞 Call ended: ${callId}, duration: ${Math.round(call.duration / 1000)}s`);
    
    return {
      success: true,
      call
    };
  }

  /**
   * Start recording a call
   */
  async startRecording(callId) {
    const call = this.activeCalls.get(callId);
    
    if (!call) {
      return { success: false, error: 'Call not found' };
    }

    if (call.recording && call.recording.status === 'recording') {
      return { success: false, error: 'Call is already being recorded' };
    }

    const recordingId = `${callId}_${Date.now()}`;
    const recordingPath = path.join(this.recordingsPath, `${recordingId}.webm`);

    call.recording = {
      id: recordingId,
      path: recordingPath,
      status: 'recording',
      startTime: new Date(),
      endTime: null,
      size: 0
    };

    console.log(`🎬 Recording started for call ${callId}: ${recordingId}`);
    
    return {
      success: true,
      recording: call.recording
    };
  }

  /**
   * Stop recording a call
   */
  async stopRecording(callId) {
    const call = this.activeCalls.get(callId);
    
    if (!call) {
      return { success: false, error: 'Call not found' };
    }

    if (!call.recording || call.recording.status !== 'recording') {
      return { success: false, error: 'No active recording found' };
    }

    call.recording.status = 'completed';
    call.recording.endTime = new Date();

    // Get file size if recording file exists
    try {
      if (fs.existsSync(call.recording.path)) {
        const stats = fs.statSync(call.recording.path);
        call.recording.size = stats.size;
      }
    } catch (error) {
      console.error('Error getting recording file size:', error);
    }

    console.log(`⏹️ Recording stopped for call ${callId}: ${call.recording.id}`);
    
    return {
      success: true,
      recording: call.recording
    };
  }

  /**
   * Save call recording chunk (from WebRTC)
   */
  async saveRecordingChunk(callId, chunk) {
    const call = this.activeCalls.get(callId);
    
    if (!call || !call.recording || call.recording.status !== 'recording') {
      return { success: false, error: 'No active recording' };
    }

    try {
      fs.appendFileSync(call.recording.path, chunk);
      return { success: true };
    } catch (error) {
      console.error('Error saving recording chunk:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get active call by ID
   */
  getActiveCall(callId) {
    const call = this.activeCalls.get(callId);
    return call ? { success: true, call } : { success: false, error: 'Call not found' };
  }

  /**
   * Get all active calls
   */
  getActiveCalls() {
    return {
      success: true,
      calls: Array.from(this.activeCalls.values())
    };
  }

  /**
   * Get user's active calls
   */
  getUserActiveCalls(userId) {
    const userCalls = Array.from(this.activeCalls.values())
      .filter(call => 
        call.participants.includes(userId) || call.initiatorId === userId
      );
    
    return {
      success: true,
      calls: userCalls
    };
  }

  /**
   * Handle WebRTC signaling
   */
  async handleSignaling(data) {
    const { callId, type, userId, payload } = data;
    
    const call = this.activeCalls.get(callId);
    if (!call) {
      return { success: false, error: 'Call not found' };
    }

    // Add signaling message to call messages
    const message = {
      type,
      userId,
      payload,
      timestamp: new Date()
    };

    call.messages.push(message);

    return {
      success: true,
      message,
      call
    };
  }

  /**
   * Save call to history
   */
  async saveCallToHistory(call) {
    try {
      const historyPath = path.join(this.recordingsPath, 'call_history.json');
      let history = [];
      
      if (fs.existsSync(historyPath)) {
        const existing = fs.readFileSync(historyPath, 'utf8');
        history = JSON.parse(existing);
      }
      
      // Prepare call data for storage
      const callHistory = {
        id: call.id,
        initiatorId: call.initiatorId,
        participants: call.participants,
        type: call.type,
        title: call.title,
        startTime: call.startTime,
        endTime: call.endTime,
        duration: call.duration,
        recording: call.recording,
        participantCount: call.participants.length,
        status: call.status
      };
      
      history.push(callHistory);
      
      // Keep only last 100 calls
      if (history.length > 100) {
        history = history.slice(-100);
      }
      
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
      
      return { success: true };
    } catch (error) {
      console.error('Failed to save call history:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get call history
   */
  async getCallHistory(userId, limit = 20) {
    try {
      const historyPath = path.join(this.recordingsPath, 'call_history.json');
      
      if (!fs.existsSync(historyPath)) {
        return { success: true, calls: [] };
      }
      
      const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      
      // Filter calls for user and apply limit
      const userCalls = history
        .filter(call => 
          call.participants.includes(userId) || call.initiatorId === userId
        )
        .slice(-limit)
        .reverse();
      
      return {
        success: true,
        calls: userCalls
      };
    } catch (error) {
      console.error('Failed to get call history:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get call recording
   */
  async getCallRecording(callId) {
    try {
      // First check active calls
      const call = this.activeCalls.get(callId);
      if (call && call.recording) {
        return {
          success: true,
          recording: call.recording
        };
      }

      // Check call history
      const historyPath = path.join(this.recordingsPath, 'call_history.json');
      if (fs.existsSync(historyPath)) {
        const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        const historicalCall = history.find(c => c.id === callId);
        
        if (historicalCall && historicalCall.recording) {
          return {
            success: true,
            recording: historicalCall.recording
          };
        }
      }

      return { success: false, error: 'Recording not found' };
    } catch (error) {
      console.error('Error getting call recording:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete call recording
   */
  async deleteRecording(callId) {
    try {
      const recordingResult = await this.getCallRecording(callId);
      
      if (!recordingResult.success) {
        return { success: false, error: 'Recording not found' };
      }

      const recording = recordingResult.recording;
      
      // Delete recording file
      if (fs.existsSync(recording.path)) {
        fs.unlinkSync(recording.path);
      }

      // Update history to remove recording reference
      const historyPath = path.join(this.recordingsPath, 'call_history.json');
      if (fs.existsSync(historyPath)) {
        const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        const callIndex = history.findIndex(c => c.id === callId);
        
        if (callIndex !== -1) {
          history[callIndex].recording = null;
          fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
        }
      }

      console.log(`🗑️ Recording deleted for call ${callId}`);
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting recording:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      activeCalls: this.activeCalls.size,
      connectedUsers: this.userConnections.size,
      recordingsPath: this.recordingsPath,
      capabilities: [
        'audio_calls',
        'video_calls',
        'screen_sharing',
        'call_recording',
        'webrtc_signaling'
      ]
    };
  }
}

module.exports = new WebRTCService();
