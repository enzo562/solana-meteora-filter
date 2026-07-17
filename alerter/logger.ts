type Level = "info" | "warn" | "error";

function log(level: Level, message: string, meta?: Record<string, unknown>): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
}

export const logger = {
    info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
    error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
};
