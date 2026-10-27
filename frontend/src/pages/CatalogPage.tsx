import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../services/api';
import { Field, Modal, StatusPill } from '../components/LibraryUI';
import { isStaff } from '../utils/format';
import type { Notice } from '../types/app';
import type { Book, User } from '../types';
export function Catalog({ user, notify, inventoryMode = false }: { user: User; notify: (notice: Notice) => void; inventoryMode?: boolean }) {
  const [items, setItems] = useState<Book[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'book' | 'copy' | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [saving, setSaving] = useState(false);
  const [reservingBook, setReservingBook] = useState<number | null>(null);
  const staff = isStaff(user);
  const reload = useCallback(() => { setLoading(true); api<{ items: Book[] }>(`/books?q=${encodeURIComponent(query)}`).then((result) => setItems(result.items)).catch((e) => notify({ kind: 'error', message: e.message })).finally(() => setLoading(false)); }, [query, notify]);
  useEffect(reload, [reload]);
  const createBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true);
    const data = new FormData(event.currentTarget);
    try {
      await api('/books', { method: 'POST', body: JSON.stringify({ title: data.get('title'), subtitle: data.get('subtitle'), isbn: data.get('isbn'), edition: data.get('edition'), publicationYear: data.get('year') || null, publisher: data.get('publisher'), authors: String(data.get('authors') || '').split(',').map((a) => a.trim()).filter(Boolean), categories: String(data.get('categories') || '').split(',').map((category) => category.trim()).filter(Boolean) }) });
      setModal(null); notify({ kind: 'success', message: 'Book added to the catalog.' }); reload();
    } catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not save book.' }); }
    finally { setSaving(false); }
  };
  const createCopy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedBook) return; setSaving(true);
    const data = new FormData(event.currentTarget);
    try {
      await api(`/books/${selectedBook.id}/copies`, { method: 'POST', body: JSON.stringify({ barcode: data.get('barcode'), shelfLocation: data.get('shelfLocation') }) });
      setModal(null); setSelectedBook(null); notify({ kind: 'success', message: 'Physical copy added and ready for circulation.' }); reload();
    } catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not add copy.' }); }
    finally { setSaving(false); }
  };
  const reserve = async (book: Book) => {
    setReservingBook(book.id);
    try { await api('/reservations', { method: 'POST', body: JSON.stringify({ bookId: book.id }) }); notify({ kind: 'success', message: 'You are in the reservation queue. We’ll notify you when a copy is ready.' }); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not place reservation.' }); }
    finally { setReservingBook(null); }
  };
  const requestBorrow = async (book: Book) => {
    setReservingBook(book.id);
    try { await api('/borrowing-requests', { method: 'POST', body: JSON.stringify({ bookId: book.id }) }); notify({ kind: 'success', message: 'Borrowing request sent to library staff.' }); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not request this book.' }); }
    finally { setReservingBook(null); }
  };
  const totalCopies = items.reduce((sum, book) => sum + Number(book.totalCopies), 0);
  return <><div className="page-title-row"><div><div className="eyebrow">{inventoryMode ? 'LIBRARY OPERATIONS' : 'COLLECTION'}</div><h1>{inventoryMode ? 'Categories & Inventory' : 'Book catalog'}</h1><p>{inventoryMode ? 'Manage category tags and physical copy inventory for the collection.' : 'Browse the titles and copies in your college library.'}</p></div>{staff && <button className="primary-button" onClick={() => setModal('book')}><span>＋</span> Add a book</button>}</div><div className="catalog-summary"><div><span className="summary-icon">▤</span><span><strong>{items.length}</strong><small>{query ? 'matching titles' : 'titles shown'}</small></span></div><div><span className="summary-icon pale">◉</span><span><strong>{totalCopies}</strong><small>physical copies shown</small></span></div><div className="summary-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, author, category, or ISBN" aria-label="Search catalog"/><kbd>↵</kbd></div></div><section className="surface catalog-surface"><div className="section-heading"><div><h2>All titles</h2><p>Availability is based on physical copy, active loan, and ready hold records.</p></div><span className="results-count">{items.length} results</span></div>{loading ? <div className="empty-state">Loading catalog…</div> : items.length ? <div className="table-scroll"><table><thead><tr><th>TITLE</th><th>AUTHOR</th><th>ISBN / EDITION</th><th>COPIES</th><th>AVAILABILITY</th><th/></tr></thead><tbody>{items.map((book, index) => <tr key={book.id}><td><div className="book-cell"><span className={`book-cover cover-${index % 5}`}>{book.title.slice(0, 1)}</span><span><strong>{book.title}</strong><small>{[book.publisher, book.publicationYear, book.categories].filter(Boolean).join(' · ') || 'College library collection'}</small></span></div></td><td>{book.authors || '—'}</td><td className="mono">{book.isbn || 'No ISBN'}<small className="cell-sub">{book.edition || '—'}</small></td><td><strong>{Number(book.totalCopies)}</strong><small className="cell-sub">{Number(book.availableCopies)} available · {Number(book.borrowedCopies)} borrowed · {Number(book.reservedCopies)} reserved · {Number(book.waitingReservations)} waiting</small></td><td><StatusPill label={Number(book.availableCopies) ? 'Available' : Number(book.reservedCopies) || Number(book.waitingReservations) ? 'Reserved' : Number(book.borrowedCopies) ? 'Borrowed' : 'No copies'} tone={Number(book.availableCopies) ? 'success' : Number(book.reservedCopies) || Number(book.waitingReservations) ? 'warning' : 'neutral'} /></td><td>{staff ? <button className="small-outline" onClick={() => { setSelectedBook(book); setModal('copy'); }}>＋ Copy</button> : user.roles.includes('STUDENT') && Number(book.availableCopies) > 0 ? <button className="small-outline" disabled={reservingBook === book.id} onClick={() => requestBorrow(book)}>{reservingBook === book.id ? 'Sending…' : 'Request book'}</button> : user.roles.includes('STUDENT') && Number(book.totalCopies) > 0 ? <button className="small-outline" disabled={reservingBook === book.id} onClick={() => reserve(book)}>{reservingBook === book.id ? 'Joining…' : 'Reserve'}</button> : null}</td></tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-icon">▤</span><strong>No books found</strong><span>Try a different search, or add the first title to your collection.</span>{staff && <button className="text-button" onClick={() => setModal('book')}>Add a book →</button>}</div>}</section>{modal === 'book' && <Modal title="Add a catalog title" subtitle="Enter title-level details. Add physical copies separately." onClose={() => setModal(null)}><form className="form-grid" onSubmit={createBook}><Field label="Book title" required><input name="title" maxLength={255} required placeholder="e.g. The Little Prince"/></Field><Field label="Subtitle"><input name="subtitle" maxLength={255}/></Field><Field label="Author(s)" hint="Separate multiple authors with commas"><input name="authors" placeholder="Antoine de Saint-Exupéry"/></Field><Field label="Category tags" hint="Separate multiple categories with commas"><input name="categories" placeholder="Fiction, Adventure"/></Field><Field label="ISBN"><input name="isbn" maxLength={20} placeholder="978-…"/></Field><Field label="Edition"><input name="edition" maxLength={80} placeholder="2nd edition"/></Field><Field label="Publisher"><input name="publisher" maxLength={180} placeholder="Publisher name"/></Field><Field label="Publication year"><input name="year" type="number" min="1000" max={new Date().getFullYear() + 1} placeholder="2024"/></Field><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save title'}</button></div></form></Modal>}{modal === 'copy' && selectedBook && <Modal title="Add a physical copy" subtitle={`For “${selectedBook.title}”`} onClose={() => setModal(null)}><form className="form-grid" onSubmit={createCopy}><Field label="Barcode" hint="Must be unique in this library"><input name="barcode" maxLength={80} required autoFocus placeholder="e.g. LIB-00482"/></Field><Field label="Shelf location"><input name="shelfLocation" maxLength={100} placeholder="e.g. A-03-12"/></Field><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Add copy'}</button></div></form></Modal>}</>;
}
