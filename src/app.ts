import express, {Request, Response, NextFunction} from 'express';
import smsRoutes from './routes/SmsRoutes';
import {logger} from './utils/logger';
import {rateLimiter} from './middleware/rateLimiter';
import {mountDocs} from './docs/swagger';


const app = express();

app.use(rateLimiter);
app.use(express.json({limit: '100kb'}));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        logger.info(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    });
    next();
});

// Catch malformed JSON
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({
            error: 'Malformed JSON',
            message: err.message
        });
    }
    next(err);
});

app.get('/api/health', (_, res: Response) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// API docs — mounted before routes so Swagger UI is served at /api/docs
mountDocs(app);

app.use('/api/v1', smsRoutes);

// Global error handler — must be last
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
    });
});

export default app;
