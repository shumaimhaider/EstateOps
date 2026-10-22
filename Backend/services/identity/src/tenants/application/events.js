import { EVENT, buildEvent } from '@estateops/contracts';

export const PRODUCER = 'identity';

export const tenantUpserted = (tenant, now) =>
  buildEvent({
    type: EVENT.TENANT_UPSERTED,
    tenantId: tenant.id,
    producer: PRODUCER,
    now,
    data: {
      slug: tenant.slug,
      name: tenant.name,
      currency: tenant.currency,
      locale: tenant.locale,
      time_zone: tenant.timeZone,
      area_unit: tenant.areaUnit,
    },
  });
