import {
  Body,
  Controller,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CsrfExempt } from '../../common/decorators/csrf-exempt.decorator';
import { DEVICE_TOKEN_EXCHANGE_SERVICE } from './device-auth.tokens';
import {
  DeviceBootstrapTokenExchangeRateGuard,
  getTokenExchangeRequestLease,
} from './device-bootstrap-rate.guard';
import { DeviceBootstrapRateStore } from './device-bootstrap-rate-store';
import { DeviceBootstrapRequestSourceGuard } from './device-bootstrap-request-source.guard';
import { DeviceTokenExchangeRequestShapeGuard } from './device-bootstrap-request-shape.guard';
import { DeviceTokenExchangeDto } from './dto/device-token-exchange.dto';
import { mapDeviceTokenExchangeError } from './device-token-exchange.errors';
import type { DeviceTokenExchangeService } from './device-token-exchange.service';
import type { DeviceTokenExchangeResult } from './device-auth.types';

const NO_STORE_CACHE_CONTROL = 'no-store, private';

@Controller('integration/device-auth')
@UseGuards(DeviceBootstrapRequestSourceGuard)
export class DeviceTokenExchangeController {
  public constructor(
    @Inject(DEVICE_TOKEN_EXCHANGE_SERVICE)
    private readonly tokenExchangeService: DeviceTokenExchangeService,
    private readonly rateStore: DeviceBootstrapRateStore
  ) {}

  @Post('token')
  @CsrfExempt()
  @UseGuards(DeviceTokenExchangeRequestShapeGuard, DeviceBootstrapTokenExchangeRateGuard)
  @UsePipes(createPublicTokenExchangeValidationPipe())
  public async exchange(
    @Body() dto: DeviceTokenExchangeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<DeviceTokenExchangeResult> {
    response.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
    const requestLease = getTokenExchangeRequestLease(request);

    try {
      const result = await this.tokenExchangeService.exchange({
        deviceId: dto.deviceId,
        refreshCredential: dto.refreshCredential,
        nextRefreshCredential: dto.nextRefreshCredential,
        refreshRequestId: dto.refreshRequestId,
      });
      return toPublicTokenExchangeResponse(result);
    } catch (error: unknown) {
      return mapDeviceTokenExchangeError(error);
    } finally {
      if (requestLease) {
        try {
          await this.rateStore.releaseTokenExchangeRequestLease({
            refreshRequestId: dto.refreshRequestId,
            requestLease,
          });
        } catch {
          // The dedicated store has a fail-closed result type. A defensive
          // catch keeps a release transport defect from reflecting internals.
        }
      }
    }
  }
}

function createPublicTokenExchangeValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });
}

function toPublicTokenExchangeResponse(
  result: DeviceTokenExchangeResult
): DeviceTokenExchangeResult {
  return {
    deviceId: result.deviceId,
    environment: result.environment,
    programType: result.programType,
    capabilityProfile: result.capabilityProfile,
    credentialVersion: result.credentialVersion,
    accessToken: result.accessToken,
    refreshCredentialAction: result.refreshCredentialAction,
    ...(result.rotation === undefined ? {} : { rotation: result.rotation }),
  };
}
