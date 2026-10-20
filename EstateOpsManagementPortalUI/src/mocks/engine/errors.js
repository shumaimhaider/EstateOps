/** Error thrown by the simulated back end; handlers turn it into a REST or GraphQL error. */
export class MockApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
