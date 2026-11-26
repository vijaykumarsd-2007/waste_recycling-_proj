import React from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  GlassWater,
  Layers,
  Package,
  RefreshCw,
  Shirt,
  Truck,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { formatISTDateTime } from '../shared/scheduling.ts';
import type { Pickup, PickupStatus } from '../shared/types.ts';

export function CategoryIcon({ name, className = 'w-5 h-5' }: { name: string; className?: string }) {
  switch (name) {
    case 'FileText':
      return <FileText className={className} />;
    case 'Package':
      return <Package className={className} />;
    case 'Wrench':
      return <Wrench className={className} />;
    case 'Cpu':
      return <Cpu className={className} />;
    case 'GlassWater':
      return <GlassWater className={className} />;
    case 'Shirt':
      return <Shirt className={className} />;
    case 'BatteryCharging':
      return <BatteryCharging className={className} />;
    default:
      return <Layers className={className} />;
  }
}

export function StatusText({ status }: { status: PickupStatus | string }) {
  switch (status) {
    case 'Completed':
    case 'approved':
    case 'Delivered':
    case 'Resolved':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'En Route':
    case 'Picked Up':
    case 'Dispatched':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 whitespace-nowrap">
          <Truck className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'Assigned':
    case 'Confirmed':
    case 'Replied':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
          <span>{status}</span>
        </span>
      );
    case 'Rescheduled':
    case 'pending':
    case 'New':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'Cancelled':
    case 'rejected':
    case 'blocked':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
  }
}

export function ImageWithFallback({
  src,
  alt,
  className = '',
  fallbackTitle,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  if (failed || !src) {
    return (
      <div className={`bg-slate-100 border border-slate-200 flex flex-col items-center justify-center p-6 text-center ${className}`}>
        <Layers className="w-8 h-8 text-emerald-700 mb-2" />
        <p className="text-sm font-medium text-slate-700">{fallbackTitle || alt}</p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

const LIFECYCLE_STAGES: PickupStatus[] = ['Requested', 'Assigned', 'En Route', 'Picked Up', 'Completed'];

export function PickupTimelineTracker({ pickup }: { pickup: Pickup }) {
  const isCancelled = pickup.status === 'Cancelled';
  const currentIdx = LIFECYCLE_STAGES.indexOf(
    pickup.status === 'Rescheduled' ? 'Assigned' : pickup.status
  );

  return (
    <div className="space-y-6">
      {!isCancelled && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {LIFECYCLE_STAGES.map((stage, idx) => {
            const reached = idx <= (currentIdx === -1 ? 0 : currentIdx);
            const isCurrent = idx === currentIdx;
            return (
              <div
                key={stage}
                className={`p-3 border rounded-lg transition-colors ${
                  reached
                    ? isCurrent
                      ? 'border-emerald-700 bg-emerald-50/50'
                      : 'border-slate-200 bg-white'
                    : 'border-slate-200 bg-slate-50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-1">
                  <span>0{idx + 1}</span>
                  {reached ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  ) : (
                    <Clock className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div className="text-sm font-semibold text-slate-900">{stage}</div>
              </div>
            );
          })}
        </div>
      )}

      {isCancelled && (
        <div className="p-4 border border-red-200 bg-red-50/60 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-900">Pickup Cancelled</p>
            <p className="text-xs text-red-700 mt-0.5">
              {pickup.late_flag
                ? 'Flagged as late cancellation (within 2 hours of slot start).'
                : 'Cancelled within the free cancellation window.'}
            </p>
          </div>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">
        {pickup.timeline.map((ev) => (
          <div key={ev.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span>{ev.status}</span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="text-xs font-normal text-slate-500">
                  {ev.actor_name ? `${ev.actor_name} (${ev.actor_role})` : ev.actor_role}
                </span>
              </div>
              {ev.note && <p className="text-sm text-slate-600 mt-0.5">{ev.note}</p>}
            </div>
            <div className="text-xs font-mono text-slate-500 shrink-0">{formatISTDateTime(ev.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="border border-slate-200 bg-white rounded-lg p-10 text-center">
      <Layers className="w-8 h-8 text-slate-400 mx-auto mb-3" />
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 max-w-md mx-auto mt-1">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="border border-slate-200 bg-white rounded-lg divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center justify-between gap-4 animate-pulse">
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-slate-200 rounded w-1/3" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
          </div>
          <div className="h-4 bg-slate-200 rounded w-20" />
        </div>
      ))}
    </div>
  );
}

export function ModalDialog({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
      <div className={`w-full ${maxWidth} bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden my-8`}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
