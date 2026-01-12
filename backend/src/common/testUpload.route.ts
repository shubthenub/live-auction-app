import { Router } from 'express';
import { uploadImage } from './uploadImage.js';
import { cloudinaryImageUpload } from './cloudinaryImageUpload.js';

const router = Router();

router.post('/test-uploadImage', uploadImage.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file' });
  }

  const url = await cloudinaryImageUpload(req.file.buffer);
  res.json({ url });
});

export default router;
