import { ConflictError, newId, validator } from '@estateops/kernel';

export const MAX_OPEN_PER_CUSTOMER = 10;

/**
 * open      the customer is waiting for staff
 * answered  staff replied; the customer may add more, which reopens it
 * closed    done; a new message from the customer reopens it
 */
export const SUPPORT_STATUSES = Object.freeze(['open', 'answered', 'closed']);

function checkText({ subject, body }) {
  const v = validator('The message could not be sent');
  if (subject !== undefined) {
    v.check(
      typeof subject === 'string' && subject.trim().length >= 3,
      'subject',
      'Give the request a short subject',
    );
    v.check(
      String(subject).trim().length <= 120,
      'subject',
      'The subject is too long (120 characters at most)',
    );
  }
  v.check(typeof body === 'string' && body.trim().length >= 1, 'message', 'Write your message');
  v.check(
    String(body ?? '').trim().length <= 4000,
    'message',
    'The message is too long (4,000 characters at most)',
  );
  v.done();
}

export function openRequest(
  { tenantId, customerId, bookingId = null, subject, body, authorName },
  { id = newId(), messageId = newId(), now },
) {
  checkText({ subject, body });
  return {
    request: {
      id,
      tenantId,
      customerId,
      bookingId,
      subject: subject.trim(),
      status: 'open',
      createdAt: now,
      lastMessageAt: now,
      closedAt: null,
    },
    message: {
      id: messageId,
      tenantId,
      requestId: id,
      authorKind: 'customer',
      authorName,
      body: body.trim(),
      createdAt: now,
    },
  };
}

export function newMessage(request, { authorKind, authorName, body }, { id = newId(), now }) {
  checkText({ body });
  if (authorKind === 'staff' && request.status === 'closed') {
    throw new ConflictError('SUPPORT_CLOSED', 'This request is closed; reopen it to reply');
  }
  // the customer speaking makes it theirs to be answered again; staff speaking marks it answered
  const status = authorKind === 'customer' ? 'open' : 'answered';
  return {
    message: {
      id,
      tenantId: request.tenantId,
      requestId: request.id,
      authorKind,
      authorName,
      body: body.trim(),
      createdAt: now,
    },
    request: { ...request, status, lastMessageAt: now, closedAt: null },
  };
}

export function closeRequest(request, now) {
  if (request.status === 'closed') return request;
  return { ...request, status: 'closed', closedAt: now };
}

export function reopenRequest(request) {
  if (request.status !== 'closed') return request;
  return { ...request, status: 'open', closedAt: null };
}
