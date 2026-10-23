/** Query key factory for card payments. */
export const paymentKeys = {
  all: ['payments'],
  methodsRoot: () => [...paymentKeys.all, 'methods'],
  transactionsRoot: () => [...paymentKeys.all, 'transactions'],
  methods: (customerId) => [...paymentKeys.all, 'methods', customerId],
  checkout: (id) => [...paymentKeys.all, 'checkout', id],
  transactions: (filters) => [...paymentKeys.all, 'transactions', filters],
  transaction: (id) => [...paymentKeys.all, 'transaction', id],
};
