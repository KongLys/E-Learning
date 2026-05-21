import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/notifications' })
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token ?? client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) { client.disconnect(); return; }
      const payload = this.jwtService.verify(token, { secret: this.config.get('JWT_SECRET') });
      client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {}

  pushToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }
}
