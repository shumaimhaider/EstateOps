import { ConflictError, NotFoundError, PERMISSION, assertCan } from '@estateops/kernel';
import {
  MAX_OPEN_PER_CUSTOMER,
  closeRequest,
  newMessage,
  openRequest,
  reopenRequest,
} from '../domain/supportRequest.js';

const staffReplyEmail = ({ customerName, subject, body, developer }) => ({
  subject: `Reply to your request: ${subject}`,
  text: `Hello ${customerName},\n\n${developer} replied to your request "${subject}":\n\n${body}\n\nYou can read the whole conversation and answer in your customer portal.`,
});
const staffAlertEmail = ({ customerName, subject, body }) => ({
  subject: `Customer request: ${subject}`,
  text: `${customerName} wrote:\n\n${body}\n\nOpen the request in the management portal to answer.`,
});

const view = ({ request, messages }) => ({ request, messages });

/** The customer's own record, as the portal shows it (the ID number stays masked in the response). */
export class GetMyProfile {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ customer }) {
    return this.uow.read(async (repos) => {
      const found = await repos.customers.findById(customer.tenantId, customer.customerId);
      if (!found) throw new NotFoundError('Customer not found');
      return {
        customer: found,
        currency: (await repos.tenantRefs.get(customer.tenantId))?.currency ?? null,
      };
    });
  }
}

/**
 * The customer opens a request, optionally about one of their own properties (a booking they do
 * not own is refused as "not found"). At most ten requests can be waiting at once. The developer's
 * support inbox is told by email.
 */
export class CreateSupportRequest {
  constructor({ uow, clock, mailer, supportEmail }) {
    Object.assign(this, { uow, clock, mailer, supportEmail });
  }

  async execute({ customer, subject, message, bookingId = null }) {
    const now = this.clock.now();
    return this.uow.run(async (repos) => {
      const me = await repos.customers.findById(customer.tenantId, customer.customerId);
      if (!me) throw new NotFoundError('Customer not found');
      if (
        bookingId &&
        !(await repos.bookingSummaries.ownedBy?.(customer.tenantId, customer.customerId, bookingId))
      ) {
        throw new NotFoundError('Property not found');
      }
      if (
        (await repos.support.countOpen(customer.tenantId, customer.customerId)) >=
        MAX_OPEN_PER_CUSTOMER
      ) {
        throw new ConflictError(
          'TOO_MANY_REQUESTS',
          'You have several requests waiting already. Add to one of them or wait for a reply.',
        );
      }
      const opened = openRequest(
        {
          tenantId: customer.tenantId,
          customerId: customer.customerId,
          bookingId,
          subject,
          body: message,
          authorName: me.fullName,
        },
        { now },
      );
      await repos.support.insert(opened.request, opened.message);
      await repos.audit.record({
        tenantId: customer.tenantId,
        actor: { userId: customer.accountId, name: me.fullName },
        action: 'support.open',
        subjectType: 'support_request',
        subjectId: opened.request.id,
        after: { subject: opened.request.subject, bookingId },
      });
      if (this.supportEmail) {
        await this.mailer.send({
          to: this.supportEmail,
          ...staffAlertEmail({
            customerName: me.fullName,
            subject: opened.request.subject,
            body: opened.message.body,
          }),
        });
      }
      return view({
        request: { ...opened.request, customerName: me.fullName },
        messages: [opened.message],
      });
    });
  }
}

export class ListMySupportRequests {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ customer, cursor, limit, status }) {
    return this.uow.read((repos) =>
      repos.support.list(customer.tenantId, {
        customerId: customer.customerId,
        status,
        cursor,
        limit,
      }),
    );
  }
}

export class GetMySupportRequest {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ customer, id }) {
    return this.uow.read(async (repos) => {
      const request = await repos.support.findById(customer.tenantId, id);
      if (!request || request.customerId !== customer.customerId)
        throw new NotFoundError('Request not found');
      return view({ request, messages: await repos.support.messages(request.id) });
    });
  }
}

/** The customer adds to their own request; if staff had answered or it was closed, it is open again. */
export class AddMySupportMessage {
  constructor({ uow, clock, mailer, supportEmail }) {
    Object.assign(this, { uow, clock, mailer, supportEmail });
  }

  async execute({ customer, id, message }) {
    const now = this.clock.now();
    return this.uow.run(async (repos) => {
      const request = await repos.support.findById(customer.tenantId, id, { lock: true });
      if (!request || request.customerId !== customer.customerId)
        throw new NotFoundError('Request not found');
      const next = newMessage(
        request,
        { authorKind: 'customer', authorName: request.customerName, body: message },
        { now },
      );
      await repos.support.addMessage(next.message);
      await repos.support.save(next.request);
      if (this.supportEmail) {
        await this.mailer.send({
          to: this.supportEmail,
          ...staffAlertEmail({
            customerName: request.customerName,
            subject: request.subject,
            body: next.message.body,
          }),
        });
      }
      return view({ request: next.request, messages: await repos.support.messages(request.id) });
    });
  }
}

/** Staff: the queue of requests, newest activity first. Needs customers.view. */
export class ListSupportRequests {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, ...filters }) {
    assertCan(actor, PERMISSION.CUSTOMERS_VIEW);
    const waiting = await this.uow.read((repos) => repos.support.countWaiting(actor.tenantId));
    const page = await this.uow.read((repos) => repos.support.list(actor.tenantId, filters));
    return { ...page, waiting };
  }
}

export class GetSupportRequest {
  constructor({ uow }) {
    this.uow = uow;
  }

  async execute({ actor, id }) {
    assertCan(actor, PERMISSION.CUSTOMERS_VIEW);
    return this.uow.read(async (repos) => {
      const request = await repos.support.findById(actor.tenantId, id);
      if (!request) throw new NotFoundError('Request not found');
      return view({ request, messages: await repos.support.messages(request.id) });
    });
  }
}

/** Staff reply, which also emails the customer. Needs customers.manage. */
export class ReplyToSupportRequest {
  constructor({ uow, clock, mailer }) {
    Object.assign(this, { uow, clock, mailer });
  }

  async execute({ actor, id, message }) {
    assertCan(actor, PERMISSION.CUSTOMERS_MANAGE);
    const now = this.clock.now();
    return this.uow.run(async (repos) => {
      const request = await repos.support.findById(actor.tenantId, id, { lock: true });
      if (!request) throw new NotFoundError('Request not found');
      const next = newMessage(
        request,
        { authorKind: 'staff', authorName: actor.name, body: message },
        { now },
      );
      await repos.support.addMessage(next.message);
      await repos.support.save(next.request);
      await repos.audit.record({
        tenantId: actor.tenantId,
        actor,
        action: 'support.reply',
        subjectType: 'support_request',
        subjectId: request.id,
      });
      const customer = await repos.customers.findById(actor.tenantId, request.customerId);
      if (customer?.email) {
        await this.mailer.send({
          to: customer.email,
          ...staffReplyEmail({
            customerName: customer.fullName,
            subject: request.subject,
            body: next.message.body,
            developer: actor.developerName ?? 'Your developer',
          }),
        });
      }
      return view({ request: next.request, messages: await repos.support.messages(request.id) });
    });
  }
}

/** Staff close a request, or reopen a closed one. Needs customers.manage. */
export class SetSupportStatus {
  constructor({ uow, clock }) {
    Object.assign(this, { uow, clock });
  }

  async execute({ actor, id, action }) {
    assertCan(actor, PERMISSION.CUSTOMERS_MANAGE);
    return this.uow.run(async (repos) => {
      const request = await repos.support.findById(actor.tenantId, id, { lock: true });
      if (!request) throw new NotFoundError('Request not found');
      const next =
        action === 'close' ? closeRequest(request, this.clock.now()) : reopenRequest(request);
      if (next.status !== request.status) {
        await repos.support.save(next);
        await repos.audit.record({
          tenantId: actor.tenantId,
          actor,
          action: `support.${action}`,
          subjectType: 'support_request',
          subjectId: request.id,
          before: { status: request.status },
          after: { status: next.status },
        });
      }
      return view({ request: next, messages: await repos.support.messages(request.id) });
    });
  }
}
