interface BrandMarkProps {
  className?: string;
}

/** The cropped Carbonell Library emblem used in compact brand locations. */
export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <span className={`brand-mark brand-mark-image ${className}`.trim()} role="img" aria-label="Carbonell Library">
      <img src="/carbonell-library-mark.png" alt="" />
    </span>
  );
}
