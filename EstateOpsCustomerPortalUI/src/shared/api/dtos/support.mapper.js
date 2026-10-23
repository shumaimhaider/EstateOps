export const requestFromApi = (d) => ({
  id: d.id,
  subject: d.subject,
  status: d.status,
  bookingId: d.booking_id,
  createdAt: d.created_at,
  lastMessageAt: d.last_message_at,
  messageCount: d.message_count ?? null,
});

export const threadFromApi = (d) => ({
  ...requestFromApi(d),
  messages: d.messages.map((m) => ({
    id: m.id,
    authorKind: m.author_kind,
    authorName: m.author_name,
    body: m.body,
    createdAt: m.created_at,
  })),
});
