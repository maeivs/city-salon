/**
 * Dormancy warning + transition scheduler
 *
 * Go internal/privacy/service.go dormancyLoop / runDormancyCycle porting.
 *
 * Flow:
 *   1) croner cron (default daily 02:00)
 *   2) distributed lock (privacy_cron_lock) for multi-instance dedup
 *   3) page active accounts (500/page)
 *   4) if last activity < dormancyCutoff -> transition to dormant
 *   5) else check warningDays (descending) -> dedup (dormancy_warned_days) -> email
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    entityServer,
    logger,
    sendEmail,
    createCron,
    ensurePluginEntities,
    type CronHandle,
} from "@system/api";
import { acquireLock, releaseLock } from "@system/api";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ---- types ---- */

interface DormancyConfig {
    enabled: boolean;
    dormancy_days: number;
    warning_days: number[];
    cron: string;
    email_subject: string;
    email_template: string;
    login_url: string;
    /** 휴면 전환 완료 시 안내 이메일 발송 여부 */
    send_completed_email: boolean;
    completed_email_subject: string;
    completed_email_template: string;
}

interface AccountRow {
    seq: number;
    email?: string;
    status?: string;
    rbac_role?: string;
    last_login_time?: string;
    updated_time?: string;
    created_time?: string;
    dormancy_warned_days?: number;
}

/* ---- config ---- */

function loadConfig(): DormancyConfig {
    const configPath = resolve(__dirname, "config.json");
    let raw: Record<string, unknown> = {};
    if (existsSync(configPath)) {
        try {
            raw = JSON.parse(readFileSync(configPath, "utf-8"));
        } catch {
            // use defaults
        }
    }
    return {
        enabled: Boolean(raw.enabled),
        dormancy_days: Number(raw.dormancy_days) || 365,
        warning_days: Array.isArray(raw.warning_days)
            ? raw.warning_days.map(Number)
            : [30, 7],
        cron: String(raw.cron || "0 2 * * *"),
        email_subject: String(raw.email_subject || "계정 휴면 예정 안내"),
        email_template: String(raw.email_template || "dormancy_warning"),
        login_url: String(raw.login_url || ""),
        send_completed_email: Boolean(raw.send_completed_email),
        completed_email_subject: String(
            raw.completed_email_subject || "계정이 휴면 처리되었습니다",
        ),
        completed_email_template: String(
            raw.completed_email_template || "dormancy_completed",
        ),
    };
}

/* ---- helpers ---- */

const DAY_MS = 86_400_000;
const LOCK_TTL_SEC = 86_400;

function resolveLastActivityTime(account: AccountRow): string {
    for (const field of [
        "last_login_time",
        "updated_time",
        "created_time",
    ] as const) {
        const v = account[field];
        if (v && String(v).trim()) return String(v).trim();
    }
    return "";
}

/* ---- main logic ---- */

async function runDormancyCycle(
    cfg: DormancyConfig,
): Promise<{ warned: number; transitioned: number }> {
    const now = Date.now();
    const dormancyCutoffMs = now - cfg.dormancy_days * DAY_MS;
    const warningDays = [...cfg.warning_days].sort((a, b) => b - a);

    let warned = 0;
    let transitioned = 0;
    const limit = 500;
    let page = 1;

    while (true) {
        let items: AccountRow[];
        let total: number;
        try {
            const res = await entityServer.list("account", {
                conditions: { status: "active" },
                page,
                limit,
            });
            items = (res?.data?.items ?? []) as AccountRow[];
            total = Number(res?.data?.total ?? 0);
        } catch (err) {
            logger.error({ err }, "Dormancy: failed to list accounts");
            break;
        }
        if (!items.length) break;

        for (const account of items) {
            // skip admin
            if (account.rbac_role === "admin") continue;

            const seq = Number(account.seq);
            if (!seq) continue;

            const lastTime = resolveLastActivityTime(account);
            if (!lastTime) continue;

            const lastMs = Date.parse(lastTime);
            if (Number.isNaN(lastMs)) continue;

            // Branch A: transition to dormant
            if (lastMs < dormancyCutoffMs) {
                try {
                    await entityServer.submit("account", {
                        seq,
                        status: "dormant",
                    });
                    transitioned++;
                } catch (err) {
                    logger.warn(
                        { err, seq },
                        "Dormancy: failed to transition account",
                    );
                    continue;
                }

                // 휴면 전환 완료 안내 이메일
                if (cfg.send_completed_email && account.email) {
                    try {
                        await sendEmail({
                            to: [account.email],
                            subject: cfg.completed_email_subject,
                            templateDir: join(__dirname, "templates"),
                            templateName: cfg.completed_email_template,
                            templateData: {
                                email: account.email,
                                login_url: cfg.login_url || "#",
                            },
                        });
                    } catch (err) {
                        logger.warn(
                            { err, email: account.email },
                            "Dormancy: failed to send completed email",
                        );
                    }
                }
                continue;
            }

            // Branch B: warning email
            const email = account.email;
            if (!email) continue;

            const daysSinceLast = Math.floor((now - lastMs) / DAY_MS);
            const daysUntilDormancy = cfg.dormancy_days - daysSinceLast;
            if (daysUntilDormancy < 0) continue;

            const lastWarnedDays = Number(account.dormancy_warned_days) || 0;

            for (const warnDay of warningDays) {
                if (
                    daysUntilDormancy <= warnDay &&
                    lastWarnedDays !== warnDay
                ) {
                    // DB update first (dedup)
                    try {
                        await entityServer.submit("account", {
                            seq,
                            dormancy_warned_days: warnDay,
                        });
                    } catch {
                        break;
                    }
                    // send email
                    try {
                        await sendEmail({
                            to: [email],
                            subject:
                                cfg.email_subject +
                                " (D-" +
                                daysUntilDormancy +
                                ")",
                            templateDir: join(__dirname, "templates"),
                            templateName: cfg.email_template,
                            templateData: {
                                email,
                                days_left: String(daysUntilDormancy),
                                login_url: cfg.login_url || "#",
                            },
                        });
                    } catch (err) {
                        logger.warn(
                            { err, email },
                            "Dormancy: failed to send warning",
                        );
                    }
                    warned++;
                    break;
                }
            }
        }

        if (page * limit >= total) break;
        page++;
    }

    return { warned, transitioned };
}

/* ---- scheduler entry ---- */

let cronHandle: CronHandle | null = null;

export async function start(): Promise<void> {
    const cfg = loadConfig();
    if (!cfg.enabled) {
        return;
    }

    await ensurePluginEntities(__dirname).catch((err) =>
        logger.warn({ err }, "dormancy: ensureEntities failed"),
    );

    const execute = async () => {
        const locked = await acquireLock("privacy:dormancy", LOCK_TTL_SEC);
        if (!locked) return;

        try {
            const { warned, transitioned } = await runDormancyCycle(cfg);
            if (warned > 0 || transitioned > 0) {
                logger.info(
                    { warned, transitioned },
                    "Dormancy cycle completed",
                );
            }
        } catch (err) {
            logger.error({ err }, "Dormancy batch failed");
        } finally {
            await releaseLock("privacy:dormancy", LOCK_TTL_SEC);
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
