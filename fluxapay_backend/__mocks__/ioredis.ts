const mockRedisClient = {
  set: jest.fn().mockResolvedValue("OK"),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  quit: jest.fn().mockResolvedValue("OK"),
};

const MockRedis = jest.fn(() => mockRedisClient);

export default MockRedis;
export { mockRedisClient };
