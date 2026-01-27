import { JWTPayload } from '../api/auth';

declare global {
  namespace Express {
    interface Request {
      auth?: JWTPayload;
    }
  }
}

export {};
