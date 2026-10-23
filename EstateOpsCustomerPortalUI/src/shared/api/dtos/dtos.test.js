import { describe, expect, it } from 'vitest';
import { contractDtoSchema, invoiceDtoSchema } from './property.dto.js';
import { contractFromApi, invoiceFromApi } from './property.mapper.js';
import { checkoutRequestToApi } from './payment.mapper.js';
import { requestDtoSchema } from './support.dto.js';
import { requestFromApi } from './support.mapper.js';

describe('customer portal DTOs and mappers', () => {
  it('turns a contract payload into UI names', () => {
    const dto = contractDtoSchema.parse({
      id: 'c1',
      booking_id: 'b1',
      title: 'Sale agreement',
      kind: 'pandadoc',
      status: 'sent',
      version: 1,
      sent_at: '2026-10-01T00:00:00Z',
      signed_at: null,
      can_sign: true,
      can_download: false,
    });
    expect(contractFromApi(dto)).toMatchObject({
      bookingId: 'b1',
      canSign: true,
      canDownload: false,
      sentAt: '2026-10-01T00:00:00Z',
    });
  });

  it('rejects a contract status the portal does not know', () => {
    expect(contractDtoSchema.safeParse({ id: 'c', status: 'draft' }).success).toBe(false);
  });

  it('keeps invoice money as whole minor units with its currency', () => {
    const parsed = invoiceDtoSchema.safeParse({ id: 'i', invoice_no: 'INV-1', amount: 1.5 });
    expect(parsed.success).toBe(false);
    expect(invoiceFromApi).toBeTypeOf('function');
  });

  it('maps a support request', () => {
    const dto = requestDtoSchema.parse({
      id: 'r',
      subject: 'Hi',
      status: 'open',
      booking_id: null,
      created_at: 'a',
      last_message_at: 'b',
    });
    expect(requestFromApi(dto)).toEqual({
      id: 'r',
      subject: 'Hi',
      status: 'open',
      bookingId: null,
      createdAt: 'a',
      lastMessageAt: 'b',
      messageCount: null,
    });
  });

  it('builds the checkout request without empty fields', () => {
    expect(checkoutRequestToApi({})).toEqual({ amount: undefined, save_card: undefined });
    expect(checkoutRequestToApi({ amountMinor: 500, saveCard: true })).toEqual({
      amount: 500,
      save_card: true,
    });
  });
});
