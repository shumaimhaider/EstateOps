/**
 * Duck-typed view of ApiError / ContractError so hooks and components can react
 * to failures without importing shared/api.
 * @returns {{ code: string, message: string, status: number | null, fieldErrors: Record<string,string> }}
 */
export function getErrorInfo(error) {
  return {
    code: error?.code ?? 'UNKNOWN',
    message: error?.message ?? 'Unexpected error',
    status: error?.status ?? null,
    fieldErrors: error?.fieldErrors ?? {},
  };
}

/** TanStack Query retry policy: never retry client errors or contract drift. */
export function shouldRetry(failureCount, error) {
  const { status, code } = getErrorInfo(error);
  if (code === 'CONTRACT_ERROR') return false;
  if (status !== null && status >= 400 && status < 500) return false;
  return failureCount < 2;
}
