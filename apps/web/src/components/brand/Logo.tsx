import { Link } from "react-router-dom";

import orbitMark from "../../../Orbit logo.svg";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link to={href} className="flex items-center gap-2.5 no-underline">
      <img
        src={orbitMark}
        alt=""
        className={compact ? "h-7 w-7 object-contain" : "h-8 w-8 object-contain"}
      />
      {compact ? (
        <span className="sr-only">Orbit</span>
      ) : (
        <span className="text-sm font-semibold tracking-[0.14em] text-paper">ORBIT</span>
      )}
    </Link>
  );
}
