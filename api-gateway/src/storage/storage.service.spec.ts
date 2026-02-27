import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

describe('StorageService', () => {
  let service: StorageService;
  let configService: jest.Mocked<Pick<ConfigService, 'getOrThrow' | 'get'>>;
  let s3SendSpy: jest.SpyInstance;

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test-log.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: 1024,
    destination: '',
    filename: '',
    path: '',
    buffer: Buffer.from('test log content'),
    stream: null as unknown as import('stream').Readable,
  };

  beforeEach(async () => {
    const configEnv: Record<string, string> = {
      S3_BUCKET: 'test-bucket',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY: 'test-access',
      S3_SECRET_KEY: 'test-secret',
    };

    const mockConfigService: Pick<ConfigService, 'getOrThrow' | 'get'> = {
      getOrThrow: jest.fn((key: string) => {
        return configEnv[key] ?? '';
      }),
      get: jest.fn((key: string) => configEnv[key]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    configService = module.get(ConfigService) as unknown as jest.Mocked<Pick<ConfigService, 'getOrThrow' | 'get'>>;

    s3SendSpy = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      $metadata: { httpStatusCode: 200 },
    } as never);

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => { });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should correctly initialize S3Client with configuration values', () => {
      expect(configService.getOrThrow).toHaveBeenCalledWith('S3_BUCKET');
      expect(configService.get).toHaveBeenCalledWith('S3_ENDPOINT');
      expect(configService.get).toHaveBeenCalledWith('S3_ACCESS_KEY');
      expect(configService.get).toHaveBeenCalledWith('S3_SECRET_KEY');
    });
  });

  describe('uploadFile', () => {
    it('should successfully upload a file and return the generated file key (Happy Path)', async () => {
      // Arrange
      const mockedUuid = 'abc-1234-xyz';
      (uuidv4 as jest.Mock).mockReturnValue(mockedUuid);

      const expectedFileKey = `${mockedUuid}-${mockFile.originalname}`;

      // Act
      const result = await service.uploadFile(mockFile);

      // Assert
      expect(result).toBe(expectedFileKey);

      expect(s3SendSpy).toHaveBeenCalledTimes(1);

      const callArg = s3SendSpy.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(PutObjectCommand);
      expect(callArg.input).toEqual({
        Bucket: 'test-bucket',
        Key: expectedFileKey,
        Body: mockFile.buffer,
        ContentType: mockFile.mimetype,
      });
    });

    it('should throw an InternalServerErrorException and log the error if S3 upload fails (Edge Case)', async () => {
      // Arrange
      const errorMessage = 'AWS S3 timeout';
      s3SendSpy.mockRejectedValue(new Error(errorMessage));

      (uuidv4 as jest.Mock).mockReturnValue('uuid');

      // Act & Assert
      await expect(service.uploadFile(mockFile)).rejects.toThrow(InternalServerErrorException);
      await expect(service.uploadFile(mockFile)).rejects.toThrow('Failed to upload file to S3');

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        { error: errorMessage },
        'Error uploading file to S3'
      );
    });
  });
});