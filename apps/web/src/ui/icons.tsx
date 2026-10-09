import type { ReactNode } from 'react'

// One weight of line icon for every control, so the interface reads as a single set.
const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)
const slash = <path d="M4 4l16 16" />
const micBody = (
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </>
)
const camBody = (
  <>
    <rect x="3" y="7" width="12" height="10" rx="2" />
    <path d="M15 11l6-3v8l-6-3z" />
  </>
)

export const Icon = {
  mic: () => <Svg>{micBody}</Svg>,
  micOff: () => (
    <Svg>
      {micBody}
      {slash}
    </Svg>
  ),
  cam: () => <Svg>{camBody}</Svg>,
  camOff: () => (
    <Svg>
      {camBody}
      {slash}
    </Svg>
  ),
  blur: () => (
    <Svg>
      <circle cx="12" cy="9" r="3" />
      <path d="M6.500 19a5.500 5.500 0 0 1 11 0" />
      <path d="M3 5h.01M3 10h.01M3 15h.01M21 5h.01M21 10h.01M21 15h.01M7 3h.01M17 3h.01" />
    </Svg>
  ),
  volume: () => (
    <Svg>
      <path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM15.500 9a4 4 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11" />
    </Svg>
  ),
  volumeOff: () => (
    <Svg>
      <path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM16 9.500l5 5M21 9.500l-5 5" />
    </Svg>
  ),
  screen: () => (
    <Svg>
      <rect x="3" y="4.500" width="18" height="12" rx="1.500" />
      <path d="M8.500 20h7M12 16.500V20M12 13V8M9.500 10.500L12 8l2.500 2.500" />
    </Svg>
  ),
  flame: () => (
    <Svg>
      <path d="M12 3c.500 3-3 4.500-3 8a3 3 0 0 0 1 2.200C9 10.500 12 10 12 7.500c2.500 2 5 4.500 5 8a5 5 0 0 1-10 0c0-1 .200-1.800.500-2.500" />
    </Svg>
  ),
  phone: () => (
    <Svg>
      <path d="M6.500 3.500h3l1.500 4-2 1.500a11 11 0 0 0 6 6l1.500-2 4 1.500v3a2 2 0 0 1-2 2A15.500 15.500 0 0 1 4.500 5.500a2 2 0 0 1 2-2z" />
    </Svg>
  ),
  timer: () => (
    <Svg>
      <circle cx="12" cy="13.500" r="7.500" />
      <path d="M12 9.500v4l2.500 2M9.500 3h5M12 3v3" />
    </Svg>
  ),
  stop: () => (
    <Svg>
      <rect x="6.500" y="6.500" width="11" height="11" rx="1.500" />
    </Svg>
  ),
  restart: () => (
    <Svg>
      <path d="M4.500 12a7.500 7.500 0 1 0 2.300-5.400M4.500 4.500v4h4" />
    </Svg>
  ),
  pin: () => (
    <Svg>
      <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6" />
    </Svg>
  ),
  door: () => (
    <Svg>
      <path d="M6 20.500V4.500a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16M4 20.500h16M14.500 12.500h.01" />
    </Svg>
  ),
  calendar: () => (
    <Svg>
      <rect x="4" y="5.500" width="16" height="14" rx="1.500" />
      <path d="M4 10h16M8.500 3.500v4M15.500 3.500v4" />
    </Svg>
  ),
  expand: () => (
    <Svg>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </Svg>
  ),
  shrink: () => (
    <Svg>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </Svg>
  ),
  leave: () => (
    <Svg>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />
    </Svg>
  ),
  play: () => (
    <Svg>
      <path d="M8 5l11 7-11 7z" />
    </Svg>
  ),
  pause: () => (
    <Svg>
      <path d="M8 5v14M16 5v14" />
    </Svg>
  ),
  skip: () => (
    <Svg>
      <path d="M5 5l10 7-10 7zM19 5v14" />
    </Svg>
  ),
  plus: () => (
    <Svg>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  close: () => (
    <Svg>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  note: () => (
    <Svg>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </Svg>
  ),
  send: () => (
    <Svg>
      <path d="M4 12l16-7-6 16-3-6.5z" />
    </Svg>
  ),
  wave: () => (
    <Svg>
      <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5v-6a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v6M17 10a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7c-2.6 0-4.3-1.200-5.700-3.400L5 13.800a1.500 1.500 0 0 1 2.500-1.600L8 13" />
    </Svg>
  ),
  heart: () => (
    <Svg>
      <path d="M12 20s-7.500-4.600-7.500-10.200A4.200 4.200 0 0 1 12 7.400a4.200 4.200 0 0 1 7.500 2.400C19.500 15.400 12 20 12 20z" />
    </Svg>
  ),
  laugh: () => (
    <Svg>
      <circle cx="12" cy="12" r="8.500" />
      <path d="M8 13.500a4.200 4.200 0 0 0 8 0zM8.500 9.500h.01M15.500 9.500h.01" />
    </Svg>
  ),
  cheer: () => (
    <Svg>
      <path d="M12 3.500l2.500 5.300 5.800.8-4.200 4 1 5.700-5.100-2.800-5.100 2.800 1-5.700-4.200-4 5.800-.8z" />
    </Svg>
  ),
  sun: () => (
    <Svg>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800" />
    </Svg>
  ),
  moon: () => (
    <Svg>
      <path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z" />
    </Svg>
  ),
  up: () => (
    <Svg>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  ),
  people: () => (
    <Svg>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.800a3.500 3.500 0 0 1 0 6.400M18 14.500a6 6 0 0 1 3.500 5.500" />
    </Svg>
  ),
  message: () => (
    <Svg>
      <path d="M4 5h16v11H10l-5 4v-4H4z" />
    </Svg>
  ),
  edit: () => (
    <Svg>
      <path d="M4 20l1-4.500L16.500 4l3.500 3.500L8.500 19z" />
      <path d="M14 6.500l3.500 3.500" />
    </Svg>
  ),
  bullets: () => (
    <Svg>
      <path d="M9 7h11M9 12h11M9 17h11" />
      <path d="M4.500 7h.010M4.500 12h.010M4.500 17h.010" strokeWidth="2.6" />
    </Svg>
  ),
  numbers: () => (
    <Svg>
      <path d="M10 7h10M10 12h10M10 17h10M4 5.500l1.500-.500V9M4 14.500h2.500L4 18h2.500" />
    </Svg>
  ),
  indent: () => (
    <Svg>
      <path d="M4 5h16M11 10h9M11 14h9M4 19h16M4 9.500l3.500 2.500L4 14.500z" />
    </Svg>
  ),
  outdent: () => (
    <Svg>
      <path d="M4 5h16M11 10h9M11 14h9M4 19h16M7.500 9.500L4 12l3.500 2.500z" />
    </Svg>
  ),
  trash: () => (
    <Svg>
      <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </Svg>
  ),
  check: () => (
    <Svg>
      <path d="M5 12.500l4.500 4.500L19 7.500" />
    </Svg>
  ),
  tasks: () => (
    <Svg>
      <path d="M4 6.500l1.500 1.500L8 5M4 12.500l1.500 1.500L8 11M4 18.500l1.500 1.500L8 17M11 6.500h9M11 12.500h9M11 18.500h9" />
    </Svg>
  ),
  grip: () => (
    <Svg>
      <path d="M9 6h.010M15 6h.010M9 12h.010M15 12h.010M9 18h.010M15 18h.010" strokeWidth="2.6" />
    </Svg>
  ),
  target: () => (
    <Svg>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  bell: () => (
    <Svg>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15zM10 20.500h4M12 3v2" />
    </Svg>
  ),
}
