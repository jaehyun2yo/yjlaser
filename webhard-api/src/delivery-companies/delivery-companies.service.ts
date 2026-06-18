import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeliveryCompaniesService {
  private readonly logger = new Logger(DeliveryCompaniesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByCompanyId(companyId: bigint) {
    const companies = await this.prisma.deliveryCompany.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    return companies.map((c) => ({
      id: Number(c.id),
      company_id: Number(c.companyId),
      name: c.name,
      phone: c.phone,
      address: c.address,
      created_at: c.createdAt?.toISOString() || null,
      updated_at: c.updatedAt?.toISOString() || null,
    }));
  }

  async create(data: { companyId: number; name: string; phone: string; address: string }) {
    const company = await this.prisma.deliveryCompany.create({
      data: {
        companyId: BigInt(data.companyId),
        name: data.name,
        phone: data.phone,
        address: data.address,
      },
    });

    return {
      id: Number(company.id),
      company_id: Number(company.companyId),
      name: company.name,
      phone: company.phone,
      address: company.address,
    };
  }

  async update(
    id: bigint,
    data: {
      name?: string;
      phone?: string;
      address?: string;
    }
  ) {
    const company = await this.prisma.deliveryCompany.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    return {
      id: Number(company.id),
      company_id: Number(company.companyId),
      name: company.name,
      phone: company.phone,
      address: company.address,
    };
  }

  async delete(id: bigint) {
    await this.prisma.deliveryCompany.delete({ where: { id } });
    return { success: true };
  }
}
