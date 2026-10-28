import { resolve } from 'node:path';

// Resolves to backend/uploads/book-covers from both src/config and dist/config.
export const bookCoversDirectory = resolve(__dirname, '../../uploads/book-covers');
export const bookCoversPublicPath = '/uploads/book-covers';
