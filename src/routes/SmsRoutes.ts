import {Router} from 'express';
import {sendSms, getSmsStatus} from '../controllers/SmsController';

const router = Router();

router.post('/send-sms', sendSms);
router.get('/sms-status/:messageId', getSmsStatus);

export default router;
