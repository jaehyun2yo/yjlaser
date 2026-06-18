import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  StockInDto,
  StockOutDto,
  StockAdjustDto,
  InventoryQueryDto,
  TransactionQueryDto,
} from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private prisma: PrismaService) {}

  async getItems(query: InventoryQueryDto) {
    const { category, isActive, page = 1, limit = 50 } = query;

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive;

    const [total, items] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.inventoryItem.count({ where }),
          this.prisma.inventoryItem.findMany({
            where,
            orderBy: [{ category: 'asc' }, { name: 'asc' }],
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]),
      { operationName: 'getItems' }
    );

    return {
      items: items.map(this.mapItemToDto),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  async getItem(id: string) {
    const item = await this.prisma.executeWithRetry(
      () =>
        this.prisma.inventoryItem.findUnique({
          where: { id },
          include: {
            transactions: {
              orderBy: { createdAt: 'desc' },
              take: 20,
            },
          },
        }),
      { operationName: 'getItem' }
    );

    if (!item) throw new NotFoundException('Inventory item not found');

    return {
      ...this.mapItemToDto(item),
      recent_transactions: item.transactions.map(this.mapTransactionToDto),
    };
  }

  async createItem(dto: CreateInventoryItemDto) {
    const item = await this.prisma.executeWithRetry(
      () =>
        this.prisma.inventoryItem.create({
          data: {
            name: dto.name,
            category: dto.category,
            unit: dto.unit,
            currentStock: dto.currentStock ?? 0,
            minStock: dto.minStock ?? 0,
            width: dto.width,
            height: dto.height,
            thickness: dto.thickness,
            unitPrice: dto.unitPrice,
            supplier: dto.supplier,
            location: dto.location,
            memo: dto.memo,
          },
        }),
      { operationName: 'createItem' }
    );

    this.logger.log(`Inventory item created: ${item.id} (${dto.name})`);
    return this.mapItemToDto(item);
  }

  async updateItem(id: string, dto: UpdateInventoryItemDto) {
    const existing = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Inventory item not found');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.minStock !== undefined) data.minStock = dto.minStock;
    if (dto.width !== undefined) data.width = dto.width;
    if (dto.height !== undefined) data.height = dto.height;
    if (dto.thickness !== undefined) data.thickness = dto.thickness;
    if (dto.unitPrice !== undefined) data.unitPrice = dto.unitPrice;
    if (dto.supplier !== undefined) data.supplier = dto.supplier;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.memo !== undefined) data.memo = dto.memo;

    const item = await this.prisma.executeWithRetry(
      () => this.prisma.inventoryItem.update({ where: { id }, data }),
      { operationName: 'updateItem' }
    );

    return this.mapItemToDto(item);
  }

  async stockIn(id: string, dto: StockInDto) {
    const { updatedItem, transaction: txn, previousStock } =
      await this.prisma.executeWithRetry(
        () =>
          this.prisma.$transaction(async (tx) => {
            const item = await tx.inventoryItem.findUnique({ where: { id } });
            if (!item) throw new NotFoundException('Inventory item not found');

            const prev = item.currentStock;
            const updatedItem = await tx.inventoryItem.update({
              where: { id },
              data: { currentStock: { increment: dto.quantity } },
            });

            const transaction = await tx.inventoryTransaction.create({
              data: {
                itemId: id,
                type: 'in',
                quantity: dto.quantity,
                previousStock: prev,
                newStock: updatedItem.currentStock,
                reason: dto.reason,
                actorName: dto.actorName,
              },
            });

            return { updatedItem, transaction, previousStock: prev };
          }),
        { operationName: 'stockIn' }
      );

    this.logger.log(
      `Stock in: ${updatedItem.name} +${dto.quantity} (${previousStock} -> ${updatedItem.currentStock})`
    );
    return {
      item: this.mapItemToDto(updatedItem),
      transaction: this.mapTransactionToDto(txn),
    };
  }

  async stockOut(id: string, dto: StockOutDto) {
    const { updatedItem, transaction: txn, previousStock } =
      await this.prisma.executeWithRetry(
        () =>
          this.prisma.$transaction(async (tx) => {
            const item = await tx.inventoryItem.findUnique({ where: { id } });
            if (!item) throw new NotFoundException('Inventory item not found');

            if (item.currentStock < dto.quantity) {
              throw new BadRequestException(
                `Insufficient stock: current ${item.currentStock}, requested ${dto.quantity}`
              );
            }

            const prev = item.currentStock;
            const updatedItem = await tx.inventoryItem.update({
              where: { id },
              data: { currentStock: { decrement: dto.quantity } },
            });

            const transaction = await tx.inventoryTransaction.create({
              data: {
                itemId: id,
                type: 'out',
                quantity: dto.quantity,
                previousStock: prev,
                newStock: updatedItem.currentStock,
                orderId: dto.orderId,
                reason: dto.reason,
                actorName: dto.actorName,
              },
            });

            return { updatedItem, transaction, previousStock: prev };
          }),
        { operationName: 'stockOut' }
      );

    this.logger.log(
      `Stock out: ${updatedItem.name} -${dto.quantity} (${previousStock} -> ${updatedItem.currentStock})`
    );
    return {
      item: this.mapItemToDto(updatedItem),
      transaction: this.mapTransactionToDto(txn),
    };
  }

  async stockAdjust(id: string, dto: StockAdjustDto) {
    const { updatedItem, transaction: txn, previousStock } =
      await this.prisma.executeWithRetry(
        () =>
          this.prisma.$transaction(async (tx) => {
            const item = await tx.inventoryItem.findUnique({ where: { id } });
            if (!item) throw new NotFoundException('Inventory item not found');

            const prev = item.currentStock;
            const adjustQuantity = dto.newStock - prev;

            const updatedItem = await tx.inventoryItem.update({
              where: { id },
              data: { currentStock: dto.newStock },
            });

            const transaction = await tx.inventoryTransaction.create({
              data: {
                itemId: id,
                type: 'adjust',
                quantity: adjustQuantity,
                previousStock: prev,
                newStock: dto.newStock,
                reason: dto.reason,
                actorName: dto.actorName,
              },
            });

            return { updatedItem, transaction, previousStock: prev };
          }),
        { operationName: 'stockAdjust' }
      );

    this.logger.log(`Stock adjust: ${updatedItem.name} ${previousStock} -> ${dto.newStock}`);
    return {
      item: this.mapItemToDto(updatedItem),
      transaction: this.mapTransactionToDto(txn),
    };
  }

  async getTransactions(itemId: string, query: TransactionQueryDto) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Inventory item not found');

    const { type, dateFrom, dateTo, page = 1, limit = 50 } = query;

    const where: Record<string, unknown> = { itemId };
    if (type) where.type = type;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    const [total, transactions] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          this.prisma.inventoryTransaction.count({ where }),
          this.prisma.inventoryTransaction.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]),
      { operationName: 'getTransactions' }
    );

    return {
      transactions: transactions.map(this.mapTransactionToDto),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  async getLowStockAlerts() {
    const items = await this.prisma.executeWithRetry(
      () =>
        this.prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            category: string;
            unit: string;
            current_stock: number;
            min_stock: number;
          }>
        >`
          SELECT id, name, category, unit, current_stock, min_stock
          FROM inventory_items
          WHERE is_active = true
            AND min_stock > 0
            AND current_stock <= min_stock
          ORDER BY (current_stock / NULLIF(min_stock, 0)) ASC
        `,
      { operationName: 'getLowStockAlerts' }
    );

    return items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      current_stock: item.current_stock,
      min_stock: item.min_stock,
      shortage: item.min_stock - item.current_stock,
    }));
  }

  private mapItemToDto = (item: {
    id: string;
    name: string;
    category: string;
    unit: string;
    currentStock: number;
    minStock: number;
    width: number | null;
    height: number | null;
    thickness: number | null;
    unitPrice: number | null;
    supplier: string | null;
    location: string | null;
    isActive: boolean;
    memo: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    current_stock: item.currentStock,
    min_stock: item.minStock,
    is_low_stock: item.minStock > 0 && item.currentStock <= item.minStock,
    width: item.width,
    height: item.height,
    thickness: item.thickness,
    unit_price: item.unitPrice,
    supplier: item.supplier,
    location: item.location,
    is_active: item.isActive,
    memo: item.memo,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  });

  private mapTransactionToDto = (tx: {
    id: string;
    itemId: string;
    type: string;
    quantity: number;
    previousStock: number;
    newStock: number;
    orderId: string | null;
    reason: string | null;
    actorName: string | null;
    createdAt: Date;
  }) => ({
    id: tx.id,
    item_id: tx.itemId,
    type: tx.type,
    quantity: tx.quantity,
    previous_stock: tx.previousStock,
    new_stock: tx.newStock,
    order_id: tx.orderId,
    reason: tx.reason,
    actor_name: tx.actorName,
    created_at: tx.createdAt.toISOString(),
  });
}
