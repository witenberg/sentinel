import { Test, TestingModule } from '@nestjs/testing';
import { LogsService } from './logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { InternalServerErrorException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AnalysisJobHistoryItemDto } from './dto/logs-response.dto';

describe('LogsService', () => {
  let service: LogsService;
  let prismaService: {
    analysisJob: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let storageService: { uploadFile: jest.Mock };
  let rabbitClient: { emit: jest.Mock };

  const mockFile = {
    originalname: 'test.log',
    size: 1024,
    mimetype: 'text/plain',
  } as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogsService,
        {
          provide: PrismaService,
          useValue: {
            analysisJob: {
              create: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: StorageService,
          useValue: { uploadFile: jest.fn() },
        },
        {
          provide: 'ML_QUEUE_SERVICE',
          useValue: { emit: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('test-bucket') },
        },
        {
          provide: ClsService,
          useValue: { get: jest.fn().mockReturnValue('test-correlation-id') },
        },
      ],
    }).compile();

    service = module.get<LogsService>(LogsService);
    prismaService = module.get(PrismaService) as typeof prismaService;
    storageService = module.get(StorageService) as typeof storageService;
    rabbitClient = module.get('ML_QUEUE_SERVICE') as typeof rabbitClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processLogs', () => {
    it('should successfully process logs (Happy Path)', async () => {
      // Arrange
      storageService.uploadFile.mockResolvedValue('s3-key-123');
      prismaService.analysisJob.create.mockResolvedValue({ id: 'job-1', status: 'PENDING' } as any);
      rabbitClient.emit.mockReturnValue(of(true));

      // Act
      const result = await service.processLogs(mockFile);

      // Assert
      expect(result.jobId).toBe('job-1');
      expect(result.status).toBe('PENDING');
      expect(rabbitClient.emit).toHaveBeenCalledWith('analyze_logs', expect.any(Object));
    });

    it('should throw and NOT create DB job if S3 upload fails (Edge Case)', async () => {
      // Arrange
      storageService.uploadFile.mockRejectedValue(new Error('S3 Down'));

      // Act & Assert
      await expect(service.processLogs(mockFile)).rejects.toThrow('S3 Down');
      expect(prismaService.analysisJob.create).not.toHaveBeenCalled();
      expect(rabbitClient.emit).not.toHaveBeenCalled();
    });

    it('should mark job as FAILED and throw if RabbitMQ emission fails (Edge Case)', async () => {
      // Arrange
      storageService.uploadFile.mockResolvedValue('s3-key-123');
      prismaService.analysisJob.create.mockResolvedValue({ id: 'job-1' } as any);

      rabbitClient.emit.mockReturnValue(throwError(() => new Error('RabbitMQ unreachable')));

      // Act & Assert
      await expect(service.processLogs(mockFile)).rejects.toThrow(InternalServerErrorException);

      expect(prismaService.analysisJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: 'FAILED' },
      });
    });
  });

  describe('getHistory & getJobById', () => {
    it('should return a list of jobs', async () => {
      prismaService.analysisJob.findMany.mockResolvedValue([{ id: '1' }, { id: '2' }] as AnalysisJobHistoryItemDto[]);
      const result = await service.getHistory();
      expect(result).toHaveLength(2);
      expect(prismaService.analysisJob.findMany).toHaveBeenCalledTimes(1);
    });

    it('should return a single job or null', async () => {
      prismaService.analysisJob.findUnique.mockResolvedValue(null);
      const result = await service.getJobById('non-existent');
      expect(result).toBeNull();
    });
  });
});