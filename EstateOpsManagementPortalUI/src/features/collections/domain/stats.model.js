/**
 * @typedef {{ minor: number, currency: string }} Money
 * @typedef {{
 *   currency: string, asOf: string, saleValue: Money, received: Money, pending: Money,
 *   overdue: Money, dueThisMonth: Money, fines: Money,
 *   installments: { total: number, paid: number, due: number, overdue: number, upcoming: number },
 *   bookingsCount: number, escalatedCount: number,
 *   units: { total: number, available: number, booked: number, sold: number },
 *   byMonth: { month: string, dueMinor: number, collectedMinor: number }[],
 *   ageing: { bucket: string, count: number, amount: Money }[],
 *   unitsByKind: { kind: string, total: number, available: number, held: number, booked: number, sold: number, blocked: number }[],
 *   byProject: { projectId: string, projectName: string, unitsTotal: number, unitsSold: number, saleValue: Money, received: Money, pending: Money, overdue: Money }[]
 * }} CollectionsStats
 */
export {};
