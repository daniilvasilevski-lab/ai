import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { TaskState, Task, CreateTaskForm, TaskResponseForm } from '@/types';
import { tasksService } from '@/services/tasks';
import { websocketService } from '@/services/websocket';
import toast from 'react-hot-toast';

export const useTasksStore = create<TaskState>()(
  devtools(
    subscribeWithSelector(
      (set, get) => ({
        tasks: [],
        currentTask: null,
        isLoading: false,
        error: null,

        fetchTasks: async () => {
          try {
            set({ isLoading: true, error: null });
            const response = await tasksService.getTasks({ limit: 100 });
            set({ tasks: response.items, isLoading: false });
          } catch (error: any) {
            set({ error: error.message || 'Failed to fetch tasks', isLoading: false });
            toast.error('Failed to fetch tasks');
          }
        },

        createTask: async (taskData: CreateTaskForm) => {
          try {
            set({ isLoading: true, error: null });
            const newTask = await tasksService.createTask(taskData);
            
            set(state => ({
              tasks: [newTask, ...state.tasks],
              isLoading: false,
            }));
            
            toast.success('Task created successfully');
            return newTask;
          } catch (error: any) {
            set({ error: error.message || 'Failed to create task', isLoading: false });
            toast.error('Failed to create task');
            throw error;
          }
        },

        updateTask: async (id: string, updates: Partial<Task>) => {
          try {
            const updatedTask = await tasksService.updateTask(id, updates);
            
            set(state => ({
              tasks: state.tasks.map(task => 
                task.id === id ? updatedTask : task
              ),
              currentTask: state.currentTask?.id === id ? updatedTask : state.currentTask,
            }));
            
            toast.success('Task updated successfully');
            return updatedTask;
          } catch (error: any) {
            toast.error('Failed to update task');
            throw error;
          }
        },

        deleteTask: async (id: string) => {
          try {
            await tasksService.deleteTask(id);
            
            set(state => ({
              tasks: state.tasks.filter(task => task.id !== id),
              currentTask: state.currentTask?.id === id ? null : state.currentTask,
            }));
            
            toast.success('Task deleted successfully');
          } catch (error: any) {
            toast.error('Failed to delete task');
            throw error;
          }
        },

        respondToTask: async (id: string, response: TaskResponseForm) => {
          try {
            const updatedTask = await tasksService.respondToTask(id, response);
            
            set(state => ({
              tasks: state.tasks.map(task => 
                task.id === id ? updatedTask : task
              ),
              currentTask: state.currentTask?.id === id ? updatedTask : state.currentTask,
            }));
            
            const message = response.type === 'confirmation' 
              ? 'Task confirmed successfully' 
              : 'Task rejected';
            toast.success(message);
            
            return updatedTask;
          } catch (error: any) {
            toast.error('Failed to respond to task');
            throw error;
          }
        },

        // Helper methods
        setCurrentTask: (task: Task | null) => set({ currentTask: task }),
        
        getTaskById: (id: string) => {
          const { tasks } = get();
          return tasks.find(task => task.id === id) || null;
        },

        getMyTasks: () => {
          const { tasks } = get();
          // This would typically come from the auth store
          const currentUserId = 'current-user-id'; // TODO: get from auth store
          return tasks.filter(task => task.assigneeId === currentUserId);
        },

        getCreatedTasks: () => {
          const { tasks } = get();
          // This would typically come from the auth store
          const currentUserId = 'current-user-id'; // TODO: get from auth store
          return tasks.filter(task => task.creatorId === currentUserId);
        },

        getTasksByStatus: (status: string) => {
          const { tasks } = get();
          return tasks.filter(task => task.status === status);
        },

        getTasksByPriority: (priority: string) => {
          const { tasks } = get();
          return tasks.filter(task => task.priority === priority);
        },
      })
    ),
    { name: 'tasks-store' }
  )
);

// WebSocket event listeners
if (typeof window !== 'undefined') {
  websocketService.on('task:created', (task: Task) => {
    useTasksStore.getState().tasks.unshift(task);
    useTasksStore.setState(state => ({
      tasks: [task, ...state.tasks.filter(t => t.id !== task.id)]
    }));
    toast.success('New task received');
  });

  websocketService.on('task:updated', (task: Task) => {
    useTasksStore.setState(state => ({
      tasks: state.tasks.map(t => t.id === task.id ? task : t),
      currentTask: state.currentTask?.id === task.id ? task : state.currentTask
    }));
  });

  websocketService.on('task:response', (response: any) => {
    const { taskId, ...responseData } = response;
    
    useTasksStore.setState(state => ({
      tasks: state.tasks.map(task => {
        if (task.id === taskId) {
          return {
            ...task,
            responses: [...(task.responses || []), responseData]
          };
        }
        return task;
      })
    }));
    
    toast('Task response received');
  });
}

