import { Controller, Logger } from '@nestjs/common';
import { EventsGateway } from '../events/events.gateway';
import { EventPattern } from '@nestjs/microservices';
import { Payload } from '@nestjs/microservices';
import { LogsService } from './logs.service';
import { ClsService } from 'nestjs-cls';

@Controller()
export class LogsEventsController {
    private readonly logger = new Logger(LogsEventsController.name);

    constructor(
        private readonly eventsGateway: EventsGateway,
        private readonly logsService: LogsService,
        private readonly clsService: ClsService,
    ) { }

    @EventPattern('results_queue')
    async handleJobResult(
        @Payload() message: { jobId: string, status: string, incidentCount: number, correlationId?: string }
    ) {
        await this.clsService.run(async () => {
            if (message.correlationId) {
                this.clsService.set('correlationId', message.correlationId);
            }

            const job = await this.logsService.getJobById(message.jobId);
            if (!job) {
                this.logger.error(
                    { jobId: message.jobId },
                    'Job not found in database'
                );
                return;
            }

            this.eventsGateway.notifyJobFinished(job.id, job.status, job.incidents, job.incidentCount ?? 0);

            this.logger.log(
                { jobId: job.id },
                'Notified client via WebSockets successfully',
            );
        });
    }
}
