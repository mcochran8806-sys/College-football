interface Props {
  src: string | null;
  /** Tailwind size classes, e.g. 'h-10 w-10'. */
  size: string;
  className?: string;
}

/**
 * Team logo that fails invisibly.
 *
 * ESPN's CDN has no logo for a fair number of smaller programs, and returns
 * the odd 404 for ones it usually does have. A broken-image glyph is a lot
 * more noticeable on a 65" screen than a missing mark, so on error we hide the
 * element and keep its box — the row stays aligned either way.
 */
export default function TeamLogo({ src, size, className = '' }: Props) {
  if (!src) return <span className={`${size} shrink-0 ${className}`} />;
  return (
    <img
      src={src}
      alt=""
      loading="eager"
      className={`${size} shrink-0 object-contain ${className}`}
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden';
      }}
    />
  );
}
