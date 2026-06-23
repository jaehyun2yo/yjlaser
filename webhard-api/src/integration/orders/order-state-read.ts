export type OrderStateReadSource = Record<string, unknown> & {
  productionStatus?: string | null;
  confirmationStatus?: string | null;
  classificationStatus?: string | null;
  nestingStatus?: string | null;
  billingStatus?: string | null;
};

export type OrderStateReadModel = {
  production_status: string | null;
  confirmation_status: string | null;
  classification_status: string | null;
  nesting_status: string | null;
  billing_status: string | null;
};

export function mapOrderStateReadModel(order: OrderStateReadSource): OrderStateReadModel {
  return {
    production_status: order.productionStatus ?? null,
    confirmation_status: order.confirmationStatus ?? null,
    classification_status: order.classificationStatus ?? null,
    nesting_status: order.nestingStatus ?? null,
    billing_status: order.billingStatus ?? null,
  };
}
