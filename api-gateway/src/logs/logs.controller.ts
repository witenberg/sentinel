import {
    Post, Controller, UploadedFile, UseInterceptors, Get,
    ParseFilePipeBuilder, HttpStatus, UseFilters
} from '@nestjs/common';
import { LogsService } from './logs.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MulterExceptionFilter } from './multer-exception.filter';
import { LogFileValidator } from './log-file.validator';
import { ProcessLogsResponseDto, AnalysisJobHistoryItemDto } from './dto/logs-response.dto';

class FileUploadDto {
    @ApiProperty({ type: 'string', format: 'binary', description: 'Log file (.log, .txt)' })
    file!: Express.Multer.File;
}

@ApiTags('logs')
@Controller('logs')
@UseFilters(MulterExceptionFilter)
export class LogsController {
    constructor(private readonly logsService: LogsService) { }

    @Post('upload')
    @Throttle({ upload: { limit: 5, ttl: 60000 } })
    @ApiOperation({ summary: 'Upload a log file to be processed' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        description: 'Select a log file from the disk',
        type: FileUploadDto,
    })
    @ApiResponse({ status: 201, description: 'Log file queued for analysis', type: ProcessLogsResponseDto })
    @ApiResponse({ status: 422, description: 'Invalid file (e.g. not .log/.txt or too large)' })
    @UseInterceptors(FileInterceptor('file'))
    async uploadLogFile(
        @UploadedFile(
            new ParseFilePipeBuilder()
                .addValidator(new LogFileValidator())
                .build({
                    fileIsRequired: true,
                    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
                }),
        ) file: Express.Multer.File
    ) {
        return this.logsService.processLogs(file);
    }

    @Get('history')
    @ApiOperation({ summary: 'Get the history of processed logs' })
    @ApiResponse({ status: 200, description: 'List of analysis jobs with incidents', type: AnalysisJobHistoryItemDto, isArray: true })
    async getHistory(): Promise<AnalysisJobHistoryItemDto[]> {
        return this.logsService.getHistory();
    }
}
