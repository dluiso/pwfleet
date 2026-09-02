import { CircleCheck, CircleDashed, CircleOff, ShieldAlert, TriangleAlert } from "lucide-react";
import { formatEnum } from "@/lib/format";

const styles: Record<string, { className: string; icon: typeof CircleCheck }> = {
  cleared: { className: "status-cleared", icon: CircleCheck },
  cleared_with_advisory: { className: "status-advisory", icon: TriangleAlert },
  hold_for_review: { className: "status-review", icon: ShieldAlert },
  out_of_service: { className: "status-out", icon: CircleOff },
  inspection_required: { className: "status-required", icon: CircleDashed },
  maintenance_in_progress: { className: "status-review", icon: ShieldAlert },
  ready_for_reinspection: { className: "status-required", icon: CircleDashed },
};

const defaultStyle = { className: "status-required", icon: CircleDashed };

export function StatusBadge({ value, compact = false }: { value: string; compact?: boolean }) {
  const style = styles[value] ?? defaultStyle;
  const Icon = style.icon;
  return (
    <span className={`status-badge ${style.className} ${compact ? "status-badge-compact" : ""}`}>
      <Icon size={compact ? 12 : 14} />
      {formatEnum(value)}
    </span>
  );
}
