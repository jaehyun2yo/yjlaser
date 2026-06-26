import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  ParseUUIDPipe,
  Patch,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SessionUser } from '../../auth/auth.service';
import { ContactsService } from '../../contacts/contacts.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireIntegrationPermission } from '../auth/require-integration-permission.decorator';
import { IntegrationUpdateContactStageDto } from './dto/update-contact-stage.dto';

const INTEGRATION_API_KEY_REQUIRED_CODE = 'INTEGRATION_API_KEY_REQUIRED';
const INTEGRATION_PROGRAM_NOT_ALLOWED_CODE = 'INTEGRATION_PROGRAM_NOT_ALLOWED';
const INTEGRATION_STAGE_TRANSITION_NOT_ALLOWED_CODE = 'INTEGRATION_STAGE_TRANSITION_NOT_ALLOWED';
const INTEGRATION_ACTOR_MISMATCH_CODE = 'INTEGRATION_ACTOR_MISMATCH';

const PROGRAM_STAGE_TRANSITIONS: Record<
  string,
  { from: Array<string | null>; to: string; description: string }
> = {
  management_program: {
    from: ['drawing_confirmed'],
    to: 'laser',
    description: 'management_program can only move drawing_confirmed -> laser',
  },
  nesting_program: {
    from: ['laser'],
    to: 'cutting',
    description: 'nesting_program can only move laser -> cutting',
  },
};

@Controller('integration/contacts')
@UseGuards(ApiKeyGuard)
export class IntegrationContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Patch(':id/process-stage')
  @RequireIntegrationPermission('contact/process-stage:write')
  async updateProcessStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IntegrationUpdateContactStageDto,
    @CurrentUser() user: SessionUser
  ) {
    if (user.userType !== 'integration') {
      throw new ForbiddenException({
        code: INTEGRATION_API_KEY_REQUIRED_CODE,
        message: 'Integration API key required',
      });
    }

    const requestedActorName = dto.actorName?.trim();
    if (requestedActorName && requestedActorName !== user.programType) {
      throw new ForbiddenException({
        code: INTEGRATION_ACTOR_MISMATCH_CODE,
        message: 'actorName must match integration programType',
      });
    }

    const actorName = user.programType || 'integration_program';
    const expectedCurrentStage = await this.assertAllowedProgramTransition(
      id,
      user.programType,
      dto.processStage
    );
    return this.contactsService.updateProcessStage(
      id,
      dto.processStage,
      {
        actorType: 'system',
        actorName,
      },
      {
        expectedCurrentStage,
      }
    );
  }

  private async assertAllowedProgramTransition(
    contactId: string,
    programType: string | undefined,
    nextStage: string
  ): Promise<string | null> {
    const rule = programType ? PROGRAM_STAGE_TRANSITIONS[programType] : undefined;
    if (!rule) {
      throw new ForbiddenException({
        code: INTEGRATION_PROGRAM_NOT_ALLOWED_CODE,
        message: 'Integration program cannot mutate Contact processStage',
      });
    }

    if (nextStage !== rule.to) {
      throw new UnprocessableEntityException({
        code: INTEGRATION_STAGE_TRANSITION_NOT_ALLOWED_CODE,
        message: rule.description,
      });
    }

    const contact = (await this.contactsService.findOne(contactId)) as {
      process_stage?: string | null;
      processStage?: string | null;
    };
    const currentStage = contact.process_stage ?? contact.processStage ?? null;
    if (currentStage === nextStage) {
      return currentStage;
    }

    if (!rule.from.includes(currentStage)) {
      throw new UnprocessableEntityException({
        code: INTEGRATION_STAGE_TRANSITION_NOT_ALLOWED_CODE,
        message: rule.description,
      });
    }

    return currentStage;
  }
}
