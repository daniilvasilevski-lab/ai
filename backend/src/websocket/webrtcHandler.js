/**
 * WebRTC WebSocket Handler
 * Обрабатывает WebRTC сигналинг через WebSocket
 */

const webrtcService = require('../services/webrtc/webrtcService');
const voiceService = require('../services/ai/voiceService');

class WebRTCHandler {
  constructor(io) {
    this.io = io;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔗 WebSocket connected: ${socket.id}`);

      // Call initiation
      socket.on('call:initiate', async (data) => {
        try {
          const { participants, type, title } = data;
          const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const initiatorId = socket.userId;

          const result = await webrtcService.initiateCall({
            callId,
            initiatorId,
            participants,
            type: type || 'audio',
            title
          });

          if (result.success) {
            socket.join(callId);
            socket.emit('call:initiated', {
              success: true,
              call: result.call
            });

            // Notify participants about incoming call
            participants.forEach(participantId => {
              socket.to(`user_${participantId}`).emit('call:incoming', {
                call: result.call,
                from: socket.userInfo
              });
            });

            console.log(`📞 Call initiated: ${callId} by ${initiatorId}`);
          } else {
            socket.emit('call:error', { error: result.error });
          }
        } catch (error) {
          console.error('Call initiation error:', error);
          socket.emit('call:error', { error: 'Failed to initiate call' });
        }
      });

      // Join call
      socket.on('call:join', async (data) => {
        try {
          const { callId } = data;
          const userId = socket.userId;

          const result = await webrtcService.joinCall(callId, userId, socket.id);

          if (result.success) {
            socket.join(callId);
            
            // Notify user about successful join
            socket.emit('call:joined', {
              success: true,
              call: result.call,
              participantCount: result.participantCount
            });

            // Notify other participants
            socket.to(callId).emit('call:participant-joined', {
              userId,
              userInfo: socket.userInfo,
              call: result.call
            });

            console.log(`👤 User ${userId} joined call ${callId}`);
          } else {
            socket.emit('call:error', { error: result.error });
          }
        } catch (error) {
          console.error('Call join error:', error);
          socket.emit('call:error', { error: 'Failed to join call' });
        }
      });

      // Leave call
      socket.on('call:leave', async (data) => {
        try {
          const { callId } = data;
          const userId = socket.userId;

          const result = await webrtcService.leaveCall(callId, userId);

          if (result.success) {
            socket.leave(callId);
            
            socket.emit('call:left', {
              success: true,
              call: result.call
            });

            // Notify other participants
            socket.to(callId).emit('call:participant-left', {
              userId,
              userInfo: socket.userInfo,
              call: result.call,
              participantCount: result.participantCount
            });

            console.log(`👋 User ${userId} left call ${callId}`);
          } else {
            socket.emit('call:error', { error: result.error });
          }
        } catch (error) {
          console.error('Call leave error:', error);
          socket.emit('call:error', { error: 'Failed to leave call' });
        }
      });

      // End call
      socket.on('call:end', async (data) => {
        try {
          const { callId } = data;
          const userId = socket.userId;

          const callResult = webrtcService.getActiveCall(callId);
          if (!callResult.success) {
            socket.emit('call:error', { error: 'Call not found' });
            return;
          }

          // Only initiator can end call
          if (callResult.call.initiatorId !== userId) {
            socket.emit('call:error', { error: 'Only call initiator can end the call' });
            return;
          }

          const result = await webrtcService.endCall(callId);

          if (result.success) {
            // Notify all participants
            this.io.to(callId).emit('call:ended', {
              call: result.call,
              endedBy: socket.userInfo
            });

            console.log(`📞 Call ended: ${callId} by ${userId}`);
          } else {
            socket.emit('call:error', { error: result.error });
          }
        } catch (error) {
          console.error('Call end error:', error);
          socket.emit('call:error', { error: 'Failed to end call' });
        }
      });

      // WebRTC signaling
      socket.on('webrtc:signal', async (data) => {
        try {
          const { callId, type, targetUserId, payload } = data;
          const userId = socket.userId;

          const result = await webrtcService.handleSignaling({
            callId,
            type,
            userId,
            payload
          });

          if (result.success) {
            // Forward signaling message to target user or all participants
            if (targetUserId) {
              socket.to(`user_${targetUserId}`).emit('webrtc:signal', {
                callId,
                type,
                fromUserId: userId,
                payload
              });
            } else {
              socket.to(callId).emit('webrtc:signal', {
                callId,
                type,
                fromUserId: userId,
                payload
              });
            }
          }
        } catch (error) {
          console.error('WebRTC signaling error:', error);
          socket.emit('webrtc:error', { error: 'Signaling failed' });
        }
      });

      // Start recording
      socket.on('call:start-recording', async (data) => {
        try {
          const { callId } = data;
          const userId = socket.userId;

          const callResult = webrtcService.getActiveCall(callId);
          if (!callResult.success) {
            socket.emit('call:error', { error: 'Call not found' });
            return;
          }

          // Only initiator can start recording (you can modify this logic)
          if (callResult.call.initiatorId !== userId) {
            socket.emit('call:error', { error: 'Only call initiator can start recording' });
            return;
          }

          const result = await webrtcService.startRecording(callId);

          if (result.success) {
            // Notify all participants about recording
            this.io.to(callId).emit('call:recording-started', {
              recording: result.recording,
              startedBy: socket.userInfo
            });

            console.log(`🎬 Recording started for call ${callId}`);
          } else {
            socket.emit('call:error', { error: result.error });
          }
        } catch (error) {
          console.error('Recording start error:', error);
          socket.emit('call:error', { error: 'Failed to start recording' });
        }
      });

      // Stop recording
      socket.on('call:stop-recording', async (data) => {
        try {
          const { callId } = data;
          const userId = socket.userId;

          const callResult = webrtcService.getActiveCall(callId);
          if (!callResult.success) {
            socket.emit('call:error', { error: 'Call not found' });
            return;
          }

          // Only initiator can stop recording
          if (callResult.call.initiatorId !== userId) {
            socket.emit('call:error', { error: 'Only call initiator can stop recording' });
            return;
          }

          const result = await webrtcService.stopRecording(callId);

          if (result.success) {
            // Notify all participants
            this.io.to(callId).emit('call:recording-stopped', {
              recording: result.recording,
              stoppedBy: socket.userInfo
            });

            // Automatically analyze the recording with AI
            if (result.recording && result.recording.path) {
              this.analyzeCallRecording(callId, result.recording, callResult.call);
            }

            console.log(`⏹️ Recording stopped for call ${callId}`);
          } else {
            socket.emit('call:error', { error: result.error });
          }
        } catch (error) {
          console.error('Recording stop error:', error);
          socket.emit('call:error', { error: 'Failed to stop recording' });
        }
      });

      // Recording data chunks (from client-side MediaRecorder)
      socket.on('call:recording-chunk', async (data) => {
        try {
          const { callId, chunk } = data;

          const result = await webrtcService.saveRecordingChunk(callId, chunk);
          
          if (!result.success) {
            socket.emit('call:error', { error: result.error });
          }
        } catch (error) {
          console.error('Recording chunk error:', error);
        }
      });

      // Get active calls
      socket.on('calls:get-active', async () => {
        try {
          const userId = socket.userId;
          const result = webrtcService.getUserActiveCalls(userId);
          
          socket.emit('calls:active', {
            success: result.success,
            calls: result.calls
          });
        } catch (error) {
          console.error('Get active calls error:', error);
          socket.emit('calls:error', { error: 'Failed to get active calls' });
        }
      });

      // Get call history
      socket.on('calls:get-history', async (data) => {
        try {
          const userId = socket.userId;
          const limit = data?.limit || 20;
          
          const result = await webrtcService.getCallHistory(userId, limit);
          
          socket.emit('calls:history', {
            success: result.success,
            calls: result.calls
          });
        } catch (error) {
          console.error('Get call history error:', error);
          socket.emit('calls:error', { error: 'Failed to get call history' });
        }
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        try {
          const userId = socket.userId;
          if (!userId) return;

          // Find and leave all active calls for this user
          const result = webrtcService.getUserActiveCalls(userId);
          
          if (result.success && result.calls.length > 0) {
            for (const call of result.calls) {
              await webrtcService.leaveCall(call.id, userId);
              
              // Notify other participants
              socket.to(call.id).emit('call:participant-left', {
                userId,
                userInfo: socket.userInfo,
                reason: 'disconnect'
              });
            }
          }

          console.log(`🔌 WebSocket disconnected: ${socket.id}, user: ${userId}`);
        } catch (error) {
          console.error('Disconnect handling error:', error);
        }
      });
    });
  }

  /**
   * Automatically analyze call recording with AI
   */
  async analyzeCallRecording(callId, recording, call) {
    try {
      console.log(`🤖 Starting AI analysis for call ${callId}`);
      
      const participants = [call.initiatorId, ...call.participants]
        .map(id => `User ${id}`); // TODO: Get real user names

      // Process the recording with AI
      const audioFile = {
        path: recording.path,
        duration: Math.round((recording.endTime - recording.startTime) / 1000)
      };

      const analysisResult = await voiceService.processCallRecording(
        callId,
        audioFile,
        participants
      );

      if (analysisResult.success) {
        // Notify all call participants about the analysis
        this.io.emit('call:analysis-complete', {
          callId,
          analysis: analysisResult.analysis,
          participants: [call.initiatorId, ...call.participants]
        });

        console.log(`✅ AI analysis completed for call ${callId}`);
      } else {
        console.error(`❌ AI analysis failed for call ${callId}:`, analysisResult.error);
      }
    } catch (error) {
      console.error('Auto analysis error:', error);
    }
  }

  /**
   * Broadcast to specific user
   */
  broadcastToUser(userId, event, data) {
    this.io.to(`user_${userId}`).emit(event, data);
  }

  /**
   * Broadcast to all participants of a call
   */
  broadcastToCall(callId, event, data) {
    this.io.to(callId).emit(event, data);
  }

  /**
   * Get WebRTC service status
   */
  getStatus() {
    return webrtcService.getStatus();
  }
}

module.exports = WebRTCHandler;
