import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthModule } from '../../auth/auth.module';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeviceAuthConfig } from './device-auth.config';
import type { DeviceAccessTokenConfig } from './device-access-token.config';
import { DeviceAccessTokenService } from './device-access-token.service';
import { DeviceAdminActorHasher } from './device-admin-actor-hash';
import { DeviceAdminEnvironmentGuard } from './device-admin-environment.guard';
import { DeviceBootstrapController } from './device-bootstrap.controller';
import {
  DeviceBootstrapEnrollmentRateGuard,
  DeviceBootstrapStatusRateGuard,
  DeviceBootstrapTokenExchangeRateGuard,
} from './device-bootstrap-rate.guard';
import {
  DeviceBootstrapEnrollRequestShapeGuard,
  DeviceBootstrapStatusRequestShapeGuard,
  DeviceTokenExchangeRequestShapeGuard,
} from './device-bootstrap-request-shape.guard';
import { DeviceBootstrapRequestSourceGuard } from './device-bootstrap-request-source.guard';
import { DeviceBootstrapRateStore } from './device-bootstrap-rate-store';
import { DeviceEnrollmentAdminRequestShapeGuard } from './device-enrollment-admin-request-shape.guard';
import { DeviceEnrollmentAdminEmptyBodyGuard } from './device-enrollment-admin-empty-body.guard';
import { DeviceEnrollmentAdminSessionSourceGuard } from './device-enrollment-admin-session-source.guard';
import { DeviceEnrollmentController } from './device-enrollment.controller';
import { DeviceEnrollmentService } from './device-enrollment.service';
import { DeviceManagementController } from './device-management.controller';
import { DeviceManagementNoStoreMiddleware } from './device-management-no-store.middleware';
import { DeviceManagementService } from './device-management.service';
import { DeviceTokenExchangeRequestHasher } from './device-token-exchange-hash';
import { DeviceTokenExchangeController } from './device-token-exchange.controller';
import { DeviceTokenExchangeService } from './device-token-exchange.service';
import { DeviceBearerController } from './device-bearer.controller';
import { DeviceBearerNoStoreMiddleware } from './device-bearer-no-store.middleware';
import { DeviceBearerRequestSourceGuard } from './device-bearer-request-source.guard';
import { DeviceBearerGuard } from './device-bearer.guard';
import { DeviceHeartbeatRateGuard } from './device-heartbeat-rate.guard';
import { DeviceHeartbeatService } from './device-heartbeat.service';
import {
  DeviceCredentialRotationBearerController,
  DeviceCredentialRotationController,
} from './device-credential-rotation.controller';
import { DeviceCredentialRotationService } from './device-credential-rotation.service';
import { DeviceRotationBearerGuard } from './device-rotation-bearer.guard';
import {
  DeviceRotationAckRequestShapeGuard,
  DeviceRotationPrepareRequestShapeGuard,
} from './device-rotation-request-shape.guard';
import { DeviceRotationAdminRequestShapeGuard } from './device-rotation-admin-request-shape.guard';
import { DeviceRotationFeatureGateMiddleware } from './device-rotation-feature-gate.middleware';
import {
  loadDeviceAuthRuntimeConfigFromConfigService,
  type DeviceAuthRuntimeConfig,
  type DeviceEnrollmentRuntimeOptions,
  type DeviceAuthRotationRuntimeOptions,
} from './device-auth.runtime-config';
import {
  DEVICE_ADMIN_ACTOR_HASHER,
  DEVICE_ACCESS_TOKEN_CONFIG,
  DEVICE_ACCESS_TOKEN_SERVICE,
  DEVICE_AUTH_CONFIG,
  DEVICE_AUTH_RUNTIME_CONFIG,
  DEVICE_ENROLLMENT_SERVICE,
  DEVICE_ENROLLMENT_OPTIONS,
  DEVICE_MANAGEMENT_SERVICE,
  DEVICE_AUTH_ROTATION_OPTIONS,
  DEVICE_CREDENTIAL_ROTATION_SERVICE,
  DEVICE_TOKEN_EXCHANGE_REQUEST_HASHER,
  DEVICE_TOKEN_EXCHANGE_SERVICE,
} from './device-auth.tokens';

export {
  DEVICE_ADMIN_ACTOR_HASHER,
  DEVICE_ACCESS_TOKEN_CONFIG,
  DEVICE_ACCESS_TOKEN_SERVICE,
  DEVICE_AUTH_CONFIG,
  DEVICE_AUTH_RUNTIME_CONFIG,
  DEVICE_ENROLLMENT_SERVICE,
  DEVICE_ENROLLMENT_OPTIONS,
  DEVICE_MANAGEMENT_SERVICE,
  DEVICE_AUTH_ROTATION_OPTIONS,
  DEVICE_CREDENTIAL_ROTATION_SERVICE,
  DEVICE_TOKEN_EXCHANGE_REQUEST_HASHER,
  DEVICE_TOKEN_EXCHANGE_SERVICE,
} from './device-auth.tokens';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, JwtModule.register({})],
  controllers: [
    DeviceEnrollmentController,
    DeviceManagementController,
    DeviceBootstrapController,
    DeviceTokenExchangeController,
    DeviceBearerController,
    DeviceCredentialRotationController,
    DeviceCredentialRotationBearerController,
  ],
  providers: [
    {
      provide: DEVICE_AUTH_RUNTIME_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): DeviceAuthRuntimeConfig =>
        loadDeviceAuthRuntimeConfigFromConfigService(configService),
    },
    {
      provide: DEVICE_AUTH_CONFIG,
      inject: [DEVICE_AUTH_RUNTIME_CONFIG],
      useFactory: (runtimeConfig: DeviceAuthRuntimeConfig): DeviceAuthConfig =>
        runtimeConfig.deviceAuthConfig,
    },
    {
      provide: DEVICE_ENROLLMENT_OPTIONS,
      inject: [DEVICE_AUTH_RUNTIME_CONFIG],
      useFactory: (runtimeConfig: DeviceAuthRuntimeConfig): DeviceEnrollmentRuntimeOptions =>
        runtimeConfig.enrollmentOptions,
    },
    {
      provide: DEVICE_ADMIN_ACTOR_HASHER,
      inject: [DEVICE_AUTH_RUNTIME_CONFIG],
      useFactory: (runtimeConfig: DeviceAuthRuntimeConfig): DeviceAdminActorHasher =>
        runtimeConfig.adminActorHasher,
    },
    {
      provide: DEVICE_AUTH_ROTATION_OPTIONS,
      inject: [DEVICE_AUTH_RUNTIME_CONFIG],
      useFactory: (runtimeConfig: DeviceAuthRuntimeConfig): DeviceAuthRotationRuntimeOptions =>
        runtimeConfig.rotationOptions,
    },
    {
      provide: DEVICE_ACCESS_TOKEN_CONFIG,
      inject: [DEVICE_AUTH_RUNTIME_CONFIG],
      useFactory: (runtimeConfig: DeviceAuthRuntimeConfig): DeviceAccessTokenConfig =>
        runtimeConfig.accessTokenConfig,
    },
    {
      provide: DEVICE_TOKEN_EXCHANGE_REQUEST_HASHER,
      inject: [DEVICE_AUTH_RUNTIME_CONFIG],
      useFactory: (runtimeConfig: DeviceAuthRuntimeConfig): DeviceTokenExchangeRequestHasher =>
        runtimeConfig.tokenExchangeRequestHasher,
    },
    {
      provide: DEVICE_ACCESS_TOKEN_SERVICE,
      inject: [JwtService, DEVICE_ACCESS_TOKEN_CONFIG],
      useFactory: (
        jwtService: JwtService,
        accessTokenConfig: DeviceAccessTokenConfig
      ): DeviceAccessTokenService => new DeviceAccessTokenService(jwtService, accessTokenConfig),
    },
    {
      provide: DEVICE_ENROLLMENT_SERVICE,
      inject: [PrismaService, DEVICE_AUTH_CONFIG, DEVICE_ENROLLMENT_OPTIONS],
      useFactory: (
        prisma: PrismaService,
        config: DeviceAuthConfig,
        enrollmentOptions: DeviceEnrollmentRuntimeOptions
      ): DeviceEnrollmentService => new DeviceEnrollmentService(prisma, config, enrollmentOptions),
    },
    {
      provide: DEVICE_MANAGEMENT_SERVICE,
      inject: [
        PrismaService,
        DEVICE_AUTH_CONFIG,
        DEVICE_ENROLLMENT_OPTIONS,
        DEVICE_ENROLLMENT_SERVICE,
      ],
      useFactory: (
        prisma: PrismaService,
        config: DeviceAuthConfig,
        enrollmentOptions: DeviceEnrollmentRuntimeOptions,
        enrollmentService: DeviceEnrollmentService
      ): DeviceManagementService =>
        new DeviceManagementService(prisma, config, enrollmentOptions, enrollmentService),
    },
    {
      provide: DEVICE_CREDENTIAL_ROTATION_SERVICE,
      inject: [
        PrismaService,
        DEVICE_AUTH_CONFIG,
        DEVICE_AUTH_ROTATION_OPTIONS,
        DEVICE_ENROLLMENT_OPTIONS,
        DEVICE_ACCESS_TOKEN_SERVICE,
      ],
      useFactory: (
        prisma: PrismaService,
        config: DeviceAuthConfig,
        rotationOptions: DeviceAuthRotationRuntimeOptions,
        enrollmentOptions: DeviceEnrollmentRuntimeOptions,
        accessTokenService: DeviceAccessTokenService
      ): DeviceCredentialRotationService =>
        new DeviceCredentialRotationService(
          prisma,
          config,
          rotationOptions,
          enrollmentOptions,
          accessTokenService
        ),
    },
    {
      provide: DEVICE_TOKEN_EXCHANGE_SERVICE,
      inject: [
        PrismaService,
        DEVICE_AUTH_CONFIG,
        DEVICE_ENROLLMENT_OPTIONS,
        DEVICE_ACCESS_TOKEN_SERVICE,
        DEVICE_TOKEN_EXCHANGE_REQUEST_HASHER,
        DEVICE_AUTH_ROTATION_OPTIONS,
      ],
      useFactory: (
        prisma: PrismaService,
        config: DeviceAuthConfig,
        enrollmentOptions: DeviceEnrollmentRuntimeOptions,
        accessTokenService: DeviceAccessTokenService,
        requestHasher: DeviceTokenExchangeRequestHasher,
        rotationOptions: DeviceAuthRotationRuntimeOptions
      ): DeviceTokenExchangeService =>
        new DeviceTokenExchangeService(
          prisma,
          config,
          enrollmentOptions,
          accessTokenService,
          requestHasher,
          rotationOptions
        ),
    },
    {
      provide: DeviceBootstrapRateStore,
      inject: [ConfigService, DEVICE_AUTH_CONFIG],
      useFactory: (
        configService: ConfigService,
        deviceAuthConfig: DeviceAuthConfig
      ): DeviceBootstrapRateStore =>
        DeviceBootstrapRateStore.fromConfigService(configService, deviceAuthConfig.environment, {
          fetch: globalThis.fetch,
        }),
    },
    AdminGuard,
    SessionAuthGuard,
    DeviceAdminEnvironmentGuard,
    DeviceEnrollmentAdminSessionSourceGuard,
    DeviceEnrollmentAdminRequestShapeGuard,
    DeviceEnrollmentAdminEmptyBodyGuard,
    DeviceManagementNoStoreMiddleware,
    DeviceBootstrapRequestSourceGuard,
    DeviceBootstrapEnrollRequestShapeGuard,
    DeviceBootstrapStatusRequestShapeGuard,
    DeviceTokenExchangeRequestShapeGuard,
    DeviceBootstrapEnrollmentRateGuard,
    DeviceBootstrapStatusRateGuard,
    DeviceBootstrapTokenExchangeRateGuard,
    DeviceBearerRequestSourceGuard,
    DeviceBearerGuard,
    DeviceHeartbeatRateGuard,
    DeviceHeartbeatService,
    DeviceBearerNoStoreMiddleware,
    DeviceRotationAdminRequestShapeGuard,
    DeviceRotationPrepareRequestShapeGuard,
    DeviceRotationAckRequestShapeGuard,
    DeviceRotationBearerGuard,
    DeviceRotationFeatureGateMiddleware,
  ],
  exports: [
    DEVICE_ENROLLMENT_SERVICE,
    DEVICE_AUTH_CONFIG,
    DEVICE_ENROLLMENT_OPTIONS,
    DEVICE_ADMIN_ACTOR_HASHER,
    DEVICE_MANAGEMENT_SERVICE,
    DEVICE_ACCESS_TOKEN_CONFIG,
    DEVICE_TOKEN_EXCHANGE_REQUEST_HASHER,
    DEVICE_ACCESS_TOKEN_SERVICE,
    DEVICE_TOKEN_EXCHANGE_SERVICE,
    DEVICE_AUTH_ROTATION_OPTIONS,
    DEVICE_CREDENTIAL_ROTATION_SERVICE,
    DeviceBearerRequestSourceGuard,
    DeviceBearerGuard,
  ],
})
export class DeviceAuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(DeviceRotationFeatureGateMiddleware)
      .forRoutes(DeviceCredentialRotationController, DeviceCredentialRotationBearerController);
    consumer.apply(DeviceManagementNoStoreMiddleware).forRoutes(DeviceManagementController);
    consumer.apply(DeviceBearerNoStoreMiddleware).forRoutes(DeviceBearerController);
    consumer.apply(DeviceManagementNoStoreMiddleware).forRoutes(DeviceCredentialRotationController);
    consumer
      .apply(DeviceBearerNoStoreMiddleware)
      .forRoutes(DeviceCredentialRotationBearerController);
  }
}
