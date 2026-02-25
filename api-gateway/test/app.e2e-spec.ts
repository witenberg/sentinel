import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { of } from 'rxjs';

// Przechowujemy stan Rate Limitera w pamięci, aby resetować go między testami
let throttlerRecords: Record<string, { totalHits: number; timeToExpire: number }> = {};

// Mockujemy połączenie z Redisem, symulując natywny interfejs Throttlera z NestJS.
// Dzięki temu możemy przetestować Rate Limiting całkowicie OFFLINE, bez stawiania bazy Redis.
jest.mock('@nest-lab/throttler-storage-redis', () => {
  return {
    ThrottlerStorageRedisService: jest.fn().mockImplementation(() => ({
      increment: async (key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) => {
        if (!throttlerRecords[key]) {
          throttlerRecords[key] = { totalHits: 0, timeToExpire: Date.now() + ttl };
        }
        throttlerRecords[key].totalHits += 1;
        return {
          totalHits: throttlerRecords[key].totalHits,
          timeToExpire: throttlerRecords[key].timeToExpire,
          isBlocked: throttlerRecords[key].totalHits > limit,
          timeToBlockExpire: 0,
        };
      },
    })),
  };
});

describe('Orchestrator API (e2e)', () => {
  let app: INestApplication;

  // Mocki serwisów "wychodzących" z naszego systemu
  const mockPrismaService = {
    analysisJob: {
      create: jest.fn().mockResolvedValue({ id: 'e2e-mock-job-id', status: 'PENDING' }),
    },
  };

  const mockStorageService = {
    uploadFile: jest.fn().mockResolvedValue('e2e-mock-s3-key'),
  };

  const mockRabbitClient = {
    emit: jest.fn().mockReturnValue(of(true)), // RxJS stream
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Nadpisujemy zewnętrzne adaptery naszymi mockami
      .overrideProvider(PrismaService).useValue(mockPrismaService)
      .overrideProvider(StorageService).useValue(mockStorageService)
      .overrideProvider('ML_QUEUE_SERVICE').useValue(mockRabbitClient)
      .compile();

    app = moduleFixture.createNestApplication();

    // Replikujemy konfigurację z main.ts, która jest kluczowa dla działania żądań HTTP
    app.setGlobalPrefix('api/v1');

    // Wyciszamy logowanie Pino na czas testów, by nie śmiecić w konsoli raportu
    app.useLogger(false);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    throttlerRecords = {}; // Resetujemy pamięć limitów po każdym teście!
  });

  describe('POST /api/v1/logs/upload', () => {
    it('should process a valid log file and queue the analysis job (Happy Path)', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/v1/logs/upload')
        .attach('file', Buffer.from('test error log content'), 'server_error.log')
        .expect(201);

      // Assert - Sprawdzamy czy zwracane body zgadza się z DTO
      expect(response.body).toEqual({
        message: 'Logs processed successfully',
        jobId: 'e2e-mock-job-id',
        status: 'PENDING',
      });

      // Assert - Upewniamy się, że kontroler poprawnie przepchnął dane do warstwy serwisów
      expect(mockStorageService.uploadFile).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.analysisJob.create).toHaveBeenCalledTimes(1);
      expect(mockRabbitClient.emit).toHaveBeenCalledTimes(1);
    });

    it('should reject an invalid file extension before processing (Edge Case)', async () => {
      // Act & Assert - Zwracamy na ten sam endpoint plik udający wirusa
      await request(app.getHttpServer())
        .post('/api/v1/logs/upload')
        .attach('file', Buffer.from('binary data'), 'virus.exe')
        .expect(422); // Oczekujemy kodu UNPROCESSABLE_ENTITY od Twojego ParseFilePipeBuilder

      // Kluczowe sprawdzenie: system nie powinien nawet próbować wrzucać złego pliku na S3
      expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
    });

    it('should block requests exceeding the rate limit set for upload endpoint (DDoS Protection)', async () => {
      // W AppModule ustawiłeś limit: 5 zapytań na upload. 
      // Zrobimy w pętli 5 udanych zapytań...
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/logs/upload')
          .attach('file', Buffer.from('log line'), `test${i}.log`)
          .expect(201);
      }

      // ...a przy szóstym zapytaniu system MUSI nas odciąć
      await request(app.getHttpServer())
        .post('/api/v1/logs/upload')
        .attach('file', Buffer.from('spam log'), 'spam.log')
        .expect(429); // 429 - Too Many Requests
    });
  });
});