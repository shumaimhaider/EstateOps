/** Unit enums, labels (i18n keys) and status tones. One map per enum, used by StatusPill. */
export const UNIT_STATUS = Object.freeze({
  AVAILABLE: 'available',
  HELD: 'held',
  BOOKED: 'booked',
  SOLD: 'sold',
  BLOCKED: 'blocked',
});

/** status -> { labelKey, tone }. Tones map to design tokens in StatusPill. */
export const UNIT_STATUS_META = Object.freeze({
  available: { labelKey: 'inventory:status.available', tone: 'success' },
  held: { labelKey: 'inventory:status.held', tone: 'warning' },
  booked: { labelKey: 'inventory:status.booked', tone: 'info' },
  sold: { labelKey: 'inventory:status.sold', tone: 'accent' },
  blocked: { labelKey: 'inventory:status.blocked', tone: 'neutral' },
});

export const UNIT_KINDS = Object.freeze(['plot', 'flat', 'villa', 'shop']);

export const UNIT_SORT_FIELDS = Object.freeze(['unitNo', 'areaValue', 'listPrice', 'status']);

/**
 * Staff actions this UI knows how to perform. The server decides which are valid per record
 * (allowedActions); this registry only describes how to present them.
 */
export const UNIT_ACTIONS = Object.freeze({
  block: { labelKey: 'inventory:actions.block', confirmKey: 'inventory:actions.blockConfirm' },
  unblock: {
    labelKey: 'inventory:actions.unblock',
    confirmKey: 'inventory:actions.unblockConfirm',
  },
});

export const UNITS_PAGE_SIZE = 25;

/** Fill classes for the site-plan map, one per status (colour is paired with text elsewhere). */
export const UNIT_STATUS_FILL = Object.freeze({
  available: 'fill-tone-success-fg',
  held: 'fill-tone-warning-fg',
  booked: 'fill-tone-info-fg',
  sold: 'fill-tone-accent-fg',
  blocked: 'fill-tone-neutral-fg',
});

export const PROJECT_KIND_LABEL_KEYS = Object.freeze({
  plot_society: 'inventory:projectKind.plot_society',
  tower: 'inventory:projectKind.tower',
  mixed: 'inventory:projectKind.mixed',
});

/** Unit kinds that get a photo gallery (plots do not). The server decides what media exists. */
export const KINDS_WITH_PICTURES = Object.freeze(['flat', 'shop', 'villa']);
