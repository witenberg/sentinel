import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '@nestjs/config';
import { timeout, catchError, lastValueFrom } from 'rxjs';
import type { AnalysisJobHistoryItemDto, ProcessLogsResponseDto } from './dto/logs-response.dto';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class LogsService {
    private readonly logger = new Logger(LogsService.name);

    constructor(
        private readonly clsService: ClsService,
        private readonly prismaService: PrismaService,
        private readonly storageService: StorageService,
        @Inject('ML_QUEUE_SERVICE') private readonly rabbitClient: ClientProxy,
        private readonly configService: ConfigService,
    ) { }

    async processLogs(file: Express.Multer.File): Promise<ProcessLogsResponseDto> {
        this.logger.log(
            { fileName: file.originalname, fileSize: file.size, mimeType: file.mimetype },
            'Started processing uploaded file'
        );

        const fileKey = await this.storageService.uploadFile(file);
        this.logger.log(
            { fileKey: fileKey },
            'File uploaded to S3'
        );

        const job = await this.prismaService.analysisJob.create({
            data: {
                filename: file.originalname,
                totalLines: 0,
                incidentCount: 0,
                status: 'PENDING',
            },
        });
        this.logger.log(
            { jobId: job.id },
            'Job created'
        );

        try {
            await lastValueFrom(
                this.rabbitClient.emit('analyze_logs', {
                    jobId: job.id,
                    fileKey: fileKey,
                    bucket: this.configService.getOrThrow<string>('S3_BUCKET'),
                    correlationId: this.clsService.get('correlationId'),
                }).pipe(
                    timeout(5000),
                    catchError((error) => {
                        this.logger.error(`Failed to send message to RabbitMQ for job ${job.id}: ${error.message}`);
                        throw error;
                    }),
                ),
            );
            this.logger.log(
                { jobId: job.id },
                'Message sent to RabbitMQ'
            );
        } catch (error) {
            await this.prismaService.analysisJob.update({
                where: { id: job.id },
                data: { status: 'FAILED' },
            });
            this.logger.error(
                { jobId: job.id },
                'Job marked as FAILED due to RabbitMQ error'
            );
            throw new InternalServerErrorException('Failed to queue analysis job');
        }

        return {
            message: 'Logs processed successfully',
            jobId: job.id,
            status: job.status,
        }
    }

    async getHistory(): Promise<AnalysisJobHistoryItemDto[]> {
        return this.prismaService.analysisJob.findMany({
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                incidents: true,
            },
        });
    }

    async getJobById(jobId: string) {
        return this.prismaService.analysisJob.findUnique({
            where: { id: jobId },
            include: {
                incidents: true,
            },
        });
    }
}
