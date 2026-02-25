import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { ConfigService } from '@nestjs/config';

interface PrismaWithEvents {
  $on(eventType: 'query', callback: (event: Prisma.QueryEvent) => void): void;
  $on(eventType: 'error' | 'info' | 'warn', callback: (event: Prisma.LogEvent) => void): void;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    const adapter = new PrismaPg({ connectionString });
    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });

    const prismaWithEvents = this as unknown as PrismaWithEvents;

    const isProduction = configService.getOrThrow<string>('NODE_ENV') === 'production';

    if (!isProduction) {
      prismaWithEvents.$on('query', (e) => {
        this.logger.log({ duration: e.duration.toFixed(2) + 'ms' }, `Query: ${e.query}`);
      });
    }

    prismaWithEvents.$on('error', (e) => {
      this.logger.error({ target: e.target }, `Prisma Error: ${e.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    const CONNECT_TIMEOUT_MS = 5_000;

    await Promise.race([
      this.$connect(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`PostgreSQL connection timed out after ${CONNECT_TIMEOUT_MS}ms`)),
          CONNECT_TIMEOUT_MS,
        ),
      ),
    ]);

    await this.$queryRaw`SET statement_timeout = '30s'`.catch(() => { });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
