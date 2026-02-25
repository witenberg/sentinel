import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { IncidentResponseDto } from '../logs/dto/logs-response.dto';

describe('EventsGateway', () => {
  let gateway: EventsGateway;

  let mockServer: jest.Mocked<Pick<Server, 'emit'>>;
  let mockClient: Pick<Socket, 'id'>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsGateway],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);

    mockServer = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<Pick<Server, 'emit'>>;

    // Manual injection of mock server
    gateway.server = mockServer as unknown as Server;

    mockClient = { id: 'client-abc-123' };

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => { });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Lifecycle Hooks (Connection/Disconnection)', () => {
    it('should log when a client connects (Happy Path)', () => {
      // Act
      gateway.handleConnection(mockClient as Socket);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith('Client connected');
    });

    it('should log when a client disconnects (Happy Path)', () => {
      // Act
      gateway.handleDisconnect(mockClient as Socket);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith('Client disconnected');
    });
  });

  describe('notifyJobFinished', () => {
    it('should emit job_update event with provided incidentCount (Happy Path)', () => {
      // Arrange
      const jobId = 'job-1';
      const status = 'COMPLETED';
      const incidents = [{ type: 'ERROR' }];
      const incidentCount = 5;

      // Act
      gateway.notifyJobFinished(jobId, status, incidents, incidentCount);

      // Assert
      expect(mockServer.emit).toHaveBeenCalledTimes(1);
      expect(mockServer.emit).toHaveBeenCalledWith('job_update', {
        jobId,
        status,
        incidentCount,
        incidents,
      });
    });

    it('should fallback to 0 if incidentCount is undefined (Edge Case)', () => {
      // Arrange
      const jobId = 'job-2';
      const status = 'FAILED';
      const incidents = [{ id: 'inc-1', jobId: 'job-2', incidentTemplate: 'template', occurrences: 1, avgScore: 0.5, severity: 0.5, exampleLog: 'example' } as IncidentResponseDto];
      const incidentCount = undefined;

      // Act
      gateway.notifyJobFinished(jobId, status, incidents, incidentCount);

      // Assert
      expect(mockServer.emit).toHaveBeenCalledTimes(1);
      expect(mockServer.emit).toHaveBeenCalledWith('job_update', {
        jobId,
        status,
        incidentCount: 0,
        incidents,
      });
    });
  });
});