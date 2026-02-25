import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor!: ReturnType<typeof createAdapter>;
  private pubClient!: ReturnType<typeof createClient>;
  private subClient!: ReturnType<typeof createClient>;

  constructor(
    private app: INestApplicationContext,
    private configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');

    const socketOptions = {
      reconnectStrategy: (retries: number) => {
        if (retries > 3) {
          return new Error('Redis adapter: max reconnection attempts reached');
        }
        return Math.min(retries * 100, 2000);
      },
    };

    this.pubClient = createClient({ url: redisUrl, socket: socketOptions });
    this.subClient = this.pubClient.duplicate();

    this.setupErrorHandlers(this.pubClient, 'PUB');
    this.setupErrorHandlers(this.subClient, 'SUB');

    try {
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      this.logger.log('Redis adapter connected successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to connect to Redis', err);
      throw new Error(`Redis connection failed: ${err.message}`);
    }

    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  private setupErrorHandlers(client: ReturnType<typeof createClient>, label: string): void {
    client.on('error', (err) => {
      this.logger.error(`Redis ${label} client error: ${err.message}`);
    });

    client.on('reconnecting', () => {
      this.logger.warn(`Redis ${label} client reconnecting...`);
    });

    client.on('ready', () => {
      this.logger.log(`Redis ${label} client ready`);
    });
  }

  async close(): Promise<void> {
    if (this.pubClient?.isOpen) {
      await this.pubClient.quit();
    }
    if (this.subClient?.isOpen) {
      await this.subClient.quit();
    }
    this.logger.log('Redis clients disconnected');
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const origin = this.configService.getOrThrow<string>('FRONTEND_URL');
    const mergedOptions: ServerOptions = {
      ...options,
      cors: {
        ...(typeof options?.cors === 'object' && options.cors !== null ? options.cors : {}),
        origin,
      },
    } as ServerOptions;
    const server = super.createIOServer(port, mergedOptions);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
