export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const val = bytes / Math.pow(k, i);
  return `${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[i]}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('zh-CN').format(n || 0);
}

export function statusBadgeClass(status: number): string {
  if (status >= 200 && status < 300) {
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  }
  if (status >= 300 && status < 400) {
    return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
  }
  if (status >= 400 && status < 500) {
    return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  }
  return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
}

export function methodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'text-emerald-400';
    case 'POST':
      return 'text-cyan-400';
    case 'PUT':
    case 'PATCH':
      return 'text-amber-400';
    case 'DELETE':
      return 'text-rose-400';
    default:
      return 'text-slate-400';
  }
}
