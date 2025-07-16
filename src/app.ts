import express, {Request, Response, NextFunction} from 'express';
import smsRoutes from './routes/SmsRoutes';


const app = express();

app.use(express.json());
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
app.use('/api/v1', smsRoutes);

export default app;
