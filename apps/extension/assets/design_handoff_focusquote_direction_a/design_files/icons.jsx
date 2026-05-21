// Stroke-only line icons — 16px default, inherit color
const Icon = ({ d, size = 16, stroke = 1.6, fill = "none", children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);

const IPlay     = (p) => <Icon {...p}><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" /></Icon>;
const IGear     = (p) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Icon>;
const ISearch   = (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
const ITimer    = (p) => <Icon {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></Icon>;
const IBookmark = (p) => <Icon {...p}><path d="M6 3h12v18l-6-4-6 4z" /></Icon>;
const IFlame    = (p) => <Icon {...p}><path d="M12 3s4 4 4 8a4 4 0 1 1-8 0c0-1.5.5-2.5 1.5-3.5C10 8 11 6 12 3z" /></Icon>;
const IArrow    = (p) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
const IArrowL   = (p) => <Icon {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>;
const IPlus     = (p) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
const IPause    = (p) => <Icon {...p}><path d="M7 4v16M17 4v16" /></Icon>;
const ICheck    = (p) => <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>;
const IX        = (p) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const ITag      = (p) => <Icon {...p}><path d="M20 12 12 4H4v8l8 8z" /><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" /></Icon>;
const IDot      = (p) => <Icon {...p}><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></Icon>;
const ISun      = (p) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>;
const IMoon     = (p) => <Icon {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Icon>;
const IUser     = (p) => <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>;
const ILogOut   = (p) => <Icon {...p}><path d="M15 4h4v16h-4M10 17l-5-5 5-5M5 12h12" /></Icon>;
const ITarget   = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></Icon>;
const IGlobe    = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icon>;
const IDatabase = (p) => <Icon {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></Icon>;
const IPen      = (p) => <Icon {...p}><path d="m4 20 4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" /></Icon>;
const IChevR    = (p) => <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>;
const IMinus    = (p) => <Icon {...p}><path d="M5 12h14" /></Icon>;
const IBolt     = (p) => <Icon {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></Icon>;

Object.assign(window, {
  Icon, IPlay, IGear, ISearch, ITimer, IBookmark, IFlame, IArrow, IArrowL,
  IPlus, IPause, ICheck, IX, ITag, IDot, ISun, IMoon, IUser, ILogOut,
  ITarget, IGlobe, IDatabase, IPen, IChevR, IMinus, IBolt,
});
