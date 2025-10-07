/**
 * Calendar Service
 * Собственный календарь с планированием встреч и AI интеграцией
 */

const fs = require('fs');
const path = require('path');

class CalendarService {
  constructor() {
    this.calendarsPath = path.join(__dirname, '../../../uploads/calendars');
    this.eventsPath = path.join(this.calendarsPath, 'events.json');
    this.conflictsPath = path.join(this.calendarsPath, 'conflicts.json');
    this.ensureCalendarsDirectory();
  }

  ensureCalendarsDirectory() {
    if (!fs.existsSync(this.calendarsPath)) {
      fs.mkdirSync(this.calendarsPath, { recursive: true });
    }
  }

  /**
   * Create a new calendar event
   */
  async createEvent(eventData) {
    try {
      const {
        title,
        description,
        startTime,
        endTime,
        organizerId,
        participants,
        type = 'meeting',
        location,
        isRecurring = false,
        recurrencePattern,
        priority = 'medium'
      } = eventData;

      // Validate event data
      if (!title || !startTime || !endTime || !organizerId) {
        return {
          success: false,
          error: 'Missing required event data'
        };
      }

      // Check for conflicts
      const conflicts = await this.checkConflicts(startTime, endTime, participants || []);
      
      const event = {
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title,
        description: description || '',
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        organizerId,
        participants: participants || [],
        type,
        location: location || 'Online',
        priority,
        status: 'scheduled',
        isRecurring,
        recurrencePattern,
        createdAt: new Date(),
        updatedAt: new Date(),
        responses: {},
        conflicts: conflicts.conflicts,
        hasConflicts: conflicts.hasConflicts
      };

      // Initialize participant responses
      event.participants.forEach(participantId => {
        event.responses[participantId] = 'pending';
      });

      // Save event
      await this.saveEvent(event);

      // Log conflicts if any
      if (conflicts.hasConflicts) {
        console.warn(`⚠️ Event created with conflicts: ${event.id}`);
        await this.logConflict(event, conflicts.conflicts);
      }

      console.log(`📅 Calendar event created: ${event.title} (${event.id})`);

      return {
        success: true,
        event,
        conflicts: conflicts.conflicts
      };

    } catch (error) {
      console.error('Calendar event creation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update calendar event
   */
  async updateEvent(eventId, updates) {
    try {
      const event = await this.getEventById(eventId);
      
      if (!event) {
        return {
          success: false,
          error: 'Event not found'
        };
      }

      // Check for conflicts if time is being updated
      let conflicts = { hasConflicts: false, conflicts: [] };
      if (updates.startTime || updates.endTime) {
        const startTime = updates.startTime || event.startTime;
        const endTime = updates.endTime || event.endTime;
        conflicts = await this.checkConflicts(startTime, endTime, event.participants, eventId);
      }

      // Update event
      const updatedEvent = {
        ...event,
        ...updates,
        updatedAt: new Date(),
        conflicts: conflicts.conflicts,
        hasConflicts: conflicts.hasConflicts
      };

      await this.saveEvent(updatedEvent);

      console.log(`📅 Calendar event updated: ${eventId}`);

      return {
        success: true,
        event: updatedEvent,
        conflicts: conflicts.conflicts
      };

    } catch (error) {
      console.error('Calendar event update error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete calendar event
   */
  async deleteEvent(eventId, userId) {
    try {
      const event = await this.getEventById(eventId);
      
      if (!event) {
        return {
          success: false,
          error: 'Event not found'
        };
      }

      // Only organizer can delete events
      if (event.organizerId !== userId) {
        return {
          success: false,
          error: 'Only event organizer can delete events'
        };
      }

      // Mark as cancelled instead of deleting
      const cancelledEvent = {
        ...event,
        status: 'cancelled',
        updatedAt: new Date(),
        cancelledBy: userId
      };

      await this.saveEvent(cancelledEvent);

      console.log(`🗑️ Calendar event cancelled: ${eventId}`);

      return {
        success: true,
        event: cancelledEvent
      };

    } catch (error) {
      console.error('Calendar event deletion error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Respond to calendar event invitation
   */
  async respondToEvent(eventId, userId, response, note = '') {
    try {
      const event = await this.getEventById(eventId);
      
      if (!event) {
        return {
          success: false,
          error: 'Event not found'
        };
      }

      // Check if user is invited
      if (!event.participants.includes(userId) && event.organizerId !== userId) {
        return {
          success: false,
          error: 'User not invited to this event'
        };
      }

      // Update response
      event.responses[userId] = {
        response, // 'accepted', 'declined', 'tentative'
        note,
        respondedAt: new Date()
      };

      event.updatedAt = new Date();

      await this.saveEvent(event);

      console.log(`✉️ Event response: ${userId} ${response} event ${eventId}`);

      return {
        success: true,
        event,
        response: event.responses[userId]
      };

    } catch (error) {
      console.error('Calendar event response error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get user's calendar events
   */
  async getUserEvents(userId, startDate, endDate, status = null) {
    try {
      const allEvents = await this.loadAllEvents();
      
      const start = new Date(startDate);
      const end = new Date(endDate);

      const userEvents = allEvents.filter(event => {
        // Check if user is organizer or participant
        const isUserInvolved = event.organizerId === userId || 
                              event.participants.includes(userId);
        
        if (!isUserInvolved) return false;

        // Check date range
        const eventStart = new Date(event.startTime);
        const eventEnd = new Date(event.endTime);
        
        const inDateRange = eventStart <= end && eventEnd >= start;
        
        if (!inDateRange) return false;

        // Check status filter
        if (status && event.status !== status) return false;

        return true;
      });

      return {
        success: true,
        events: userEvents.sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
      };

    } catch (error) {
      console.error('Get user events error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check for scheduling conflicts
   */
  async checkConflicts(startTime, endTime, participants, excludeEventId = null) {
    try {
      const allEvents = await this.loadAllEvents();
      const start = new Date(startTime);
      const end = new Date(endTime);
      
      const conflicts = [];

      for (const event of allEvents) {
        // Skip cancelled events and the event being updated
        if (event.status === 'cancelled' || event.id === excludeEventId) {
          continue;
        }

        const eventStart = new Date(event.startTime);
        const eventEnd = new Date(event.endTime);

        // Check time overlap
        if (start < eventEnd && end > eventStart) {
          // Check participant overlap
          const conflictingParticipants = participants.filter(p => 
            event.participants.includes(p) || event.organizerId === p
          );

          if (conflictingParticipants.length > 0) {
            conflicts.push({
              eventId: event.id,
              eventTitle: event.title,
              eventStart: event.startTime,
              eventEnd: event.endTime,
              conflictingParticipants
            });
          }
        }
      }

      return {
        hasConflicts: conflicts.length > 0,
        conflicts
      };

    } catch (error) {
      console.error('Conflict check error:', error);
      return {
        hasConflicts: false,
        conflicts: [],
        error: error.message
      };
    }
  }

  /**
   * Find available time slots for participants
   */
  async findAvailableSlots(participants, duration, startDate, endDate, workingHours = { start: 9, end: 17 }) {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const durationMs = duration * 60 * 1000; // Convert minutes to milliseconds
      
      const availableSlots = [];
      const allEvents = await this.loadAllEvents();

      // Get all participants' events in the date range
      const participantEvents = allEvents.filter(event => 
        event.status !== 'cancelled' &&
        participants.some(p => event.participants.includes(p) || event.organizerId === p)
      ).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

      // Check each day in the range
      const currentDate = new Date(start);
      while (currentDate <= end) {
        // Skip weekends (can be configured)
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
          const daySlots = this.findDayAvailableSlots(
            currentDate, 
            participantEvents,
            duration,
            workingHours
          );
          availableSlots.push(...daySlots);
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return {
        success: true,
        availableSlots: availableSlots.slice(0, 20) // Limit to 20 slots
      };

    } catch (error) {
      console.error('Find available slots error:', error);
      return {
        success: false,
        error: error.message,
        availableSlots: []
      };
    }
  }

  /**
   * AI-powered meeting suggestions
   */
  async suggestMeetingTimes(participants, duration, preferences = {}) {
    try {
      console.log(`🤖 AI suggesting meeting times for ${participants.length} participants`);

      const {
        preferredDays = [1, 2, 3, 4, 5], // Monday to Friday
        preferredHours = { start: 9, end: 17 },
        timeZone = 'UTC',
        priority = 'medium'
      } = preferences;

      // Get next 14 days
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 14);

      const availableSlots = await this.findAvailableSlots(
        participants, 
        duration, 
        startDate, 
        endDate, 
        preferredHours
      );

      if (!availableSlots.success) {
        throw new Error('Failed to find available slots');
      }

      // Score and rank suggestions based on preferences
      const scoredSlots = availableSlots.availableSlots.map(slot => {
        let score = 100; // Base score
        
        const slotDate = new Date(slot.start);
        const dayOfWeek = slotDate.getDay();
        const hour = slotDate.getHours();

        // Prefer preferred days
        if (preferredDays.includes(dayOfWeek)) score += 20;
        
        // Prefer mid-morning and early afternoon
        if (hour >= 10 && hour <= 11) score += 15;
        else if (hour >= 14 && hour <= 15) score += 10;
        else if (hour === 9 || hour === 16) score += 5;
        
        // Avoid very early morning or late afternoon
        if (hour <= 8 || hour >= 17) score -= 10;
        
        // Prefer sooner dates for high priority
        if (priority === 'high') {
          const daysFromNow = Math.ceil((slotDate - new Date()) / (1000 * 60 * 60 * 24));
          score += Math.max(0, 10 - daysFromNow);
        }

        return { ...slot, score };
      });

      // Sort by score and return top suggestions
      const topSuggestions = scoredSlots
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      return {
        success: true,
        suggestions: topSuggestions,
        totalSlots: availableSlots.availableSlots.length
      };

    } catch (error) {
      console.error('AI meeting suggestion error:', error);
      return {
        success: false,
        error: error.message,
        suggestions: []
      };
    }
  }

  /**
   * Get calendar statistics
   */
  async getCalendarStats(userId, startDate, endDate) {
    try {
      const userEvents = await this.getUserEvents(userId, startDate, endDate);
      
      if (!userEvents.success) {
        throw new Error('Failed to get user events');
      }

      const events = userEvents.events;
      const totalEvents = events.length;
      const totalDuration = events.reduce((sum, event) => {
        const duration = new Date(event.endTime) - new Date(event.startTime);
        return sum + duration;
      }, 0);

      const stats = {
        totalEvents,
        totalHours: Math.round(totalDuration / (1000 * 60 * 60) * 10) / 10,
        byStatus: {
          scheduled: events.filter(e => e.status === 'scheduled').length,
          completed: events.filter(e => e.status === 'completed').length,
          cancelled: events.filter(e => e.status === 'cancelled').length
        },
        byType: {
          meeting: events.filter(e => e.type === 'meeting').length,
          call: events.filter(e => e.type === 'call').length,
          appointment: events.filter(e => e.type === 'appointment').length,
          task: events.filter(e => e.type === 'task').length
        },
        conflicts: events.filter(e => e.hasConflicts).length,
        averageDuration: totalEvents > 0 ? Math.round(totalDuration / totalEvents / (1000 * 60)) : 0 // minutes
      };

      return {
        success: true,
        stats
      };

    } catch (error) {
      console.error('Calendar stats error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper methods

  async saveEvent(event) {
    const allEvents = await this.loadAllEvents();
    const existingIndex = allEvents.findIndex(e => e.id === event.id);
    
    if (existingIndex >= 0) {
      allEvents[existingIndex] = event;
    } else {
      allEvents.push(event);
    }

    fs.writeFileSync(this.eventsPath, JSON.stringify(allEvents, null, 2));
  }

  async loadAllEvents() {
    if (!fs.existsSync(this.eventsPath)) {
      return [];
    }
    
    const data = fs.readFileSync(this.eventsPath, 'utf8');
    return JSON.parse(data);
  }

  async getEventById(eventId) {
    const allEvents = await this.loadAllEvents();
    return allEvents.find(e => e.id === eventId);
  }

  async logConflict(event, conflicts) {
    try {
      const conflictLog = {
        eventId: event.id,
        eventTitle: event.title,
        conflicts,
        timestamp: new Date()
      };

      let conflictHistory = [];
      if (fs.existsSync(this.conflictsPath)) {
        const data = fs.readFileSync(this.conflictsPath, 'utf8');
        conflictHistory = JSON.parse(data);
      }

      conflictHistory.push(conflictLog);
      
      // Keep last 100 conflicts
      if (conflictHistory.length > 100) {
        conflictHistory = conflictHistory.slice(-100);
      }

      fs.writeFileSync(this.conflictsPath, JSON.stringify(conflictHistory, null, 2));
    } catch (error) {
      console.error('Error logging conflict:', error);
    }
  }

  findDayAvailableSlots(date, participantEvents, duration, workingHours) {
    const slots = [];
    const workStart = new Date(date);
    workStart.setHours(workingHours.start, 0, 0, 0);
    
    const workEnd = new Date(date);
    workEnd.setHours(workingHours.end, 0, 0, 0);

    // Get events for this day
    const dayEvents = participantEvents.filter(event => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return eventStart.toDateString() === date.toDateString() ||
             (eventStart <= workEnd && eventEnd >= workStart);
    }).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    let currentTime = new Date(workStart);
    
    for (const event of dayEvents) {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      
      // Check if there's a gap before this event
      if (eventStart > currentTime) {
        const gapDuration = eventStart - currentTime;
        if (gapDuration >= duration * 60 * 1000) {
          slots.push({
            start: new Date(currentTime),
            end: new Date(Math.min(eventStart, currentTime.getTime() + duration * 60 * 1000)),
            duration: Math.min(gapDuration / 60000, duration),
            type: 'available'
          });
        }
      }
      
      currentTime = new Date(Math.max(currentTime, eventEnd));
    }

    // Check for gap after all events
    if (currentTime < workEnd) {
      const remainingDuration = workEnd - currentTime;
      if (remainingDuration >= duration * 60 * 1000) {
        slots.push({
          start: new Date(currentTime),
          end: new Date(Math.min(workEnd, currentTime.getTime() + duration * 60 * 1000)),
          duration: Math.min(remainingDuration / 60000, duration),
          type: 'available'
        });
      }
    }

    return slots;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      calendarsPath: this.calendarsPath,
      capabilities: [
        'event_creation',
        'conflict_detection',
        'availability_checking',
        'ai_scheduling_suggestions',
        'meeting_responses',
        'recurring_events'
      ]
    };
  }
}

module.exports = new CalendarService();
