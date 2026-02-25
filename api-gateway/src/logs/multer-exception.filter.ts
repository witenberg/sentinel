import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';

/**
 * Converts Multer errors to proper HTTP responses.
 * - LIMIT_FILE_SIZE → 413 Payload Too Large
 */
@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception.code === 'LIMIT_FILE_SIZE') {
      const httpException = new PayloadTooLargeException(
        'File too large. Check UPLOAD_MAX_FILE_SIZE limit.',
      );
      res.status(httpException.getStatus()).json(httpException.getResponse());
      return;
    }

    res.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: exception.message,
    });
  }
}
