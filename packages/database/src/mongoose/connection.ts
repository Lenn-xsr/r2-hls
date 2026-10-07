import mongoose from 'mongoose';
import { Logger } from '@nestjs/common';

const logger = new Logger('MongoDB');

export const ConnectMongoDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI env var is required');
  }

  // Fail fast: a service that boots without its database only fails later, on
  // the first request or job, with a much less obvious error.
  await mongoose.connect(uri, {
    maxPoolSize: 20,
    minPoolSize: 5,
  });
  logger.log('Connected to MongoDB');
};

export const DisconnectMongoDB = async () => {
  try {
    await mongoose.disconnect();
    logger.log('Disconnected from MongoDB');
  } catch (error) {
    logger.error('Error disconnecting from MongoDB', error);
  }
};
