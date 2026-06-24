import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { SupportingEvidenceContext } from '../supporting-evidence/supporting-evidence.types';

export const VALUATION_CTX_REDIS = 'VALUATION_CTX_REDIS';
const KEY_PREFIX = 'valuation-ctx:';
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

@Injectable()
export class ValuationCtxCacheService {
  private readonly logger = new Logger(ValuationCtxCacheService.name);
  private readonly mem = new Map<string, SupportingEvidenceContext>();
  private static readonly MEM_MAX = 500;

  constructor(
    @Optional() @Inject(VALUATION_CTX_REDIS) private readonly redis: Redis | null,
  ) {}

  async save(disputeCaseId: string, ctx: SupportingEvidenceContext): Promise<void> {
    if (this.mem.size >= ValuationCtxCacheService.MEM_MAX) {
      const oldest = this.mem.keys().next().value;
      if (oldest !== undefined) this.mem.delete(oldest);
    }
    this.mem.set(disputeCaseId, ctx);

    if (!this.redis) return;
    try {
      // Buffer cannot be JSON-serialised — exclude it; valuation report does not need it
      const { reportBuffer: _ignored, ...serialisable } = ctx;
      await this.redis.set(KEY_PREFIX + disputeCaseId, JSON.stringify(serialisable), 'EX', TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`ValuationCtxCache.redis_save_failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async get(disputeCaseId: string): Promise<SupportingEvidenceContext | undefined> {
    const memHit = this.mem.get(disputeCaseId);
    if (memHit) return memHit;

    if (!this.redis) return undefined;
    try {
      const raw = await this.redis.get(KEY_PREFIX + disputeCaseId);
      if (!raw) return undefined;
      const ctx = JSON.parse(raw) as Omit<SupportingEvidenceContext, 'reportBuffer'> & { reportBuffer: null };
      ctx.reportBuffer = null;
      this.mem.set(disputeCaseId, ctx as SupportingEvidenceContext);
      return ctx as SupportingEvidenceContext;
    } catch (err) {
      this.logger.warn(`ValuationCtxCache.redis_get_failed: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }
}
