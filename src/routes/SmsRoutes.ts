import {Router} from 'express';
import {sendSms, getSmsStatus, getAllSmsMessages, getCallbackQueue, getFailedCallbacks} from '../controllers/SmsController';

const router = Router();

router.post('/send-sms', sendSms);
router.get('/sms-status/:messageId', getSmsStatus);
router.get('/messages', getAllSmsMessages);
router.get('/callback-queue', getCallbackQueue);
router.get('/failed-callbacks', getFailedCallbacks);

export default router;
