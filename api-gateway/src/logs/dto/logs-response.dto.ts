import { ApiProperty } from '@nestjs/swagger';

/** Response after uploading a log file */
export class ProcessLogsResponseDto {
    @ApiProperty({ example: 'Logs processed successfully', description: 'Human-readable status message' })
    message!: string;

    @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Analysis job ID' })
    jobId!: string;

    @ApiProperty({ example: 'PENDING', description: 'Job status (PENDING until worker completes)' })
    status!: string;
}

/** Single incident detected by ML */
export class IncidentResponseDto {
    @ApiProperty()
    id!: string;

    @ApiProperty()
    jobId!: string;

    @ApiProperty({ description: 'DRAIN template, e.g. "Failed password for <*>"' })
    incidentTemplate!: string;

    @ApiProperty({ description: 'Number of occurrences in the log file' })
    occurrences!: number;

    @ApiProperty({ description: 'Average anomaly score (Isolation Forest)' })
    avgScore!: number;

    @ApiProperty({ description: 'Severity score from rules (e.g. FATAL, ERROR)' })
    severity!: number;

    @ApiProperty({ description: 'Example raw log line' })
    exampleLog!: string;
}

/** Single job in history with its incidents. */
export class AnalysisJobHistoryItemDto {
    @ApiProperty()
    id!: string;

    @ApiProperty()
    filename!: string;

    @ApiProperty()
    totalLines!: number;

    @ApiProperty()
    incidentCount!: number;

    @ApiProperty({ example: 'PENDING' })
    status!: string;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty({ type: [IncidentResponseDto] })
    incidents!: IncidentResponseDto[];
}
