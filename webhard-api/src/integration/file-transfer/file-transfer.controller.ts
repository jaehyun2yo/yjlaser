import { Controller, Post, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';

/**
 * File transfer pipeline interface (not yet implemented).
 * Reserved for future automation: webhard → local work folder download.
 *
 * All endpoints return 501 Not Implemented until this module is built out.
 * Access is restricted to API key holders via ApiKeyGuard.
 */
@Controller('integration/file-transfer')
@UseGuards(ApiKeyGuard)
export class FileTransferController {
  @Post('queue')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  async queueTransfer() {
    return {
      status: 501,
      message:
        'File transfer pipeline is not yet implemented. This interface is reserved for future development.',
    };
  }

  @Get('status')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  async getTransferStatus() {
    return {
      status: 501,
      message:
        'File transfer pipeline is not yet implemented. This interface is reserved for future development.',
    };
  }

  @Post('confirm')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  async confirmTransfer() {
    return {
      status: 501,
      message:
        'File transfer pipeline is not yet implemented. This interface is reserved for future development.',
    };
  }
}
