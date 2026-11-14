import cors from 'cors';
import express from 'express';
import { databasePool, verifyDatabaseConnection } from './config/database.js';
import { bookCoversDirectory, bookCoversPublicPath } from './config/bookCovers.js';
import { authRouter } from './routes/auth.routes.js';
import { booksRouter } from './routes/books.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { loansRouter } from './routes/loans.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { reservationsRouter } from './routes/reservations.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { borrowingRequestsRouter } from './routes/borrowingRequests.routes.js';

const app = express();

app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5174', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(bookCoversPublicPath, express.static(bookCoversDirectory, { dotfiles: 'deny', index: false, immutable: true, maxAge: '1y' }));

app.use('/api/auth', authRouter);
app.use('/api/books', booksRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/loans', loansRouter);
app.use('/api/users', usersRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/borrowing-requests', borrowingRequestsRouter);

app.get('/api/health', async (_request, response) => {
  try {
    await verifyDatabaseConnection();
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.use((_request, response) => response.status(404).json({ error: 'The requested API route was not found.' }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const code = (error as { code?: string } | null)?.code;
  if (code === '23505') {
    response.status(409).json({ error: 'That value already exists. Check for a duplicate username, email, ISBN, or barcode.' });
    return;
  }
  console.error('API request failed:', error instanceof Error ? error.message : 'Unknown error');
  response.status(500).json({ error: 'An unexpected server error occurred.' });
});

export default app;
