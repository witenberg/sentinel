import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway()
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.log('Client connected');
  }

  handleDisconnect(client: Socket): void {
    this.logger.log('Client disconnected');
  }

  notifyJobFinished(jobId: string, status: string, incidents: unknown, incidentCount?: number): void {
    this.server.emit('job_update', {
      jobId,
      status,
      incidentCount: incidentCount ?? 0,
      incidents: incidents,
    });
  }
}
