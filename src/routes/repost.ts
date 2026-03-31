import { Router, Request, Response } from 'express';
import { userAuth, AuthRequest } from '../middleware/auth.js';
import { DocumentRepostingService, repostingEvents } from '../services/documentRepostingService.js';

const router = Router();

// Start Reposting Process
router.post('/', userAuth, (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.id;
    const { startDate, types } = req.body;
    
    // Run in background so the request doesn't timeout
    setTimeout(() => {
        DocumentRepostingService.run(userId, { startDate, types }).catch(err => {
            console.error("Background reposting failed:", err);
            // Optionally emit a final failure event
            repostingEvents.emit('message', { data: `CRITICAL ERROR: ${err.message}` });
        });
    }, 100);

    res.json({ message: 'Reposting process started. Connect to SSE for logs.' });
});

// SSE endpoint for live logs
router.get('/logs', userAuth, (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendMsg = (msg: string) => {
        res.write(`data: ${JSON.stringify({ message: msg })}\n\n`);
    };

    sendMsg('Connected to Document Reposting logs stream.');

    const onMessage = (payload: any) => {
        sendMsg(payload.data);
    };

    repostingEvents.on('message', onMessage);

    // Cleanup on disconnect
    req.on('close', () => {
        repostingEvents.off('message', onMessage);
    });
});

export default router;
