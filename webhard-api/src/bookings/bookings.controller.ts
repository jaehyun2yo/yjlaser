import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@Controller('bookings')
@UseGuards(ApiKeyGuard)
export class BookingsController {
  private readonly logger = new Logger(BookingsController.name);

  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * GET /api/v1/bookings
   */
  @Get()
  async findAll(
    @Query('date') date?: string,
    @Query('companyName') companyName?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('contactId') contactId?: string,
    @Query('status') status?: string,
    @Query('limit') limitRaw?: string
  ) {
    // ParseIntPipe({ optional: true }) 가 NestJS 10 + 글로벌 ValidationPipe(transform+implicitConversion)
    // 조합에서 limit 미전달 시에도 'numeric string is expected' 를 던지는 케이스가 관측되어
    // controller 내부 수동 파싱으로 전환. 빈 문자열 / 미전달 모두 명시적으로 undefined 처리.
    let limit: number | undefined;
    if (limitRaw !== undefined && limitRaw !== '') {
      const parsed = Number(limitRaw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new BadRequestException('limit must be a non-negative integer string');
      }
      limit = parsed;
    }

    const bookings = await this.bookingsService.findAll({
      date,
      companyName,
      startDate,
      endDate,
      contactId,
      status,
      limit,
    });
    return { bookings };
  }

  /**
   * GET /api/v1/bookings/available
   */
  @Get('available')
  async getAvailableSlots(@Query('date') date: string) {
    return this.bookingsService.getAvailableSlots(date);
  }

  /**
   * GET /api/v1/bookings/by-contact/:contactId
   */
  @Get('by-contact/:contactId')
  async findByContactId(@Param('contactId') contactId: string) {
    const bookings = await this.bookingsService.findByContactId(contactId);
    return { bookings };
  }

  /**
   * GET /api/v1/bookings/:id
   */
  @Get(':id')
  async findById(@Param('id', ParseBigIntPipe) id: bigint) {
    const booking = await this.bookingsService.findById(id);
    return { booking };
  }

  /**
   * POST /api/v1/bookings
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateBookingDto) {
    const booking = await this.bookingsService.create(dto);
    return { booking };
  }

  /**
   * PATCH /api/v1/bookings/:id
   */
  @Patch(':id')
  async update(@Param('id', ParseBigIntPipe) id: bigint, @Body() dto: UpdateBookingDto) {
    const booking = await this.bookingsService.update(id, dto);
    return { booking };
  }

  /**
   * DELETE /api/v1/bookings/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.bookingsService.delete(id);
  }
}
