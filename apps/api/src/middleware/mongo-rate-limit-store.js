import { createHmac } from 'node:crypto';

// Small express-rate-limit Store implementation backed by MongoDB so limits
// are shared across API instances. The persisted key is a keyed digest of the
// limiter identity (IP or account ID), never the raw identity.
export class MongoRateLimitStore {
  constructor(collection, { prefix, secret }) {
    this.collection = collection;
    this.prefix = prefix;
    this.secret = secret;
    this.windowMs = 0;
    this.localKeys = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async createIndexes() {
    await this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }

  #id(key) {
    const digest = createHmac('sha256', this.secret).update(key).digest('hex');
    return `${this.prefix}:${digest}`;
  }

  async increment(key) {
    if (!Number.isFinite(this.windowMs) || this.windowMs < 1) {
      throw new Error('Rate limit store must be initialized with a valid windowMs');
    }

    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    const id = this.#id(key);
    const expired = { $lte: [{ $ifNull: ['$resetTime', new Date(0)] }, now] };
    const update = [{
      $set: {
        totalHits: {
          $cond: [expired, 1, { $add: [{ $ifNull: ['$totalHits', 0] }, 1] }],
        },
        resetTime: { $cond: [expired, resetAt, '$resetTime'] },
        expiresAt: { $cond: [expired, resetAt, '$expiresAt'] },
        prefix: this.prefix,
      },
    }];

    let record;
    try {
      record = await this.collection.findOneAndUpdate(
        { _id: id },
        update,
        { upsert: true, returnDocument: 'after', includeResultMetadata: false },
      );
    } catch (error) {
      // Two first requests can race to create the same _id. The second request
      // retries against the record created by the winner.
      if (error?.code !== 11000) throw error;
      record = await this.collection.findOneAndUpdate(
        { _id: id },
        update,
        { returnDocument: 'after', includeResultMetadata: false },
      );
    }

    if (!record) throw new Error('Rate limit counter could not be updated');
    return { totalHits: record.totalHits, resetTime: record.resetTime };
  }

  async decrement(key) {
    await this.collection.updateOne(
      { _id: this.#id(key), totalHits: { $gt: 0 }, resetTime: { $gt: new Date() } },
      { $inc: { totalHits: -1 } },
    );
  }

  async resetKey(key) {
    await this.collection.deleteOne({ _id: this.#id(key) });
  }

  async resetAll() {
    await this.collection.deleteMany({ prefix: this.prefix });
  }

  async get(key) {
    const record = await this.collection.findOne({ _id: this.#id(key) });
    if (!record || record.resetTime <= new Date()) return undefined;
    return { totalHits: record.totalHits, resetTime: record.resetTime };
  }
}
