import type { ReactNode } from 'react';

export type IconName =
  | 'cube'
  | 'layers'
  | 'grid'
  | 'shuffle'
  | 'undo'
  | 'restore'
  | 'orbit'
  | 'prev'
  | 'next'
  | 'play'
  | 'pause'
  | 'rewind'
  | 'camera'
  | 'image'
  | 'scan'
  | 'close'
  | 'check'
  | 'clock'
  | 'turnCw'
  | 'turnCcw'
  | 'turn180'
  | 'axes'
  | 'panel'
  | 'panelHide'
  | 'settings'
  | 'pro'
  | 'volume'
  | 'volumeOff'
  | 'fullscreen'
  | 'fullscreenExit';

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="icon">
      {glyph(name)}
    </svg>
  );
}

function glyph(name: IconName): ReactNode {
  switch (name) {
    case 'cube':
      return (
        <path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6L12 3.2Zm0 8.2 8-4.2M12 11.4 4 7.2M12 11.4v9.2" />
      );
    case 'layers':
      return (
        <>
          <path d="M12 3.5 20.5 8 12 12.5 3.5 8 12 3.5Z" />
          <path d="M3.5 12 12 16.5 20.5 12" />
          <path d="M3.5 16 12 20.5 20.5 16" />
        </>
      );
    case 'grid':
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="1.5" />
          <path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" />
        </>
      );
    case 'shuffle':
      return (
        <>
          <path d="M4 7h11M12 4l3 3-3 3" />
          <path d="M4 17h11M12 14l3 3-3 3" />
        </>
      );
    case 'undo':
      return <path d="M9 7 4 12l5 5M4 12h10.5a5.5 5.5 0 1 1 0 11H13" />;
    case 'restore':
      return (
        <>
          <path d="M20 12a8 8 0 1 1-2.2-5.5" />
          <path d="M20 4v5h-5" />
        </>
      );
    case 'orbit':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v3.2M12 17.3v3.2M3.5 12h3.2M17.3 12h3.2" />
        </>
      );
    case 'prev':
      return <path d="M14.5 5.5 8 12l6.5 6.5" />;
    case 'next':
      return <path d="M9.5 5.5 16 12l-6.5 6.5" />;
    case 'play':
      return <path d="M8 5.5v13l11-6.5L8 5.5Z" />;
    case 'pause':
      return (
        <>
          <path d="M8 5.5v13" />
          <path d="M16 5.5v13" />
        </>
      );
    case 'rewind':
      return (
        <>
          <path d="M11 7 5 12l6 5V7Z" />
          <path d="M19 7l-6 5 6 5V7Z" />
        </>
      );
    case 'camera':
      return (
        <>
          <path d="M4 8.5h3.2L8.6 6h6.8l1.4 2.5H20v10.2H4V8.5Z" />
          <circle cx="12" cy="13.2" r="3" />
        </>
      );
    case 'image':
      return (
        <>
          <rect x="4" y="5" width="16" height="14" rx="1.6" />
          <path d="m7 15 3.2-3.2L16 17" />
          <circle cx="9" cy="9.2" r="1" />
        </>
      );
    case 'scan':
      return (
        <>
          <path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5V8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M16 20h2.5a1.5 1.5 0 0 0 1.5-1.5V16" />
          <path d="M4 12h16" />
        </>
      );
    case 'close':
      return <path d="M6 6l12 12M18 6 6 18" />;
    case 'check':
      return <path d="M5 12.5 9.5 17 19 7" />;
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4.5l3 2" />
        </>
      );
    case 'turnCw':
      return (
        <>
          <path d="M8 8.2a5.2 5.2 0 1 1-1.5 5.6" />
          <path d="M8 4.6v4.2h4.2" />
        </>
      );
    case 'turnCcw':
      return (
        <>
          <path d="M16 8.2a5.2 5.2 0 1 0 1.5 5.6" />
          <path d="M16 4.6v4.2h-4.2" />
        </>
      );
    case 'turn180':
      return (
        <>
          <path d="M6.5 9.2a5.2 5.2 0 0 1 9.2-2.4" />
          <path d="M14.2 4.4 16.4 7.2 13.4 8" />
          <path d="M17.5 14.8a5.2 5.2 0 0 1-9.2 2.4" />
          <path d="M9.8 19.6 7.6 16.8 10.6 16" />
        </>
      );
    case 'panel':
      return (
        <>
          <rect x="3.5" y="4" width="17" height="16" rx="2" />
          <path d="M3.5 14.5h17" />
        </>
      );
    case 'panelHide':
      return (
        <>
          <rect x="3.5" y="4" width="17" height="16" rx="2" />
          <path d="M3.5 14.5h17" />
          <path d="M9 11.2 12 8.4l3 2.8" />
        </>
      );
    case 'settings':
      return (
        <>
          <path d="M4 8h16M4 16h16" />
          <circle cx="9" cy="8" r="2.2" />
          <circle cx="15" cy="16" r="2.2" />
        </>
      );
    case 'pro':
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" />
          <path d="M17 1.8l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z" />
        </>
      );
    case 'volume':
      return (
        <>
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
          <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
        </>
      );
    case 'volumeOff':
      return (
        <>
          <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
          <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
        </>
      );
    case 'fullscreen':
      return <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />;
    case 'fullscreenExit':
      return <path d="M9 4v5H4M15 4v5h5M15 20v-5h5M9 20v-5H4" />;
    case 'axes':
      return (
        <>
          <path d="M12 20V8" />
          <path d="M12 8 5 12" />
          <path d="M12 8l7 3" />
          <path d="m5 12 2.2-1.2M19 11l-2.2 1.2M12 8l-1.2 2.4" />
        </>
      );
  }
}
