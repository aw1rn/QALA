import { Film } from 'lucide-react';
import { useState } from 'react';

interface MoviePosterProps {
  src?: string;
  alt: string;
  title: string;
  className?: string;
}

export function MoviePoster({ src, alt, title, className = '' }: MoviePosterProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#171A23] via-[#101219] to-[#090A0F] p-4 text-center ${className}`}
      >
        <Film className="mb-3 h-8 w-8 text-[#E5A93C]/70" strokeWidth={1.5} />
        <span className="line-clamp-3 font-display text-sm font-semibold text-slate-300">
          {title}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setHasError(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
