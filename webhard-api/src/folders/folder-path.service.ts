import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type FolderLookupClient = Pick<Prisma.TransactionClient, 'webhardFolder'>;
export type FolderPathUpdateClient = Pick<
  Prisma.TransactionClient,
  'webhardFolder' | '$executeRaw'
>;

@Injectable()
export class FolderPathService {
  private readonly logger = new Logger(FolderPathService.name);

  constructor(private readonly prisma: PrismaService) {}

  async computeFolderPath(
    parentId: string | null,
    name: string,
    client: FolderLookupClient = this.prisma
  ): Promise<string> {
    if (!parentId) return `/${name}`;

    const parent = await client.webhardFolder.findUnique({
      where: { id: parentId },
      select: { path: true, name: true, parentId: true },
    });
    if (!parent) return `/${name}`;

    if (parent.path && parent.path !== '/') {
      return `${parent.path}/${name}`;
    }

    const segments = [parent.name];
    let currentId: string | null = parent.parentId;
    let depth = 0;
    while (currentId && depth < 10) {
      const row: { name: string; parentId: string | null } | null =
        await client.webhardFolder.findUnique({
          where: { id: currentId },
          select: { name: true, parentId: true },
        });
      if (!row) break;
      segments.unshift(row.name);
      currentId = row.parentId;
      depth++;
    }
    return '/' + segments.join('/') + '/' + name;
  }

  async updateDescendantPaths(
    folderId: string,
    newPath: string,
    client: FolderPathUpdateClient = this.prisma,
    oldPathOverride?: string | null
  ): Promise<void> {
    const existing = oldPathOverride
      ? null
      : await client.webhardFolder.findUnique({
          where: { id: folderId },
          select: { path: true },
        });
    const oldPath = oldPathOverride ?? existing?.path ?? null;

    await client.webhardFolder.update({
      where: { id: folderId },
      data: { path: newPath },
    });

    await this.replaceDescendantPathPrefix(client, folderId, oldPath, newPath);
  }

  async replaceDescendantPathPrefix(
    client: FolderPathUpdateClient,
    folderId: string,
    oldPath: string | null,
    newPath: string
  ): Promise<number> {
    if (!oldPath || oldPath === newPath) {
      return 0;
    }

    const oldPathLength = oldPath.length;
    const suffixStart = oldPathLength + 1;
    const affected = await client.$executeRaw(
      Prisma.sql`
        UPDATE "webhard_folders"
        SET "path" = ${newPath} || substring("path" from ${suffixStart}::integer)
        WHERE "deleted_at" IS NULL
          AND "id" <> ${folderId}
          AND "path" IS NOT NULL
          AND left("path", ${oldPathLength}::integer) = ${oldPath}
          AND substring("path" from ${suffixStart}::integer for 1) = '/'
      `
    );

    this.logger.debug(
      `Updated descendant folder paths by prefix: folderId=${folderId}, affected=${affected}`
    );
    return affected;
  }
}
