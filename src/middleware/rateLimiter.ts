import {Request, Response, NextFunction} from 'express';

const WINDOW_MS = 1_000;
const MAX_REQUESTS = parseEnvInt(process.env.RATE_LIMIT_MAX, 1000);

function parseEnvInt(value: string | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

interface WindowEntry {
    count: number;
    resetAt: number;
}

const hits = new Map<string, WindowEntry>();

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
        if (now >= entry.resetAt) hits.delete(key);
    }
}, WINDOW_MS).unref();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || now >= entry.resetAt) {
        entry = {count: 1, resetAt: now + WINDOW_MS};
        hits.set(key, entry);
        res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
        res.setHeader('X-RateLimit-Remaining', MAX_REQUESTS - 1);
        next();
        return;
    }

    entry.count++;

    if (entry.count > MAX_REQUESTS) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.setHeader('Retry-After', retryAfter);
        res.status(429).json({
            error: 'Too many requests to the gateway',
            retry_after: retryAfter
        });
        return;
    }

    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', MAX_REQUESTS - entry.count);
    next();
}
