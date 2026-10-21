import { z } from 'zod';
import { MAX_CONTRACT_BYTES } from '../domain/contract.constants.js';

const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** The signed contract: one PDF up to 10 MB, with an optional title. */
export function createUploadFormSchema(t) {
  return z.object({
    file: z
      .custom((v) => v instanceof File, t('contracts:upload.errors.file'))
      .refine((f) => isPdf(f), t('contracts:upload.errors.pdf'))
      .refine((f) => f.size > 0 && f.size <= MAX_CONTRACT_BYTES, t('contracts:upload.errors.size')),
    title: z.string().max(80, t('contracts:upload.errors.title')),
  });
}

export const createRevisionFormSchema = (t) =>
  z.object({ note: z.string().trim().min(1, t('contracts:revise.errors.note')).max(300) });
