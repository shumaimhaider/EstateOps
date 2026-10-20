import { z } from 'zod';
import { parseMajorToMinor } from '@/shared/lib/money.js';

/** Form values are strings from inputs; this schema validates them on the client. */
export function createUnitFormSchema({ currency, t }) {
  const wholeNumber = (key) => z.string().regex(/^\d*$/, t(`inventory:form.errors.${key}`));
  return z.object({
    projectId: z.string().min(1, t('inventory:form.errors.project')),
    unitNo: z.string().trim().min(1, t('inventory:form.errors.unitNo')),
    kind: z.enum(['plot', 'flat', 'villa', 'shop']),
    areaValue: z.string().refine((v) => Number(v) > 0, t('inventory:form.errors.area')),
    areaUnit: z.enum(['marla', 'kanal', 'sq_ft', 'sq_yd', 'sq_m']),
    bedrooms: wholeNumber('bedrooms'),
    facing: z.string(),
    view: z.string(),
    isCorner: z.boolean(),
    parkingSpaces: wholeNumber('parking'),
    listPrice: z
      .string()
      .refine((v) => parseMajorToMinor(v, currency) !== null, t('inventory:form.errors.price')),
  });
}

export function initialUnitFormValues({ areaUnit }) {
  return {
    projectId: '',
    unitNo: '',
    kind: 'plot',
    areaValue: '',
    areaUnit,
    bedrooms: '',
    facing: '',
    view: '',
    isCorner: false,
    parkingSpaces: '0',
    listPrice: '',
  };
}

/** Validated form values -> UnitDraft (the model the repository accepts). */
export function toUnitDraft(values, currency) {
  return {
    projectId: values.projectId,
    unitNo: values.unitNo.trim(),
    kind: values.kind,
    area: { value: Number(values.areaValue), unit: values.areaUnit },
    bedrooms: values.bedrooms === '' ? null : Number(values.bedrooms),
    facing: values.facing || null,
    view: values.view || null,
    isCorner: values.isCorner,
    parkingSpaces: Number(values.parkingSpaces || 0),
    listPrice: { minor: parseMajorToMinor(values.listPrice, currency), currency },
  };
}
