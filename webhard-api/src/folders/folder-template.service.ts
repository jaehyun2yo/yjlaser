import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FolderTemplateNode } from './dto/folder.dto';

@Injectable()
export class FolderTemplateService {
  private static readonly DEFAULT_FOLDER_TEMPLATE: FolderTemplateNode[] = [
    { name: '목형의뢰', children: [{ name: '완료' }] },
    { name: '칼선의뢰', children: [{ name: '완료' }] },
    { name: '문의' },
  ];

  private static readonly FOLDER_TEMPLATE_KEY = 'default_folder_template';

  constructor(private readonly prisma: PrismaService) {}

  async getFolderTemplate(): Promise<FolderTemplateNode[]> {
    const setting = await this.prisma.executeWithRetry(
      () =>
        this.prisma.systemSetting.findUnique({
          where: { key: FolderTemplateService.FOLDER_TEMPLATE_KEY },
        }),
      { operationName: 'folderTemplate.getFolderTemplate' }
    );

    if (setting) return setting.value as unknown as FolderTemplateNode[];
    return FolderTemplateService.DEFAULT_FOLDER_TEMPLATE;
  }

  async updateFolderTemplate(template: FolderTemplateNode[]): Promise<{ success: boolean }> {
    const jsonValue = JSON.parse(JSON.stringify(template));
    await this.prisma.executeWithRetry(
      () =>
        this.prisma.systemSetting.upsert({
          where: { key: FolderTemplateService.FOLDER_TEMPLATE_KEY },
          update: { value: jsonValue },
          create: {
            key: FolderTemplateService.FOLDER_TEMPLATE_KEY,
            value: jsonValue,
          },
        }),
      { operationName: 'folderTemplate.updateFolderTemplate' }
    );

    return { success: true };
  }
}
