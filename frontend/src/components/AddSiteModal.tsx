import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface AddSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export const AddSiteModal: React.FC<AddSiteModalProps> = ({ isOpen, onClose, onCreated }) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [logPath, setLogPath] = useState('/var/log/nginx/access.log');
  const [logFormat, setLogFormat] = useState<'combined' | 'json' | 'custom'>('combined');
  const [customRegex, setCustomRegex] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Fallback for browsers without native <dialog closedby="any"> support
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);

    let handleBackdropClick: ((event: MouseEvent) => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (handleBackdropClick) {
        dialog.removeEventListener('click', handleBackdropClick);
      }
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !domain.trim() || !logPath.trim()) {
      setError('请填写站点名称、域名和日志文件路径');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          domain,
          log_path: logPath,
          log_format: logFormat,
          custom_regex: customRegex,
        }),
      });
      if (!res.ok) {
        throw new Error('创建站点失败');
      }
      setName('');
      setDomain('');
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || '请求失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as any)}
      aria-labelledby={titleId}
      className="bg-[#0f172a] text-slate-100 border border-slate-700 rounded-lg p-0 w-full max-w-lg shadow-2xl"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <h2 id={titleId} className="text-sm font-mono font-semibold tracking-wide text-emerald-400">
          + 接入新 NGINX 日志源站点
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 p-1 rounded"
          aria-label="关闭弹窗"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
        {error && (
          <div className="p-2.5 bg-rose-500/15 border border-rose-500/40 text-rose-300 rounded font-mono">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-400 mb-1 font-mono">站点名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：API 生产网关"
              className="w-full bg-[#0B0F17] border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1 font-mono">绑定域名 *</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="api.example.com"
              className="w-full bg-[#0B0F17] border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-slate-400 mb-1 font-mono">
            服务器 Nginx Access Log 绝对路径 *
          </label>
          <input
            type="text"
            value={logPath}
            onChange={(e) => setLogPath(e.target.value)}
            placeholder="/var/log/nginx/access.log"
            className="w-full bg-[#0B0F17] border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            支持实时监听该文件增量写入（兼容 logrotate 切割），也可创建后直接拖拽上传历史 .log/.gz 文件。
          </p>
        </div>

        <div>
          <label className="block text-slate-400 mb-1 font-mono">日志格式</label>
          <select
            value={logFormat}
            onChange={(e) => setLogFormat(e.target.value as any)}
            className="w-full bg-[#0B0F17] border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
          >
            <option value="combined">Nginx Combined 默认/扩展格式 (推荐)</option>
            <option value="json">Nginx JSON 格式日志</option>
            <option value="custom">自定义命名分组正则表达式</option>
          </select>
        </div>

        {logFormat === 'custom' && (
          <div>
            <label className="block text-slate-400 mb-1 font-mono">自定义正则表达式 (Python Named Groups)</label>
            <input
              type="text"
              value={customRegex}
              onChange={(e) => setCustomRegex(e.target.value)}
              placeholder="^(?P<remote_addr>\S+) ... "
              className="w-full bg-[#0B0F17] border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
          >
            {submitting ? '正在创建...' : '确认创建并扫描'}
          </button>
        </div>
      </form>
    </dialog>
  );
};
