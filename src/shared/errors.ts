export class AuthRequiredError extends Error {
  constructor(public readonly authorizeUrl: string) {
    super(`AEKO Shop authorization required: ${authorizeUrl}`);
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfter?: string | null,
  ) {
    super(message);
  }
}
