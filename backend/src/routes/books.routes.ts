import { Router } from 'express';
import { databasePool } from '../config/database.js';
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js';
import { writeAudit } from '../services/audit.service.js';
import { assignNextReservation } from '../services/reservation.service.js';

export const booksRouter = Router();

booksRouter.get('/available-copies', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  try {
    const [rows] = await databasePool.query<any[]>(
      `SELECT bc.id, bc.book_id AS bookId, bc.barcode, bc.shelf_location AS shelfLocation, b.title
         FROM book_copies bc JOIN books b ON b.id = bc.book_id
        WHERE bc.copy_status = 'IN_SERVICE'
          AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id = bc.id AND l.status = 'ACTIVE')
          AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.allocated_copy_id = bc.id AND r.status = 'READY')
          AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.book_id = bc.book_id AND r.status = 'PENDING')
        ORDER BY b.title, bc.barcode LIMIT 500`);
    response.json({ items: rows });
  } catch (error) { next(error); }
});

booksRouter.get('/', requireAuth, async (request, response, next) => {
  try {
    const query = typeof request.query.q === 'string' ? request.query.q.trim().slice(0, 100) : '';
    const page = Math.max(1, Math.min(100000, Number(request.query.page) || 1));
    const pageSize = Math.max(1, Math.min(50, Number(request.query.pageSize) || 12));
    const search = `%${query}%`;
    const [rows] = await databasePool.execute<any[]>(
      `SELECT b.id, b.isbn, b.title, b.subtitle, b.edition, b.publication_year AS publicationYear,
          p.name AS publisher,
          (SELECT GROUP_CONCAT(a.display_name ORDER BY ba.author_order SEPARATOR ', ')
             FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id) AS authors,
          (SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
             FROM book_categories bcg JOIN categories c ON c.id = bcg.category_id WHERE bcg.book_id = b.id) AS categories,
          COUNT(DISTINCT bc.id) AS totalCopies,
          SUM(CASE WHEN bc.copy_status = 'IN_SERVICE' AND NOT EXISTS
            (SELECT 1 FROM loans l WHERE l.copy_id = bc.id AND l.status = 'ACTIVE') AND NOT EXISTS
            (SELECT 1 FROM reservations r WHERE r.allocated_copy_id = bc.id AND r.status = 'READY') AND NOT EXISTS
            (SELECT 1 FROM reservations r WHERE r.book_id = bc.book_id AND r.status = 'PENDING')
            THEN 1 ELSE 0 END) AS availableCopies
          ,COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM loans l WHERE l.copy_id = bc.id AND l.status = 'ACTIVE') THEN bc.id END) AS borrowedCopies
          ,COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.allocated_copy_id = bc.id AND r.status = 'READY') THEN bc.id END) AS reservedCopies
          ,(SELECT COUNT(*) FROM reservations rq WHERE rq.book_id = b.id AND rq.status = 'PENDING') AS waitingReservations
        FROM books b LEFT JOIN publishers p ON p.id = b.publisher_id
        LEFT JOIN book_copies bc ON bc.book_id = b.id
        WHERE (? = '' OR b.title LIKE ? OR b.isbn LIKE ? OR EXISTS
          (SELECT 1 FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id AND a.display_name LIKE ?) OR EXISTS
          (SELECT 1 FROM book_categories bcg JOIN categories c ON c.id = bcg.category_id WHERE bcg.book_id = b.id AND c.name LIKE ?))
        GROUP BY b.id, p.name ORDER BY b.title ASC LIMIT ? OFFSET ?`,
      [query, search, search, search, search, pageSize, (page - 1) * pageSize],
    );
    const [countRows] = await databasePool.execute<any[]>(
      `SELECT COUNT(*) AS total FROM books b WHERE (? = '' OR b.title LIKE ? OR b.isbn LIKE ? OR EXISTS
        (SELECT 1 FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id AND a.display_name LIKE ?) OR EXISTS
        (SELECT 1 FROM book_categories bcg JOIN categories c ON c.id = bcg.category_id WHERE bcg.book_id = b.id AND c.name LIKE ?))`,
      [query, search, search, search, search],
    );
    response.json({ items: rows, page, pageSize, total: countRows[0].total });
  } catch (error) { next(error); }
});

booksRouter.post('/', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const { title, subtitle, isbn, edition, publicationYear, publisher, authors, categories } = request.body ?? {};
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 255) {
    response.status(400).json({ error: 'Book title is required and must be 255 characters or fewer.' }); return;
  }
  if (isbn && (typeof isbn !== 'string' || isbn.length > 20)) { response.status(400).json({ error: 'ISBN must be 20 characters or fewer.' }); return; }
  if (publicationYear && (!Number.isInteger(Number(publicationYear)) || Number(publicationYear) < 1000 || Number(publicationYear) > new Date().getFullYear() + 1)) {
    response.status(400).json({ error: 'Enter a valid publication year.' }); return;
  }
  if (publisher && (typeof publisher !== 'string' || publisher.trim().length > 180)) { response.status(400).json({ error: 'Publisher name must be 180 characters or fewer.' }); return; }
  if (subtitle && (typeof subtitle !== 'string' || subtitle.trim().length > 255)) { response.status(400).json({ error: 'Subtitle must be 255 characters or fewer.' }); return; }
  const authorNames: string[] = Array.isArray(authors)
    ? [...new Set(authors.filter((author: unknown): author is string => typeof author === 'string').map((author: string) => author.trim()).filter(Boolean))].slice(0, 10)
    : [];
  if (authorNames.some((author) => author.length > 180)) { response.status(400).json({ error: 'Author names must be 180 characters or fewer.' }); return; }
  const categoryNames: string[] = Array.isArray(categories)
    ? [...new Set(categories.filter((category: unknown): category is string => typeof category === 'string').map((category: string) => category.trim()).filter(Boolean))].slice(0, 10)
    : [];
  if (categoryNames.some((category) => category.length > 120)) { response.status(400).json({ error: 'Category names must be 120 characters or fewer.' }); return; }
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    let publisherId: number | null = null;
    if (publisher?.trim()) {
      const [existing] = await connection.execute<any[]>('SELECT id FROM publishers WHERE name = ? LIMIT 1', [publisher.trim()]);
      if (existing.length) publisherId = existing[0].id;
      else {
        const [created] = await connection.execute<any>('INSERT INTO publishers (name) VALUES (?)', [publisher.trim()]);
        publisherId = Number(created.insertId);
      }
    }
    const [insert] = await connection.execute<any>(
      'INSERT INTO books (isbn, title, subtitle, edition, publication_year, publisher_id) VALUES (?, ?, ?, ?, ?, ?)',
      [isbn?.trim() || null, title.trim(), subtitle?.trim() || null, edition?.trim() || null, publicationYear ? Number(publicationYear) : null, publisherId],
    );
    const bookId = Number(insert.insertId);
    for (const [index, name] of authorNames.entries()) {
      const [found] = await connection.execute<any[]>('SELECT id FROM authors WHERE display_name = ? LIMIT 1', [name]);
      let authorId: number;
      if (found.length) authorId = found[0].id;
      else {
        const [created] = await connection.execute<any>('INSERT INTO authors (display_name) VALUES (?)', [name]);
        authorId = Number(created.insertId);
      }
      await connection.execute('INSERT INTO book_authors (book_id, author_id, author_order) VALUES (?, ?, ?)', [bookId, authorId, index + 1]);
    }
    for (const name of categoryNames) {
      const [found] = await connection.execute<any[]>('SELECT id FROM categories WHERE name = ? LIMIT 1', [name]);
      let categoryId: number;
      if (found.length) categoryId = found[0].id;
      else {
        const [created] = await connection.execute<any>('INSERT INTO categories (name) VALUES (?)', [name]);
        categoryId = Number(created.insertId);
      }
      await connection.execute('INSERT INTO book_categories (book_id, category_id) VALUES (?, ?)', [bookId, categoryId]);
    }
    await writeAudit(connection, (request as any).auth.id, 'BOOK_CREATED', 'books', bookId, { title: title.trim(), isbn: isbn?.trim() || null, categories: categoryNames });
    await connection.commit();
    response.status(201).json({ id: bookId, message: 'Book added to the catalog.' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

booksRouter.post('/:bookId/copies', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const bookId = Number(request.params.bookId);
  const barcode = typeof request.body?.barcode === 'string' ? request.body.barcode.trim() : '';
  const shelfLocation = typeof request.body?.shelfLocation === 'string' ? request.body.shelfLocation.trim() : null;
  if (!Number.isSafeInteger(bookId) || bookId < 1 || !barcode || barcode.length > 80 || (shelfLocation && shelfLocation.length > 100)) {
    response.status(400).json({ error: 'Enter a valid book and barcode. Shelf location must be 100 characters or fewer.' }); return;
  }
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [bookRows] = await connection.execute<any[]>('SELECT id FROM books WHERE id = ? FOR UPDATE', [bookId]);
    if (!bookRows.length) { await connection.rollback(); response.status(404).json({ error: 'Book not found.' }); return; }
    const [insert] = await connection.execute<any>('INSERT INTO book_copies (book_id, barcode, shelf_location) VALUES (?, ?, ?)', [bookId, barcode, shelfLocation || null]);
    const copyId = Number(insert.insertId);
    await assignNextReservation(connection, bookId, copyId);
    await writeAudit(connection, (request as any).auth.id, 'BOOK_COPY_ADDED', 'book_copies', copyId, { bookId, barcode });
    await connection.commit();
    response.status(201).json({ id: copyId, message: 'Copy added to the catalog.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

booksRouter.get('/copies', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const q = typeof request.query.q === 'string' ? request.query.q.trim().slice(0, 100) : '';
  const status = typeof request.query.status === 'string' ? request.query.status.toUpperCase() : 'ALL';
  if (!['ALL', 'IN_SERVICE', 'DAMAGED', 'LOST', 'WITHDRAWN'].includes(status)) { response.status(400).json({ error: 'Choose a valid copy status.' }); return; }
  const search = `%${q}%`;
  try {
    const [items] = await databasePool.execute<any[]>(
      `SELECT bc.id, bc.book_id AS bookId, bc.barcode, bc.copy_status AS status,
          bc.shelf_location AS shelfLocation, b.title,
          CONCAT(borrower.first_name, ' ', borrower.last_name) AS borrower,
          (SELECT l.id FROM loans l WHERE l.copy_id = bc.id AND l.status = 'ACTIVE' LIMIT 1) AS activeLoanId
         FROM book_copies bc JOIN books b ON b.id = bc.book_id
         LEFT JOIN loans active_loan ON active_loan.copy_id = bc.id AND active_loan.status = 'ACTIVE'
         LEFT JOIN users borrower ON borrower.id = active_loan.borrower_user_id
        WHERE (? = 'ALL' OR bc.copy_status = ?) AND (? = '' OR bc.barcode LIKE ? OR b.title LIKE ? OR bc.shelf_location LIKE ?)
        ORDER BY b.title, bc.barcode LIMIT 500`, [status, status, q, search, search, search]);
    response.json({ items });
  } catch (error) { next(error); }
});

booksRouter.patch('/copies/:copyId/status', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const copyId = Number(request.params.copyId);
  const status = request.body?.status;
  if (!Number.isSafeInteger(copyId) || copyId < 1 || !['IN_SERVICE', 'WITHDRAWN'].includes(status)) {
    response.status(400).json({ error: 'Choose a valid copy and status. Damaged copies return to service only after inspection.' }); return;
  }
  const auth = (request as any).auth;
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<any[]>(
      `SELECT bc.id, bc.book_id AS bookId, bc.copy_status AS copyStatus,
          EXISTS (SELECT 1 FROM loans WHERE copy_id = bc.id AND status = 'ACTIVE') AS hasActiveLoan,
          EXISTS (SELECT 1 FROM reservations WHERE allocated_copy_id = bc.id AND status = 'READY') AS hasHold
         FROM book_copies bc WHERE bc.id = ? FOR UPDATE`, [copyId]);
    if (!rows.length) { await connection.rollback(); response.status(404).json({ error: 'Copy not found.' }); return; }
    if (rows[0].hasActiveLoan || rows[0].hasHold) { await connection.rollback(); response.status(409).json({ error: 'An active loan or ready reservation is linked to this copy.' }); return; }
    if (status === 'WITHDRAWN' && !['IN_SERVICE', 'DAMAGED'].includes(rows[0].copyStatus)) {
      await connection.rollback(); response.status(409).json({ error: 'Only an in-service or damaged copy can be withdrawn. Lost items require a recovery record.' }); return;
    }
    if (status === 'IN_SERVICE' && !['DAMAGED', 'WITHDRAWN'].includes(rows[0].copyStatus)) {
      await connection.rollback(); response.status(409).json({ error: 'Only a damaged or withdrawn copy can be returned to service here. Lost items require a recovery record.' }); return;
    }
    await connection.execute('UPDATE book_copies SET copy_status = ? WHERE id = ?', [status, copyId]);
    if (status === 'IN_SERVICE') await assignNextReservation(connection, Number(rows[0].bookId), copyId);
    await writeAudit(connection, auth.id, 'BOOK_COPY_STATUS_CHANGED', 'book_copies', copyId, { from: rows[0].copyStatus, to: status });
    await connection.commit();
    response.json({ message: 'Copy status updated.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});
