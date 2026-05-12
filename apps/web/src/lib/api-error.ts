export class ApiError extends Error {
  constructor(
    public code: number,
    public msg: string,
  ) {
    super(`API ${code}: ${msg}`);
    this.name = 'ApiError';
  }
}
