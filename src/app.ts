import express from 'express';
import smsRoutes from './routes/SmsRoutes';

const app = express();

app.use(express.json());
app.use('/api/v1', smsRoutes);

export default app;
