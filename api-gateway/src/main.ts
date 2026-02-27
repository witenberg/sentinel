import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { RedisIoAdapter } from './adapters/redis-io.adapter';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  try {
    const configService = app.get(ConfigService);
    const isProduction = configService.getOrThrow<string>('NODE_ENV') === 'production';

    app.setGlobalPrefix('api/v1');

    app.enableShutdownHooks();

    app.use(
      helmet({
        contentSecurityPolicy: isProduction,
        crossOriginEmbedderPolicy: false,
        hsts: isProduction
          ? { maxAge: 31536000, includeSubDomains: true, preload: true }
          : false,
      }),
    );

    const redisIoAdapter = new RedisIoAdapter(app, configService);
    const redisUrl = configService.get<string>('REDIS_URL');

    if (redisUrl) {
      await redisIoAdapter.connectToRedis();
      app.useWebSocketAdapter(redisIoAdapter);
    } else {
      logger.warn('REDIS_URL is not set, using default Socket.IO adapter');
    }

    process.on('SIGTERM', async () => {
      logger.log('SIGTERM received, starting graceful shutdown...');
      await redisIoAdapter.close();
      await app.close();
      logger.log('Graceful shutdown completed');
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.log('SIGINT received, starting graceful shutdown...');
      await redisIoAdapter.close();
      await app.close();
      logger.log('Graceful shutdown completed');
      process.exit(0);
    });

    app.enableCors({
      origin: configService.getOrThrow<string>('FRONTEND_URL'),
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
      credentials: true,
      exposedHeaders: ['retry-after-upload', 'retry-after-default'],
    });

    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [configService.getOrThrow<string>('RABBITMQ_URL')],
        queue: configService.getOrThrow<string>('RABBITMQ_RESULTS_QUEUE'),
        queueOptions: {
          durable: true,
        }
      },
    });

    if (!isProduction) {
      const config = new DocumentBuilder()
        .setTitle('Sentinel API Gateway')
        .setDescription('API Gateway for the Sentinel project')
        .setVersion('1.0')
        .addTag('logs')
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('docs', app, document);
    }

    await app.startAllMicroservices();
    const port = configService.getOrThrow<number>('PORT');
    await app.listen(port);
    logger.log(`Application is running on port ${port} in ${configService.getOrThrow<string>('NODE_ENV')} environment`);
  } catch (error) {
    logger.error(`Failed to start application: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
bootstrap().catch((error) => {
  console.error('FATAL: Application failed to start');
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
