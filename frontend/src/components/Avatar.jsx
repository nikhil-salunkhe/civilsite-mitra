import React from 'react';
import { resolveMediaUrl } from '../utils/format';

/**
 * Avatar - user image with a graceful initials fallback.
 *
 * Used by the engineer sidebar, the admin sidebar and the Profile page so the
 * photo resolves identically everywhere. Uploaded files live at /uploads on
 * the API host, so the stored path MUST go through resolveMediaUrl; using the
 * raw value points the <img> at the frontend origin and renders broken.
 *
 * If the stored file is missing (deleted on disk, or an old path from before a
 * deployment) the onError handler swaps in the initials rather than showing the
 * browser's broken-image glyph.
 */
export function Avatar({ user, size = 'md', className = '', rounded = 'rounded-full' }) {
  const name = user?.name || 'U';
  const initials = name.charAt(0).toUpperCase();

  const sizes = {
    xs: 'w-7 h-7 text-xs',
    sm: 'w-9 h-9 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-20 h-20 text-2xl',
  };
  const box = sizes[size] || sizes.sm;

  const [broken, setBroken] = React.useState(false);
  const src = broken ? '' : resolveMediaUrl(user?.profilePhoto);

  // Reset the fallback when the user (or their photo) actually changes.
  React.useEffect(() => { setBroken(false); }, [user?.profilePhoto]);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setBroken(true)}
        className={`${box} ${rounded} object-cover border border-gray-200 shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${box} ${rounded} bg-primary-100 text-primary-700 flex items-center justify-center font-semibold shrink-0 ${className}`}
    >
      {initials}
    </span>
  );
}

export default Avatar;