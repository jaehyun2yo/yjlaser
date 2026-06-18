import { Controller, Post, Get, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { ApiKeyService } from './api-key.service';
import { IsString, IsOptional, IsArray } from 'class-validator';

class CreateApiKeyDto {
  @IsString()
  name: string;

  @IsString()
  programType: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

@Controller('integration/api-keys')
@UseGuards(SessionAuthGuard, AdminGuard)
export class ApiKeyController {
  constructor(private apiKeyService: ApiKeyService) {}

  @Post()
  async createApiKey(@Body() dto: CreateApiKeyDto) {
    return this.apiKeyService.createApiKey(dto.name, dto.programType, dto.permissions ?? []);
  }

  @Get()
  async listApiKeys() {
    return this.apiKeyService.listApiKeys();
  }

  @Delete(':id')
  async deleteApiKey(@Param('id') id: string) {
    await this.apiKeyService.deleteApiKey(id);
    return { success: true };
  }
}
