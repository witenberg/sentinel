import { Test, TestingModule } from '@nestjs/testing';
import { LogsEventsController } from './logs_events.controller';
import { EventsGateway } from '../events/events.gateway';
import { LogsService } from './logs.service';
import { ClsService } from 'nestjs-cls';
import { Logger } from '@nestjs/common';
import { AnalysisJobHistoryItemDto, IncidentResponseDto } from './dto/logs-response.dto';

describe('LogsEventsController', () => {
  let controller: LogsEventsController;
  let logsService: jest.Mocked<Pick<LogsService, 'getJobById'>>;
  let eventsGateway: jest.Mocked<Pick<EventsGateway, 'notifyJobFinished'>>;
  let clsService: jest.Mocked<Pick<ClsService, 'run' | 'set'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LogsEventsController],
      providers: [
        {
          provide: LogsService,
          useValue: { getJobById: jest.fn() },
        },
        {
          provide: EventsGateway,
          useValue: { notifyJobFinished: jest.fn() },
        },
        {
          provide: ClsService,
          useValue: {
            run: jest.fn().mockImplementation(async (callback: () => Promise<void>) => {
              await callback();
            }),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LogsEventsController>(LogsEventsController);

    logsService = module.get(LogsService) as unknown as jest.Mocked<Pick<LogsService, 'getJobById'>>;
    eventsGateway = module.get(EventsGateway) as unknown as jest.Mocked<Pick<EventsGateway, 'notifyJobFinished'>>;
    clsService = module.get(ClsService) as unknown as jest.Mocked<Pick<ClsService, 'run' | 'set'>>;

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => { });
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => { });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleJobResult', () => {
    it('should process message, set correlationId, and notify via WebSockets (Happy Path)', async () => {
      // Arrange
      const message = {
        jobId: 'job-123',
        status: 'COMPLETED',
        incidentCount: 5,
        correlationId: 'corr-abc',
      };

      const mockDbJob: AnalysisJobHistoryItemDto = {
        id: 'job-123',
        status: 'COMPLETED',
        incidents: [{ id: 'inc-1', jobId: 'job-123', incidentTemplate: 'template', occurrences: 1, avgScore: 0.5, severity: 0.5, exampleLog: 'example' } as IncidentResponseDto],
        incidentCount: 5,
        filename: 'filename',
        totalLines: 100,
        createdAt: new Date(),
      };

      logsService.getJobById.mockResolvedValue(mockDbJob as AnalysisJobHistoryItemDto);

      // Act
      await controller.handleJobResult(message);

      // Assert
      expect(clsService.run).toHaveBeenCalledTimes(1);
      expect(clsService.set).toHaveBeenCalledWith('correlationId', 'corr-abc');
      expect(logsService.getJobById).toHaveBeenCalledWith('job-123');
      expect(eventsGateway.notifyJobFinished).toHaveBeenCalledWith(
        mockDbJob.id,
        mockDbJob.status,
        mockDbJob.incidents,
        mockDbJob.incidentCount,
      );
    });

    it('should NOT set correlationId if it is not provided in the message', async () => {
      // Arrange
      const message = {
        jobId: 'job-123',
        status: 'COMPLETED',
        incidentCount: 0,
      };

      const mockDbJob: AnalysisJobHistoryItemDto = {
        id: 'job-123',
        status: 'COMPLETED',
        incidents: [{ id: 'inc-1', jobId: 'job-123', incidentTemplate: 'template', occurrences: 1, avgScore: 0.5, severity: 0.5, exampleLog: 'example' } as IncidentResponseDto],
        incidentCount: 0,
        filename: 'filename',
        totalLines: 100,
        createdAt: new Date(),
      };

      logsService.getJobById.mockResolvedValue(mockDbJob as AnalysisJobHistoryItemDto);

      // Act
      await controller.handleJobResult(message);

      // Assert
      expect(clsService.set).not.toHaveBeenCalled();
      expect(eventsGateway.notifyJobFinished).toHaveBeenCalled();
    });

    it('should abort and NOT notify if job is not found in database (Edge Case)', async () => {
      // Arrange
      const message = {
        jobId: 'missing-job',
        status: 'COMPLETED',
        incidentCount: 0,
      };

      logsService.getJobById.mockResolvedValue(null as AnalysisJobHistoryItemDto | null);

      // Act
      await controller.handleJobResult(message);

      // Assert
      expect(logsService.getJobById).toHaveBeenCalledWith('missing-job');
      expect(eventsGateway.notifyJobFinished).not.toHaveBeenCalled();
    });
  });
});