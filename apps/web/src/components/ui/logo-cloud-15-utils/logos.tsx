function Wordmark({ label, width }: { label: string; width: number }) {
  return (
    <svg viewBox={`0 0 ${width} 36`} className="h-8 w-auto shrink-0" role="img" aria-label={label}>
      <text
        x="0"
        y="26"
        fill="currentColor"
        fontFamily="Manrope, Segoe UI, sans-serif"
        fontSize="22"
        fontWeight={600}
        letterSpacing="-0.04em"
      >
        {label}
      </text>
    </svg>
  );
}

export const Logo01 = () => <Wordmark label="Vault" width={72} />;
export const Logo02 = () => <Wordmark label="Policy" width={84} />;
export const Logo03 = () => <Wordmark label="Agent" width={78} />;
export const Logo04 = () => <Wordmark label="Allowlist" width={124} />;
export const Logo05 = () => <Wordmark label="Expiry" width={86} />;
export const Logo06 = () => <Wordmark label="Replay" width={82} />;
export const Logo07 = () => <Wordmark label="Pause" width={78} />;
export const Logo08 = () => <Wordmark label="USDC" width={72} />;
