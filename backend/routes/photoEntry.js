import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { PHOTO_KINDS, extractPhotoEntry } from '../utils/photoEntry.js';

const router = express.Router();

router.post('/extract', authenticateToken, requireActiveSubscription, async (req, res, next) => {
  try {
    const kind = String(req.body?.kind || '');
    if (!PHOTO_KINDS.includes(kind)) {
      return res.status(400).json({ error: `Unknown entry type for photo: ${kind || '(none)'}` });
    }
    const images = Array.isArray(req.body?.images) ? req.body.images : [req.body?.imageDataUrl].filter(Boolean);
    res.json(await extractPhotoEntry(kind, images));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

export default router;
