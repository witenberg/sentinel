import { Test, TestingModule } from '@nestjs/testing';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { AnalysisJobHistoryItemDto } from './dto/logs-response.dto';

describe('LogsController', () => {
  let controller: LogsController;
  let logsService: jest.Mocked<LogsService>;

  beforeEach(async () => {
    const mockLogsService = {
      processLogs: jest.fn(),
      getHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LogsController],
      providers: [
        {
          provide: LogsService,
          useValue: mockLogsService,
        },
      ],
    }).compile();

    controller = module.get<LogsController>(LogsController);
    logsService = module.get(LogsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadLogFile', () => {
    it('should pass the uploaded file to the service and return its response', async () => {
      // Arrange
      const mockFile = {
        originalname: 'server_error.log',
        size: 2048,
        mimetype: 'text/plain',
      } as Express.Multer.File;

      const expectedResponse = {
        message: 'Logs processed successfully',
        jobId: 'abc-123',
        status: 'PENDING',
      };

      logsService.processLogs.mockResolvedValue(expectedResponse);

      // Act
      const result = await controller.uploadLogFile(mockFile);

      // Assert
      expect(logsService.processLogs).toHaveBeenCalledTimes(1);
      expect(logsService.processLogs).toHaveBeenCalledWith(mockFile);
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getHistory', () => {
    it('should return a list of job history items from the service', async () => {
      // Arrange
      const expectedHistory = [
        { id: '1', filename: 'error.log', status: 'COMPLETED', incidentCount: 5 },
        { id: '2', filename: 'access.log', status: 'PENDING', incidentCount: 0 },
      ];

      logsService.getHistory.mockResolvedValue(expectedHistory as AnalysisJobHistoryItemDto[]);

      // Act
      const result = await controller.getHistory();

      // Assert
      expect(logsService.getHistory).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedHistory);
    });
  });
});