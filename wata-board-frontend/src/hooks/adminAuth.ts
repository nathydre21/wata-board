import { Request, Response, NextFunction } from 'express';

export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey === process.env.ADMIN_API_KEY) {
    next();
  } else {
    res.status(403).json({ success: false, error: 'Admin access denied' });
  }
};