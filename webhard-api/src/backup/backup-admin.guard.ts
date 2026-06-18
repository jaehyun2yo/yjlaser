import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionUser } from '../auth/auth.service';

export type BackupPermission = 'backup:read' | 'backup:write' | 'backup:execute';

export const BACKUP_PERMISSION_KEY = 'backup:permission';
const BACKUP_WILDCARD_PERMISSION = 'backup:*';

export const RequireBackupPermission = (permission: BackupPermission) =>
  SetMetadata(BACKUP_PERMISSION_KEY, permission);

interface BackupApiKeyInfo {
  id: string;
  programType: string;
  permissions: string[];
}

type BackupRequest = Request & {
  user?: SessionUser;
  apiKeyInfo?: BackupApiKeyInfo;
};

@Injectable()
export class BackupAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<BackupRequest>();
    const requiredPermission = this.getRequiredPermission(context);

    if (!requiredPermission) {
      throw new ForbiddenException('Backup permission metadata required');
    }

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Backup admin access required');
    }

    if (request.apiKeyInfo) {
      if (this.hasBackupPermission(request.apiKeyInfo.permissions, requiredPermission)) {
        return true;
      }

      throw new ForbiddenException(`${requiredPermission} permission required`);
    }

    if (user.userType === 'admin') {
      return true;
    }

    throw new ForbiddenException('Backup admin access required');
  }

  private getRequiredPermission(context: ExecutionContext): BackupPermission | undefined {
    return (
      Reflect.getMetadata(BACKUP_PERMISSION_KEY, context.getHandler()) ??
      Reflect.getMetadata(BACKUP_PERMISSION_KEY, context.getClass())
    );
  }

  private hasBackupPermission(
    permissions: string[],
    requiredPermission: BackupPermission
  ): boolean {
    return (
      permissions.includes(requiredPermission) || permissions.includes(BACKUP_WILDCARD_PERMISSION)
    );
  }
}
