export const portalAccessFromApi = (dto) =>
  dto.status === 'none'
    ? { status: 'none', customerId: dto.customer_id }
    : {
        customerId: dto.customer_id,
        email: dto.email,
        status: dto.status,
        hasPassword: dto.has_password,
        invitedAt: dto.invited_at,
        lastLoginAt: dto.last_login_at,
        purpose: dto.purpose ?? null,
      };

export const supportRequestFromApi = (dto) => ({
  id: dto.id,
  subject: dto.subject,
  status: dto.status,
  bookingId: dto.booking_id,
  createdAt: dto.created_at,
  lastMessageAt: dto.last_message_at,
  customerId: dto.customer_id,
  customerName: dto.customer_name,
  messageCount: dto.message_count ?? null,
});

export const supportThreadFromApi = (dto) => ({
  ...supportRequestFromApi(dto),
  messages: dto.messages.map((m) => ({
    id: m.id,
    authorKind: m.author_kind,
    authorName: m.author_name,
    body: m.body,
    createdAt: m.created_at,
  })),
});
