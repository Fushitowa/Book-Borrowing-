import cors from 'cors';
import express from 'express';
import { databasePool, verifyDatabaseConnection } from './config/database.js';
import { authRouter } from './routes/auth.routes.js';
import { booksRouter } from './routes/books.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { loansRouter } from './routes/loans.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { reservationsRouter } from './routes/reservations.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { borrowingRequestsRouter } from './routes/borrowingRequests.routes.js';
import { expireReadyReservations } from './services/reservation.service.js';
import { createDueSoonReminders } from './services/dueReminder.service.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));

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
  if (code === 'ER_DUP_ENTRY') {
    response.status(409).json({ error: 'That value already exists. Check for a duplicate username, email, ISBN, or barcode.' });
    return;
  }
  console.error('API request failed:', error instanceof Error ? error.message : 'Unknown error');
  response.status(500).json({ error: 'An unexpected server error occurred.' });
});

async function startServer(): Promise<void> {
  try {
    await verifyDatabaseConnection();
    const reservationSweep = setInterval(() => {
      void expireReadyReservations().catch((error: unknown) => {
        console.error('Reservation expiry job failed:', error instanceof Error ? error.message : 'Unknown error');
      });
    }, 60_000);
    reservationSweep.unref();
    const dueReminderSweep = setInterval(() => {
      void createDueSoonReminders().catch((error: unknown) => {
        console.error('Due-date reminder job failed:', error instanceof Error ? error.message : 'Unknown error');
      });
    }, 60 * 60_000);
    dueReminderSweep.unref();
    void expireReadyReservations().catch(() => undefined);
    void createDueSoonReminders().catch(() => undefined);
    app.listen(port, () => {
      console.log(`API server listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Could not connect to the configured MySQL database.');
    if (error instanceof Error) {
      console.error(error.message);
    }
    await databasePool.end();
    process.exitCode = 1;
  }
}

void startServer();
