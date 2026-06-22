import {
  ORDER_STATE_AXIS_DEFINITIONS,
  type OrderStateAxis,
  type OrderStateDbField,
  type OrderStateEventField,
  isOrderStateValue,
} from './order-state.constants';

export type OrderStateEventEffectDefinition = {
  target: 'order';
  axis: OrderStateAxis;
  dbField: OrderStateDbField;
  eventField: OrderStateEventField;
};

export type OrderStateEventEffect = OrderStateEventEffectDefinition & {
  value: string;
};

export type OrderStateEventEffectFailureReason = 'MISSING_REQUIRED_STATUS' | 'UNKNOWN_STATUS_VALUE';

export type OrderStateEventEffectResolution =
  | {
      ok: true;
      effects: OrderStateEventEffect[];
    }
  | {
      ok: false;
      reason: OrderStateEventEffectFailureReason;
      eventField: OrderStateEventField;
      value?: unknown;
      effects: [];
    };

function defineOrderStateEventEffect(axis: OrderStateAxis): OrderStateEventEffectDefinition {
  const definition = ORDER_STATE_AXIS_DEFINITIONS[axis];
  return {
    target: 'order',
    axis,
    dbField: definition.dbField,
    eventField: definition.eventField,
  };
}

export const ORDER_STATE_EVENT_EFFECT_DEFINITIONS: Record<
  string,
  readonly OrderStateEventEffectDefinition[]
> = {
  'file.synced': [defineOrderStateEventEffect('production')],
  'confirmation.sent': [defineOrderStateEventEffect('confirmation')],
  'confirmation.waiting': [defineOrderStateEventEffect('confirmation')],
  'confirmation.received': [defineOrderStateEventEffect('confirmation')],
  'confirmation.revision_requested': [defineOrderStateEventEffect('confirmation')],
  'dxf.prepared': [defineOrderStateEventEffect('production')],
  'drawing.classified': [defineOrderStateEventEffect('classification')],
  'nesting.started': [defineOrderStateEventEffect('nesting')],
  'nesting.completed': [defineOrderStateEventEffect('nesting')],
  'nesting.failed': [defineOrderStateEventEffect('nesting')],
  'invoice.generated': [defineOrderStateEventEffect('billing')],
  'invoice.sent': [defineOrderStateEventEffect('billing')],
  'invoice.failed': [defineOrderStateEventEffect('billing')],
  'delivery.completed': [defineOrderStateEventEffect('production')],
};

export function resolveOrderStateEventEffects(
  eventType: string,
  payload: Record<string, unknown>
): OrderStateEventEffectResolution {
  const definitions = ORDER_STATE_EVENT_EFFECT_DEFINITIONS[eventType] ?? [];
  const effects: OrderStateEventEffect[] = [];

  for (const definition of definitions) {
    const value = payload[definition.eventField];
    if (typeof value !== 'string' || value.length === 0) {
      return {
        ok: false,
        reason: 'MISSING_REQUIRED_STATUS',
        eventField: definition.eventField,
        effects: [],
      };
    }

    if (!isOrderStateValue(definition.axis, value)) {
      return {
        ok: false,
        reason: 'UNKNOWN_STATUS_VALUE',
        eventField: definition.eventField,
        value,
        effects: [],
      };
    }

    effects.push({ ...definition, value });
  }

  return {
    ok: true,
    effects,
  };
}
