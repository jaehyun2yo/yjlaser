import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { FilesModule } from './files/files.module';
import { FoldersModule } from './folders/folders.module';
import { TrashModule } from './trash/trash.module';
import { HealthModule } from './health/health.module';
import { SearchModule } from './search/search.module';
import { SettingsModule } from './settings/settings.module';
import { ErpModule } from './erp/erp.module';
import { IntegrationModule } from './integration/integration.module';
import { EventsModule } from './events/events.module';
import { ContactsModule } from './contacts/contacts.module';
import { CompaniesModule } from './companies/companies.module';
import { BookingsModule } from './bookings/bookings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SessionsModule } from './sessions/sessions.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ShareLinksModule } from './share-links/share-links.module';
import { DeliveryCompaniesModule } from './delivery-companies/delivery-companies.module';
import { PushSubscriptionsModule } from './push-subscriptions/push-subscriptions.module';
import { SyncModule } from './sync/sync.module';
import { PublicDataModule } from './public-data/public-data.module';
import { MailModule } from './mail/mail.module';
import { BackupModule } from './backup/backup.module';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env.local', '../.env', '.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
      ttl: 60000, // 60s default TTL (ms)
      max: 1000,
    }),
    PrismaModule,
    AuthModule,
    StorageModule,
    FilesModule,
    FoldersModule,
    TrashModule,
    HealthModule,
    SearchModule,
    SettingsModule,
    ErpModule,
    IntegrationModule,
    EventsModule,
    ContactsModule,
    CompaniesModule,
    BookingsModule,
    NotificationsModule,
    SessionsModule,
    ActivityLogsModule,
    FeedbackModule,
    ShareLinksModule,
    DeliveryCompaniesModule,
    PushSubscriptionsModule,
    SyncModule,
    PublicDataModule,
    MailModule,
    BackupModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  ],
})
export class AppModule {}
