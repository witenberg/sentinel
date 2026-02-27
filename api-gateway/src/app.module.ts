import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LogsModule } from './logs/logs.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { EventsModule } from './events/events.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { validateEnv } from './env.schema';
import { LoggerModule } from 'nestjs-pino';
import { IncomingMessage, ServerResponse } from 'http';
import { ClsModule, ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';
import { Logger } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls: ClsService, req: IncomingMessage) => {
          const correlationId = req.headers['x-correlation-id'] || uuidv4();
          cls.set('correlationId', correlationId);
        },
      },
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule, ClsModule],
      inject: [ConfigService, ClsService],
      useFactory: (configService: ConfigService, clsService: ClsService) => {
        const isProduction = configService.get<string>('NODE_ENV') === 'production';

        return {
          pinoHttp: {
            serializers: {
              req: (req: IncomingMessage) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res: ServerResponse) => ({
                statusCode: res.statusCode,
              }),
            },
            mixin: () => {
              const correlationId = clsService.isActive() ? clsService.get('correlationId') : undefined;
              return { correlationId };
            },
            customProps: (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => ({
              context: 'HTTP',
            }),
            transport: !isProduction
              ? {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    colorize: true,
                    ignore: 'pid,hostname,req,res,context',
                  },
                }
              : undefined,
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logger = new Logger(ThrottlerModule.name);
        const redisUrl = configService.get<string>('REDIS_URL');

        const throttlers = [
          {
            name: 'default',
            ttl: seconds(60),
            limit: 10,
          },
          {
            name: 'upload',
            ttl: seconds(60),
            limit: 5,
          },
        ];

        if (!redisUrl) {
          logger.warn('REDIS_URL is not set, using in-memory throttler storage');
          return { throttlers };
        }

        const redisClient = new Redis(redisUrl, {
          retryStrategy: () => null,
          maxRetriesPerRequest: 1,
        });

        redisClient.on('error', (err: Error) => {
          logger.error({ error: err.message }, 'Redis connection error');
        });

        return {
          throttlers,
          storage: new ThrottlerStorageRedisService(redisClient),
        };
      },
    }),
    PrismaModule,
    LogsModule,
    StorageModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
