import { resolve } from 'node:path';

export const bookCoversPublicPath = '/uploads/book-covers';

// In Vercel serverless, we generate the filename but defer saving to cloud storage.
// For local development, set VERCEL=0 to enable disk saving.
export const bookCoversDirectory = process.env.VERCEL ? null : resolve(__dirname, '../../uploads/book-covers');
export const isVercel = () => process.env.VERCEL === '1';
