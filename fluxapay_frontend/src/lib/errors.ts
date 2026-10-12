export class ApiError extends Error {
  public retryAfterSeconds?: number;
  constructor(
    public status: number,
    message: string,
    public code?: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
