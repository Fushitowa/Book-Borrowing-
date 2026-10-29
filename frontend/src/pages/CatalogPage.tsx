import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../services/api';
import { Field, Modal, StatusPill } from '../components/LibraryUI';
import { isStaff } from '../utils/format';
import type { Notice } from '../types/app';
import type { Book, User } from '../types';
export function Catalog({ user, notify, inventoryMode = false }: { user: User; notify: (notice: Notice) => void; inventoryMode?: boolean }) {
  const [items, setItems] = useState<Book[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'book' | 'copy' | 'delete' | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFileName, setCoverFileName] = useState('');
  const [reservingBook, setReservingBook] = useState<number | null>(null);
  const staff = isStaff(user);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);
  const reload = useCallback(() => { setLoading(true); api<{ items: Book[] }>(`/books?q=${encodeURIComponent(query)}`).then((result) => setItems(result.items)).catch((e) => notify({ kind: 'error', message: e.message })).finally(() => setLoading(false)); }, [query, notify]);
  useEffect(reload, [reload]);
  const closeBookModal = () => { setModal(null); setCoverPreview(null); setCoverFileName(''); };
  const selectCover = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) { setCoverPreview(null); setCoverFileName(''); return; }
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!supportedTypes.includes(file.type) || file.size > 3 * 1024 * 1024) {
      event.currentTarget.value = '';
      setCoverPreview(null);
      setCoverFileName('');
      notify({ kind: 'error', message: 'Choose a JPG, PNG, or WebP image that is 3 MB or smaller.' });
      return;
    }
    setCoverPreview(URL.createObjectURL(file));
    setCoverFileName(file.name);
  };
  const createBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true);
    const data = new FormData(event.currentTarget);
    const cover = data.get('cover');
    if (cover instanceof File && cover.size === 0) data.delete('cover');
    try {
      await api('/books', { method: 'POST', body: data });
      closeBookModal(); notify({ kind: 'success', message: 'Book added to the catalog.' }); reload();
    } catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not save book.' }); }
    finally { setSaving(false); }
  };
  const createCopy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedBook) return; setSaving(true);
    const data = new FormData(event.currentTarget);
    const quantity = Number(data.get('quantity'));
    try {
      await api(`/books/${selectedBook.id}/copies`, { method: 'POST', body: JSON.stringify({ quantity }) });
      setModal(null); setSelectedBook(null); notify({ kind: 'success', message: `${quantity} physical ${quantity === 1 ? 'copy' : 'copies'} added and ready for circulation.` }); reload();
    } catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not add copy.' }); }
    finally { setSaving(false); }
  };
  const deleteBook = async () => {
    const book = selectedBook;
    if (!book) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await api('/books/' + book.id, { method: 'DELETE' });
      setItems((current) => current.filter((item) => item.id !== book.id));
      setModal(null);
      setSelectedBook(null);
      setDeleteError(null);
      notify({ kind: 'success', message: 'Book title deleted from the catalog.' });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this book title.');
    } finally {
      setDeleting(false);
    }
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
  return <><div className="page-title-row"><div><div className="eyebrow">{inventoryMode ? 'LIBRARY OPERATIONS' : 'COLLECTION'}</div><h1>{inventoryMode ? 'Categories & Inventory' : 'Book catalog'}</h1><p>{inventoryMode ? 'Manage category tags and physical copy inventory for the collection.' : 'Browse the titles and copies in your college library.'}</p></div>{staff && <button className="primary-button" onClick={() => setModal('book')}><span>＋</span> Add a book</button>}</div><div className="catalog-summary"><div><span className="summary-icon">▤</span><span><strong>{items.length}</strong><small>{query ? 'matching titles' : 'titles shown'}</small></span></div><div><span className="summary-icon pale">◉</span><span><strong>{totalCopies}</strong><small>physical copies shown</small></span></div><div className="summary-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, author, category, or ISBN" aria-label="Search catalog"/><kbd>↵</kbd></div></div><section className="surface catalog-surface"><div className="section-heading"><div><h2>All titles</h2><p>Availability is based on physical copy, active loan, and ready hold records.</p></div><span className="results-count">{items.length} results</span></div>{loading ? <div className="empty-state">Loading catalog…</div> : items.length ? <div className="book-grid">{items.map((book) => <article className="book-card" key={book.id}><div className="book-card-cover">{book.coverImageUrl ? <img src={book.coverImageUrl} alt={book.title + ' cover'} loading="lazy" /> : <div className="book-card-placeholder" aria-label="No cover image"><span>{book.title.slice(0, 1)}</span><small>CARBONELL LIBRARY</small></div>}<StatusPill label={Number(book.availableCopies) ? 'Available' : Number(book.reservedCopies) || Number(book.waitingReservations) ? 'Reserved' : Number(book.borrowedCopies) ? 'Borrowed' : 'No copies'} tone={Number(book.availableCopies) ? 'success' : Number(book.reservedCopies) || Number(book.waitingReservations) ? 'warning' : 'neutral'} /></div><div className="book-card-content"><div className="book-card-category">{book.categories || 'COLLEGE LIBRARY COLLECTION'}</div><h3>{book.title}</h3><p className="book-card-authors">{book.authors || 'Author not listed'}</p>{book.subtitle && <p className="book-card-subtitle">{book.subtitle}</p>}<p className="book-card-publisher">{[book.publisher, book.publicationYear].filter(Boolean).join(' · ') || 'College library collection'}</p><div className="book-card-details"><div><span>ISBN</span><strong>{book.isbn || '—'}</strong></div><div><span>EDITION</span><strong>{book.edition || 'Not specified'}</strong></div></div><div className="book-card-inventory"><div><strong>{Number(book.totalCopies)} {Number(book.totalCopies) === 1 ? 'copy' : 'copies'}</strong><span>{Number(book.availableCopies)} available</span></div><small>{Number(book.borrowedCopies)} borrowed · {Number(book.reservedCopies)} reserved · {Number(book.waitingReservations)} waiting</small></div><div className="book-card-actions">{staff ? <><button type="button" className="small-outline" onClick={() => { setSelectedBook(book); setModal('copy'); }}>＋ Add copies</button><button type="button" className="small-outline delete-book-action" aria-label={'Delete '+book.title} onClick={() => { setSelectedBook(book); setDeleteError(null); setModal('delete'); }}>Delete</button></> : user.roles.includes('STUDENT') && Number(book.availableCopies) > 0 ? <button type="button" className="small-outline card-primary-action" disabled={reservingBook === book.id} onClick={() => requestBorrow(book)}>{reservingBook === book.id ? 'Sending…' : 'Request book'}</button> : user.roles.includes('STUDENT') && Number(book.totalCopies) > 0 ? <button type="button" className="small-outline card-primary-action" disabled={reservingBook === book.id} onClick={() => reserve(book)}>{reservingBook === book.id ? 'Joining…' : 'Reserve'}</button> : null}</div></div></article>)}</div> : <div className="empty-state"><span className="empty-icon">▤</span><strong>No books found</strong><span>Try a different search, or add the first title to your collection.</span>{staff && <button className="text-button" onClick={() => setModal('book')}>Add a book →</button>}</div>}</section>{modal === 'book' && <Modal title="Add a catalog title" subtitle="Enter title-level details. Add physical copies separately." onClose={closeBookModal}><form className="form-grid" onSubmit={createBook}><Field label="Book title" required><input name="title" maxLength={255} required placeholder="e.g. The Little Prince"/></Field><Field label="Subtitle"><input name="subtitle" maxLength={255}/></Field><div className="field cover-field"><div className="field-label"><label htmlFor="book-cover">Book cover image</label><small>Optional · JPG, PNG, or WebP · max 3 MB</small></div><div className="cover-upload-card"><div className="cover-upload-preview">{coverPreview ? <img src={coverPreview} alt="" /> : <span aria-hidden="true">▤</span>}</div><div className="cover-upload-copy"><strong>{coverFileName || 'Add a cover image'}</strong><span>{coverFileName ? 'Cover ready to upload' : 'Choose a clear front-cover photo.'}</span><label className="cover-upload-action" htmlFor="book-cover">Choose image</label></div><input id="book-cover" className="cover-upload-input" type="file" name="cover" accept="image/jpeg,image/png,image/webp" onChange={selectCover} /></div></div><Field label="Author(s)" hint="Separate multiple authors with commas"><input name="authors" placeholder="Antoine de Saint-Exupéry"/></Field><Field label="Category tags" hint="Separate multiple categories with commas"><input name="categories" placeholder="Fiction, Adventure"/></Field><Field label="ISBN"><input name="isbn" maxLength={20} placeholder="978-…"/></Field><Field label="Edition"><input name="edition" maxLength={80} placeholder="2nd edition"/></Field><Field label="Publisher"><input name="publisher" maxLength={180} placeholder="Publisher name"/></Field><Field label="Publication year"><input name="year" type="number" min="1000" max={new Date().getFullYear() + 1} placeholder="2024"/></Field><div className="modal-actions"><button type="button" className="outline-button" onClick={closeBookModal}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save title'}</button></div></form></Modal>}{modal === 'copy' && selectedBook && <Modal title="Add physical copies" subtitle={'For “'+selectedBook.title+'”'} onClose={() => setModal(null)}><form className="form-grid" onSubmit={createCopy}><Field label="Number of copies" hint="A unique barcode is generated for each copy." required><input name="quantity" type="number" min="1" max="100" step="1" required defaultValue={1} autoFocus /></Field><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Adding copies…' : 'Save copies'}</button></div></form></Modal>}{modal === 'delete' && selectedBook && <Modal title="Delete catalog title" subtitle="Review this action before removing the title." onClose={() => { if (!deleting) { setModal(null); setSelectedBook(null); setDeleteError(null); } }}><div className="delete-confirmation"><span className="delete-confirmation-icon" aria-hidden="true">!</span><div><strong>{selectedBook.title}</strong><p>This permanently removes the title, its cover, and any copies that have never been borrowed. Titles with borrowing history, requests, or reservations cannot be deleted, so those records stay intact.</p></div></div>{deleteError && <div className="delete-error" role="alert">{deleteError}</div>}<div className="modal-actions"><button type="button" className="outline-button" disabled={deleting} onClick={() => { setModal(null); setSelectedBook(null); setDeleteError(null); }}>Cancel</button><button type="button" className="danger-button" disabled={deleting} onClick={deleteBook}>{deleting ? 'Deleting…' : 'Delete book'}</button></div></Modal>}</>;
}
