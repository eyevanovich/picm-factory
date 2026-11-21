export function errorCode(error: unknown): string | undefined {
  if (error !== null && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

export function codedError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}
