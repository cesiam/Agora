import { Link } from "react-router-dom";

type AgoraLogoProps = {
  href?: string;
  size?: "sm" | "md";
  className?: string;
};

export function AgoraLogo({ href = "/", size = "md", className = "" }: AgoraLogoProps) {
  const height = size === "sm" ? "h-8" : "h-10";

  const mark = (
    <img
      src="/logo_agora.png"
      alt="Agora — Understand Out Loud"
      className={`${height} w-auto object-contain`}
    />
  );

  const merged = `inline-flex items-center ${className}`.trim();

  if (href) {
    return (
      <Link to={href} className={merged}>
        {mark}
      </Link>
    );
  }

  return <span className={merged}>{mark}</span>;
}
