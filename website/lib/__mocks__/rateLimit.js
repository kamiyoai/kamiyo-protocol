// Mock rate limiting middleware
module.exports = {
  withRateLimit: (handler) => handler,
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 100 }),
};
