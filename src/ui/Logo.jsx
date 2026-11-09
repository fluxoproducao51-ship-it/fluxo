// Brand mark: three connected process steps.
export function LogoMark({size = 30}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="3" fill="#0b5394" />
      <path d="M10 10h6v12h6" fill="none" stroke="#ffffff" strokeWidth="2" />
      <rect x="6" y="7" width="6" height="6" fill="#ffffff" />
      <rect x="13" y="13" width="6" height="6" fill="#ffffff" />
      <rect x="20" y="19" width="6" height="6" fill="#ffffff" />
    </svg>
  );
}

export function Logo({sub = 'Controle de produção'}) {
  return (
    <span style={{display: 'flex', alignItems: 'center', gap: 10}}>
      <LogoMark />
      <span>
        <span className="brand-name">Fluxo</span>
        <span className="brand-sub">{sub}</span>
      </span>
    </span>
  );
}
