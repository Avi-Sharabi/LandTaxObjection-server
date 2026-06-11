import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenBlacklistService {
  private readonly blacklist = new Map<string, number>(); // jti → expiresAt (epoch ms)

  add(jti: string, expiresAt: number): void {
    this.blacklist.set(jti, expiresAt);
    this.cleanup();
  }

  has(jti: string): boolean {
    const exp = this.blacklist.get(jti);
    if (exp === undefined) return false;
    if (Date.now() > exp) {
      this.blacklist.delete(jti);
      return false;
    }
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [jti, exp] of this.blacklist) {
      if (now > exp) this.blacklist.delete(jti);
    }
  }
}
