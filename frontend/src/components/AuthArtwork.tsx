import { BrandMark } from './BrandMark';

function InteractiveBook() {
  return (
    <div className="interactive-book" role="img" aria-label="Carbonell Book Borrowing System, an illustrated book that opens and sketches while you enter your account details">
      <div className="book-pages">
        <div className="book-page-half book-page-left">
          <span className="paper-kicker">CARBONELL LIBRARY</span>
          <strong className="paper-heading">A story begins<br />with a reader.</strong>
          <span className="paper-rule" />
          <span className="paper-footer">READ · DISCOVER · GROW</span>
        </div>
        <div className="book-page-half book-page-right">
          <span className="paper-kicker">YOUR NEXT CHAPTER</span>
          <span className="paper-lines" />
          <span className="paper-lines short" />
          <span className="paper-footer">CARBONELL · 2026</span>
        </div>
        <div className="book-gutter" />
      </div>
      <div className="book-back-cover" />
      <div className="book-front-cover">
        <span className="cover-monogram"><img src="/carbonell-library-mark.png" alt="" /></span>
        <span className="cover-eyebrow">CARBONELL LIBRARY PRESENTS</span>
        <strong>CARBONELL<br />BOOK BORROWING<br />SYSTEM</strong>
        <span className="cover-edition">A COLLEGE LIBRARY STORY</span>
        <span className="cover-corner" />
      </div>
      <span className="book-page-edge" />
    </div>
  );
}

export function AuthArtwork() {
  return (
    <div className="login-art">
      <div className="art-grain" />
      <div className="art-top">
        <BrandMark className="brand-mark-light" />
        <span>CARBONELL <i>LIBRARY</i></span>
        <span className="art-campus-label">A COLLEGE LIBRARY</span>
      </div>
      <div className="book-art">
        <InteractiveBook />
        <div className="plant"><b /><b /><b /><b /><b /><i /></div>
        <div className="sun-disc" />
      </div>
      <div className="art-caption">
        <span>READ · DISCOVER · GROW</span>
        <h2>Every book<br />opens a new world.</h2>
        <p>Find your next favorite, and take it with you.</p>
      </div>
      <div className="art-footer"><span>COLLEGE LIBRARY</span><span>READ · LEARN · GROW</span></div>
    </div>
  );
}
