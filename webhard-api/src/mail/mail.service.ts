import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import {
  type ContactNotificationData,
  buildContactSubject,
  buildContactNotificationHtml,
  buildContactNotificationText,
} from './templates/contact-notification';
import {
  type FeedbackNotificationData,
  buildFeedbackSubject,
  buildFeedbackNotificationHtml,
  buildFeedbackNotificationText,
} from './templates/feedback-notification';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

interface PasswordResetLinkData {
  to: string;
  companyName: string;
  resetLink: string;
  expiresAt: Date;
}

interface UsernameReminderData {
  to: string;
  companyName: string;
  username: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

  private readonly MAX_RETRIES = 3;
  private readonly fromName: string;
  private readonly fromEmail: string;
  private readonly adminEmail: string;
  private readonly siteUrl: string;

  constructor(private configService: ConfigService) {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPassword =
      this.configService.get<string>('SMTP_PASSWORD') ||
      this.configService.get<string>('SMTP_PASS');

    this.fromName = this.configService.get<string>('FROM_NAME') || '유진레이저목형';
    this.fromEmail = smtpUser || '';
    this.siteUrl =
      this.configService.get<string>('NEXT_PUBLIC_SITE_URL') || 'https://www.yjlaser.net';

    // Gmail deduplication fix: use SMTP_USER directly as admin email
    const configAdminEmail = this.configService.get<string>('ADMIN_EMAIL') || '';
    if (configAdminEmail === 'service@yjlaser.net' && smtpUser) {
      this.logger.warn(
        'ADMIN_EMAIL=service@yjlaser.net causes Gmail dedup — using SMTP_USER instead'
      );
      this.adminEmail = smtpUser;
    } else {
      this.adminEmail = configAdminEmail;
    }

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      this.logger.warn('SMTP not configured — email sending disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: Number(smtpPort) === 465,
      auth: { user: smtpUser, pass: smtpPassword },
    });

    this.logger.log(`Mail transporter initialized (${smtpHost}:${smtpPort})`);
  }

  canSendEmail(): boolean {
    return this.transporter !== null && !!this.fromEmail;
  }

  /** Send contact inquiry notification to admin */
  async sendContactNotification(data: ContactNotificationData): Promise<void> {
    const subject = buildContactSubject(data);
    const html = buildContactNotificationHtml(data, this.siteUrl);
    const text = buildContactNotificationText(data, this.siteUrl);

    const replyTo = data.email ? `${data.email}, ${this.adminEmail}` : this.adminEmail;

    await this.sendMail({ to: this.adminEmail, subject, html, text, replyTo });
  }

  /** Send feedback/complaint notification to admin */
  async sendFeedbackNotification(data: FeedbackNotificationData): Promise<void> {
    const subject = buildFeedbackSubject(data);
    const html = buildFeedbackNotificationHtml(data, this.siteUrl);
    const text = buildFeedbackNotificationText(data, this.siteUrl);

    const replyTo = data.companyEmail
      ? `${data.companyEmail}, ${this.adminEmail}`
      : this.adminEmail;

    await this.sendMail({ to: this.adminEmail, subject, html, text, replyTo });
  }

  /** Send password reset link to a company manager */
  async sendPasswordResetLink(data: PasswordResetLinkData): Promise<void> {
    const expiresAt = data.expiresAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const companyName = this.escapeHtml(data.companyName);
    const resetLink = this.escapeHtml(data.resetLink);
    const subject = '[유진레이저목형] 비밀번호 재설정 링크';
    const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111827;">
  <h2 style="border-bottom: 2px solid #ED6C00; padding-bottom: 12px;">비밀번호 재설정</h2>
  <p>${companyName} 계정의 비밀번호 재설정 요청이 접수되었습니다.</p>
  <p>아래 버튼을 눌러 새 비밀번호를 설정하세요. 링크는 ${this.escapeHtml(expiresAt)}까지 유효합니다.</p>
  <p style="margin: 28px 0;">
    <a href="${resetLink}" style="display: inline-block; background: #ED6C00; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 700;">비밀번호 재설정</a>
  </p>
  <p style="font-size: 13px; color: #6b7280;">요청한 적이 없다면 이 메일을 무시하세요. 기존 비밀번호는 유지됩니다.</p>
  <p style="font-size: 12px; color: #9ca3af; word-break: break-all;">${resetLink}</p>
</body></html>`;
    const text = [
      '[유진레이저목형] 비밀번호 재설정',
      '',
      `${data.companyName} 계정의 비밀번호 재설정 요청이 접수되었습니다.`,
      `아래 링크에서 새 비밀번호를 설정하세요. 링크는 ${expiresAt}까지 유효합니다.`,
      '',
      data.resetLink,
      '',
      '요청한 적이 없다면 이 메일을 무시하세요. 기존 비밀번호는 유지됩니다.',
    ].join('\n');

    await this.sendMail({ to: data.to, subject, html, text }, 1, true);
  }

  /** Send username reminder to a company manager */
  async sendUsernameReminder(data: UsernameReminderData): Promise<void> {
    const companyName = this.escapeHtml(data.companyName);
    const username = this.escapeHtml(data.username);
    const subject = '[유진레이저목형] 아이디 안내';
    const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111827;">
  <h2 style="border-bottom: 2px solid #ED6C00; padding-bottom: 12px;">아이디 안내</h2>
  <p>${companyName} 계정의 아이디 찾기 요청이 접수되었습니다.</p>
  <p>등록된 아이디는 아래와 같습니다.</p>
  <p style="font-size: 20px; font-weight: 700;">${username}</p>
  <p style="font-size: 13px; color: #6b7280;">요청한 적이 없다면 이 메일을 무시하세요.</p>
</body></html>`;
    const text = [
      '[유진레이저목형] 아이디 안내',
      '',
      `${data.companyName} 계정의 아이디 찾기 요청이 접수되었습니다.`,
      `등록된 아이디: ${data.username}`,
      '',
      '요청한 적이 없다면 이 메일을 무시하세요.',
    ].join('\n');

    await this.sendMail({ to: data.to, subject, html, text }, 1, true);
  }

  /** Send DB failure notification to admin */
  async sendDbFailureNotification(context: {
    type: 'contact' | 'feedback';
    error: string;
    data: Record<string, unknown>;
  }): Promise<void> {
    const typeLabel = context.type === 'contact' ? '문의' : '불편사항';
    const companyName = String(
      context.data.companyName || context.data.company_name || '알 수 없음'
    );
    const subject = `[DB오류] ${typeLabel} 저장 실패 — ${companyName}`;

    const dataStr = Object.entries(context.data)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${String(v).slice(0, 200)}`)
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px;">⚠️ ${typeLabel} DB 저장 실패</h2>
  <p><strong>오류:</strong> ${context.error}</p>
  <p><strong>업체명:</strong> ${companyName}</p>
  <h3>전송된 데이터:</h3>
  <pre style="background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; white-space: pre-wrap;">${dataStr}</pre>
  <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">유진레이저목형 웹사이트 자동 알림입니다.</p>
</body></html>`;

    const text = `[DB오류] ${typeLabel} 저장 실패\n오류: ${context.error}\n업체명: ${companyName}\n\n데이터:\n${dataStr}`;

    await this.sendMail({ to: this.adminEmail, subject, html, text });
  }

  /** Core send with retry (exponential backoff) */
  private async sendMail(options: SendMailOptions, attempt = 1, required = false): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Email skipped (SMTP not configured): ${options.subject}`);
      if (required) {
        throw new Error('SMTP not configured');
      }
      return;
    }

    if (!options.to) {
      this.logger.warn(`Email skipped (recipient not set): ${options.subject}`);
      if (required) {
        throw new Error('Email recipient not set');
      }
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: options.to,
        replyTo: options.replyTo,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.log(`Email sent: ${options.subject}`);
    } catch (error) {
      const reason = this.classifyMailFailure(error);
      this.logger.error(`Email failed (${attempt}/${this.MAX_RETRIES}): ${reason}`);

      if (attempt < this.MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.sendMail(options, attempt + 1, required);
      }

      this.logger.error(
        `Email permanently failed after ${this.MAX_RETRIES} retries: ${options.subject}`
      );
      if (required) {
        throw error;
      }
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private classifyMailFailure(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'mail_delivery_failed';
    }

    if (/not configured|recipient not set/i.test(error.message)) {
      return 'mail_configuration_error';
    }

    return 'mail_delivery_failed';
  }
}
