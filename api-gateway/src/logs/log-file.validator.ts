import { FileValidator } from '@nestjs/common';
import { isAllowedLogFile } from './upload.constants';

export class LogFileValidator extends FileValidator<Record<string, any>> {
    constructor() {
        super({});
    }

    isValid(file?: Express.Multer.File): boolean {
        if (!file) {
            return false;
        }
        return isAllowedLogFile(file.originalname, file.mimetype);
    }

    buildErrorMessage(): string {
        return 'Invalid file type. Only .log and .txt files are allowed.';
    }
}