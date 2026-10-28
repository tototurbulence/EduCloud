import argon2 from 'argon2';
import mongoose from 'mongoose';
import { z } from 'zod';
import { loadConfig } from '../config/env.js';
import { createUserModel } from '../models/user.model.js';
import { PASSWORD_HASH_OPTIONS } from '../security/passwords.js';

const config = loadConfig();
const bootstrapSchema = z.object({
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(2).max(100),
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().email().max(254),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(128),
});

async function provisionAdmin() {
  const input = bootstrapSchema.parse(process.env);
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!config.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to provision an administrator');
  }

  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  const User = createUserModel();
  await User.init();
  const email = input.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

  if (await User.exists({ role: 'admin' })) {
    throw new Error('An administrator already exists; bootstrap is disabled');
  }
  if (await User.exists({ email })) {
    throw new Error('The bootstrap email is already assigned to an account');
  }

  const passwordHash = await argon2.hash(input.BOOTSTRAP_ADMIN_PASSWORD, PASSWORD_HASH_OPTIONS);
  await User.create({
    displayName: input.BOOTSTRAP_ADMIN_NAME,
    email,
    passwordHash,
    role: 'admin',
    status: 'active',
    isBootstrapAdmin: true,
  });
  console.info('Initial administrator provisioned successfully.');
}

try {
  await provisionAdmin();
} catch (error) {
  console.error('Administrator provisioning failed', {
    reason: error instanceof z.ZodError ? 'invalid or missing bootstrap environment values' : 'operation rejected',
  });
  process.exitCode = 1;
} finally {
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  await mongoose.disconnect().catch(() => {});
}
