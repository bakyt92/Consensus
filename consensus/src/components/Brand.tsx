export function Brandmark({
  size = "md",
  onNavy = false,
}: {
  size?: "md" | "lg" | "xl";
  onNavy?: boolean;
}) {
  const cls = [
    "brand-mark",
    size === "lg" ? "lg" : size === "xl" ? "xl" : "",
    onNavy ? "on-navy" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return <div className={cls}>C</div>;
}

export function Wordmark({ onNavy = false }: { onNavy?: boolean }) {
  return <span className={"wordmark" + (onNavy ? " on-navy" : "")}>Consensus</span>;
}

export function BrandLockup({ onNavy = false }: { onNavy?: boolean }) {
  return (
    <div className="brand" style={{ gap: 12 }}>
      <Brandmark onNavy={onNavy} />
      <Wordmark onNavy={onNavy} />
    </div>
  );
}
