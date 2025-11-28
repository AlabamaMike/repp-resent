import { io, Socket } from 'socket.io-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function subscribeToProject(projectId: string): void {
  const s = getSocket();
  s.emit('subscribe:project', projectId);
}

export function unsubscribeFromProject(projectId: string): void {
  const s = getSocket();
  s.emit('unsubscribe:project', projectId);
}

export interface WebSocketEvent {
  type: string;
  projectId: string;
  payload: unknown;
  timestamp: string;
}

export function onProjectEvent(callback: (event: WebSocketEvent) => void): () => void {
  const s = getSocket();
  s.on('project:event', callback);
  return () => {
    s.off('project:event', callback);
  };
}
