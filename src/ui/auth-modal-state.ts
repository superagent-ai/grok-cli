export type AuthModalOpenOptions = { preserveError?: boolean };

export function getNextAuthModalError(currentError: string | null, options: AuthModalOpenOptions = {}): string | null {
  return options.preserveError ? currentError : null;
}
