import { JWTPayload } from '../api/auth';

// Extend Express Request to include API auth info
declare global {
  namespace Express {
    interface Request {
      auth?: JWTPayload;
    }
  }
}

export {};
