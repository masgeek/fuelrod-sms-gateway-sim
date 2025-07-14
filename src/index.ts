import express from 'express';
import smsRoutes from './routes/SmsRoutes';
import {config} from './config/env';

const app = express();
app.use(express.json());
app.use('/api/v1', smsRoutes);

app.listen(config.port, () => {
    console.log(`🚀 Running at http://127.0.0.1:${config.port}/api/v1 [${config.env}]`);
});
