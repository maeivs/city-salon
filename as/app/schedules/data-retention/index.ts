/**
 * Data retention scheduler (anonymize / delete dormant accounts)
 *
 * Go internal/privacy/service.go dataRetentionLoop / runDataRetention porting.
 *
 * Flow:
 *   1) croner cron (default daily 02:30)
 *   2) distributed lock (privacy_cron_lock)
 *   3) page dormant accounts (500/page)
 *   4) if updated_time < retentionCutoff -> anonymize or hard-delete
 *   5) clean up related records (account_oauth, user, password_history)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
    entityServer,
    logger,
    createCron,
    type CronHandle,
} from "@system/api";
import { acquireLock, releaseLock } from "@system/api";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ---- types ---- */

interface RetentionConfig {
    enabled: boolean;
    retention_days: number;
    action: "anonymize" | "delete";
    cron: string;
}

interface AccountRow {
    seq: number;
    updated_time?: string;
    status?: string;
}

/* ---- config ---- */

function loadConfig(): RetentionConfig {
    const configPath = resolve(__dirname, "config.json");
    let raw: Record<string, unknown> = {};
    if (existsSync(configPath)) {
        try {
            raw = JSON.parse(readFileSync(configPath, "utf-8"));
        } catch {
            // use defaults
        }
    }
    const action = String(raw.action || "anonymize");
    return {
        enabled: Boolean(raw.enabled),
        retention_days: Number(raw.retention_days) || 1095,
        action: action === "delete" ? "delete" : "anonymize",
        cron: String(raw.cron || "30 2 * * *"),
    };
}

/* ---- helpers ---- */

const DAY_MS = 86_400_000;
const LOCK_TTL_SEC = 86_400;

async function deleteOAuthRecords(accountSeq: number): Promise<void> {
    try {
        const res = await entityServer.list("account_oauth", {
            conditions: { account_seq: accountSeq },
            limit: 100,
        });
        const items = (res?.data?.items ?? []) as Array<{ seq: number }>;
        for (const item of items) {
            await entityServer.delete("account_oauth", item.seq, {
                hard: true,
            });
        }
    } catch {
        // ignore: entity may not exist
    }
}

async function anonymizeUser(accountSeq: number): Promise<void> {
    try {
        const res = await entityServer.find("user", {
            conditions: { account_seq: accountSeq },
        });
        const user = res?.data as { seq?: number } | null;
        if (user?.seq) {
            await entityServer.submit("user", {
                seq: user.seq,
                name: "탈퇴회원_" + user.seq,
                profile_image: "",
                status: "inactive",
            });
        }
    } catch {
        // ignore
    }
}

async function deletePasswordHistory(accountSeq: number): Promise<void> {
    try {
        const res = await entityServer.list("password_history", {
            conditions: { account_seq: accountSeq },
            limit: 100,
        });
        const items = (res?.data?.items ?? []) as Array<{ seq: number }>;
        for (const item of items) {
            await entityServer.delete("password_history", item.seq, {
                hard: true,
            });
        }
    } catch {
        // ignore
    }
}

/* ---- main logic ---- */

async function runDataRetention(cfg: RetentionConfig): Promise<number> {
    const now = Date.now();
    const cutoffMs = now - cfg.retention_days * DAY_MS;

    let affected = 0;
    const limit = 500;
    let page = 1;

    while (true) {
        let items: AccountRow[];
        let total: number;
        try {
            const res = await entityServer.list("account", {
                conditions: { status: "dormant" },
                page,
                limit,
            });
            items = (res?.data?.items ?? []) as AccountRow[];
            total = Number(res?.data?.total ?? 0);
        } catch (err) {
            logger.error(
                { err },
                "DataRetention: failed to list dormant accounts",
            );
            break;
        }
        if (!items.length) break;

        for (const account of items) {
            const seq = Number(account.seq);
            if (!seq) continue;

            // check dormant transition time (updated_time)
            const dormantSince = account.updated_time;
            if (!dormantSince) continue;

            const dormantMs = Date.parse(dormantSince);
            if (Number.isNaN(dormantMs)) continue;

            // retention period not elapsed yet
            if (dormantMs >= cutoffMs) continue;

            try {
                if (cfg.action === "delete") {
                    await entityServer.delete("account", seq, { hard: true });
                } else {
                    // anonymize
                    await entityServer.submit("account", {
                        seq,
                        email: "withdrawn_" + seq + "@anonymized.local",
                        status: "inactive",
                        passwd: "",
                    });
                }

                // clean up related records
                await deleteOAuthRecords(seq);
                await anonymizeUser(seq);
                await deletePasswordHistory(seq);

                affected++;
            } catch (err) {
                logger.warn(
                    { err, seq },
                    "DataRetention: failed to process account",
                );
            }
        }

        if (page * limit >= total) break;
        page++;
    }

    return affected;
}

/* ---- scheduler entry ---- */

let cronHandle: CronHandle | null = null;

export function start(): void {
    const cfg = loadConfig();
    if (!cfg.enabled) {
        return;
    }

    const execute = async () => {
        const locked = await acquireLock("privacy:retention", LOCK_TTL_SEC);
        if (!locked) return;

        try {
            const count = await runDataRetention(cfg);
            if (count > 0) {
                logger.info(
                    "Data retention completed: action=" +
                        cfg.action +
                        " affected=" +
                        count,
                );
            }
        } catch (err) {
            logger.error({ err }, "Data retention batch failed");
        } finally {
            await releaseLock("privacy:retention", LOCK_TTL_SEC);
        }
    };

    cronHandle = createCron({ expression: cfg.cron, onTick: execute });
}

export function stop(): void {
    if (cronHandle) {
        cronHandle.stop();
        cronHandle = null;
    }
}
