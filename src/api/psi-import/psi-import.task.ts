import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from 'src/common/redis/redis.constant';
import { PsiImportService } from './psi-import.service';
import {
  PSI_IMPORT_CRON_DEFAULT,
  PSI_IMPORT_CRON_ENV_KEY,
  PSI_IMPORT_CRON_NAME,
  PSI_IMPORT_CRON_TIMEZONE,
  PSI_IMPORT_LOCK_KEY,
  PSI_IMPORT_LOCK_TTL_SECONDS,
  PSI_LOG_TAG,
  REDIS_READY_TIMEOUT_MS,
} from './psi-import.constant';

@Injectable()
export class PsiImportTask implements OnModuleInit {
  private readonly logger = new Logger(PsiImportTask.name);

  constructor(
    private readonly importService: PsiImportService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  /**
   * Registers the job at boot rather than via `@Cron`, matching the other schedulers here.
   *
   * A decorator is evaluated at class-definition time, before DI exists, so its expression cannot
   * come from config — which is the whole point of `PSI_IMPORT_CRON`. `CronJob.from` still takes
   * the timezone, so nothing is given up by moving off the decorator.
   */
  onModuleInit(): void {
    const expression = this.resolveCronExpression();

    const job = CronJob.from({
      cronTime: expression,
      timeZone: PSI_IMPORT_CRON_TIMEZONE,
      // A QA interval can easily be shorter than a run takes. This makes the scheduler skip a
      // tick while the previous one is still going, rather than leaning on the Redis lock to
      // reject an overlap that should never have been attempted.
      waitForCompletion: true,
      onTick: () => {
        void this.runWeeklyImport();
      },
    });

    this.schedulerRegistry.addCronJob(PSI_IMPORT_CRON_NAME, job);
    job.start();

    this.logger.log(
      `${PSI_LOG_TAG} Scheduled with cron "${expression}" (${PSI_IMPORT_CRON_TIMEZONE})`,
    );
  }

  /**
   * Reads `PSI_IMPORT_CRON`, falling back to the weekly default when it is unset or blank.
   *
   * An invalid expression falls back rather than throwing: this value is edited per environment,
   * and a typo in a QA env file should not stop the whole API from booting.
   */
  private resolveCronExpression(): string {
    const configured = this.config.get<string>(PSI_IMPORT_CRON_ENV_KEY)?.trim();
    if (!configured) return PSI_IMPORT_CRON_DEFAULT;

    try {
      // Constructing throws on a malformed expression; the instance itself is discarded.
      CronJob.from({
        cronTime: configured,
        timeZone: PSI_IMPORT_CRON_TIMEZONE,
        onTick: () => {},
      });
      return configured;
    } catch (err) {
      this.logger.error(
        `${PSI_LOG_TAG} ${PSI_IMPORT_CRON_ENV_KEY}="${configured}" is not a valid cron expression (${err instanceof Error ? err.message : String(err)}) — falling back to "${PSI_IMPORT_CRON_DEFAULT}"`,
      );
      return PSI_IMPORT_CRON_DEFAULT;
    }
  }

  /** Weekly NSW Valuer General property sales import. */
  async runWeeklyImport(): Promise<void> {
    const runId = randomUUID();

    let lockAcquired: boolean;
    try {
      lockAcquired = await this.acquireLock(runId);
    } catch (err) {
      // Without the lock there is no way to guarantee a single execution. Skipping is the cheap
      // side of that trade: the reference date comes from the database, so the next run picks up
      // whatever this one missed. Proceeding unlocked would risk an uncontrolled double-run.
      this.logger.error(
        `${PSI_LOG_TAG} Skipped — could not reach Redis to take the import lock: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    if (!lockAcquired) {
      this.logger.warn(
        `${PSI_LOG_TAG} Skipped — another instance holds the import lock`,
      );
      return;
    }

    try {
      await this.importService.runImport();
    } catch (err) {
      // An unhandled rejection inside a cron tick takes the process down, so this is the backstop.
      this.logger.error(
        `${PSI_LOG_TAG} Import failed — ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    } finally {
      await this.releaseLock(runId);
    }
  }

  /**
   * Prod runs a single container today, so this is insurance rather than a present need — but
   * every existing cron here breaks silently under replication, and this is the expensive one to
   * double-fire (hundreds of megabytes of downloads against a government server).
   */
  private async acquireLock(runId: string): Promise<boolean> {
    await this.ensureRedisReady();

    const result = await this.redis.set(
      PSI_IMPORT_LOCK_KEY,
      runId,
      'EX',
      PSI_IMPORT_LOCK_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  /**
   * Brings the shared Redis client up before the first command is issued.
   *
   * `REDIS_CLIENT` is configured with `lazyConnect: true` and `enableOfflineQueue: false`
   * (see config/redis.config.ts). That pair means the first command on a never-used client is
   * always rejected with "Stream isn't writeable" — ioredis starts the connection but has
   * nowhere to park the command that triggered it. Every other consumer of this client is a
   * cache that treats such a failure as a miss; a lock cannot.
   */
  private async ensureRedisReady(): Promise<void> {
    if (this.redis.status === 'ready') return;

    // 'wait' is the post-construction lazyConnect state; 'end' means a previous connection was
    // torn down. connect() both opens the socket and resolves once it is usable.
    if (this.redis.status === 'wait' || this.redis.status === 'end') {
      await this.redis.connect();
      return;
    }

    // Mid-handshake ('connecting' | 'connect' | 'reconnecting') — let it settle.
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.redis.off('ready', onReady);
        this.redis.off('error', onError);
      };
      const onReady = (): void => {
        cleanup();
        resolve();
      };
      const onError = (err: Error): void => {
        cleanup();
        reject(err);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Redis did not become ready within ${REDIS_READY_TIMEOUT_MS}ms (status=${this.redis.status})`,
          ),
        );
      }, REDIS_READY_TIMEOUT_MS);

      this.redis.once('ready', onReady);
      this.redis.once('error', onError);
    });
  }

  /**
   * Releases the lock only if it still belongs to this run — a run that overruns the TTL must not
   * delete its successor's lock. Compare-and-delete has to be atomic, hence the Lua script.
   */
  private async releaseLock(runId: string): Promise<void> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      end
      return 0
    `;
    await this.redis
      .eval(script, 1, PSI_IMPORT_LOCK_KEY, runId)
      .catch((err: unknown) => {
        this.logger.warn(
          `${PSI_LOG_TAG} Failed to release import lock — ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}
