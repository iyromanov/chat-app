export const roomKeys = {
  user(userId: string): string {
    return `user:${userId}`;
  },
  login(loginId: string): string {
    return `login:${loginId}`;
  },
} as const;
