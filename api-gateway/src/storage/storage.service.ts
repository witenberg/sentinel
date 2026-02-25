import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StorageService implements OnModuleInit {
    private readonly logger = new Logger(StorageService.name);
    private s3Client: S3Client;
    private bucketName: string;

    constructor(private readonly configService: ConfigService) {
        this.bucketName = this.configService.getOrThrow<string>('S3_BUCKET');
        this.s3Client = new S3Client({
            endpoint: this.configService.getOrThrow<string>('S3_ENDPOINT'),
            region: this.configService.getOrThrow<string>('S3_REGION'),
            credentials: {
                accessKeyId: this.configService.getOrThrow<string>('S3_ACCESS_KEY'),
                secretAccessKey: this.configService.getOrThrow<string>('S3_SECRET_KEY'),
            },

            forcePathStyle: true,
            requestHandler: {
                requestTimeout: 30000,
                connectionTimeout: 5000,
            },
        });
    }

    async onModuleInit() {
        try {
            await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
            this.logger.log(`Connected to S3/MinIO bucket: ${this.bucketName}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to connect to S3/MinIO bucket "${this.bucketName}": ${message}`);
        }
    }

    async uploadFile(file: Express.Multer.File): Promise<string> {
        const fileKey = `${uuidv4()}-${file.originalname}`;

        try {
            await this.s3Client.send(
                new PutObjectCommand({
                    Bucket: this.bucketName,
                    Key: fileKey,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                }),
            );

            return fileKey;
        } catch (error) {
            this.logger.error(
                { error: error instanceof Error ? error.message : 'Unknown error' },
                'Error uploading file to S3'
            );
            throw new InternalServerErrorException('Failed to upload file to S3');
        }
    }
}
