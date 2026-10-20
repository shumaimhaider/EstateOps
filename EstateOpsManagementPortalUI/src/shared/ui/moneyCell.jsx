import Money from './Money.jsx';

/** Table cell renderer for a money field: moneyCell((row) => row.amount). */
export function moneyCell(pick) {
  return function renderMoneyCell(ctx) {
    const m = pick(ctx.row.original);
    return <Money minor={m.minor} currency={m.currency} />;
  };
}
