import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket?: Socket;

  connect(token?: string) {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.socket = io(environment.apiUrl, {
      transports: ['websocket'],
      auth: token ? { token } : undefined,
      autoConnect: true
    });
  }

  on<T>(event: string, callback: (payload: T) => void) {
    this.socket?.on(event, callback);
  }

  emit(event: string, payload: any) {
    this.socket?.emit(event, payload);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = undefined;
  }
}
