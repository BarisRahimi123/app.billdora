import { useEffect, useState, createContext, useContext, useCallback, ReactNode } from 'react';
import { Check, X, AlertCircle, Info, Bell, FileText, DollarSign, UserCheck, Sparkles } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'notification';

interface ToastProps {
  message: string;
  title?: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, title, type = 'success', duration = 4000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true));
    
    const timer = setTimeout(() => {
      setIsLeaving(true);
      setTimeout(onClose, 400);
    }, duration);
    
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(onClose, 400);
  };

  const icons = {
    success: <Check className="w-5 h-5" />,
    error: <X className="w-5 h-5" />,
    warning: <AlertCircle className="w-5 h-5" />,
    info: <Info className="w-5 h-5" />,
    notification: <Bell className="w-5 h-5" />,
  };

  const styles = {
    success: {
      bg: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
      icon: 'bg-white/20',
      border: 'border-emerald-400/30',
    },
    error: {
      bg: 'bg-gradient-to-r from-red-500 to-red-600',
      icon: 'bg-white/20',
      border: 'border-red-400/30',
    },
    warning: {
      bg: 'bg-gradient-to-r from-amber-500 to-orange-500',
      icon: 'bg-white/20',
      border: 'border-amber-400/30',
    },
    info: {
      bg: 'bg-gradient-to-r from-blue-500 to-blue-600',
      icon: 'bg-white/20',
      border: 'border-blue-400/30',
    },
    notification: {
      bg: 'bg-gradient-to-r from-[#476E66] to-[#3A5B54]',
      icon: 'bg-white/20',
      border: 'border-[#5A8078]/30',
    },
  };

  const style = styles[type];

  return (
    <div
      className={`
        relative overflow-hidden
        flex items-start gap-3 
        px-4 py-3.5 
        rounded-2xl 
        shadow-2xl shadow-black/20
        border ${style.border}
        ${style.bg}
        text-white
        backdrop-blur-xl
        transition-all duration-400 ease-out
        ${isVisible && !isLeaving 
          ? 'opacity-100 translate-y-0 scale-100' 
          : 'opacity-0 translate-y-4 scale-95'
        }
      `}
      style={{ 
        minWidth: '280px', 
        maxWidth: '380px',
        boxShadow: '0 20px 40px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.1) inset'
      }}
    >
      {/* Animated shine effect */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.3) 45%, rgba(255,255,255,0.3) 55%, transparent 60%)',
          animation: isVisible ? 'shine 2s ease-out' : 'none',
        }}
      />
      
      {/* Icon */}
      <div className={`flex-shrink-0 w-10 h-10 ${style.icon} rounded-xl flex items-center justify-center`}>
        {icons[type]}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        {title && (
          <p className="font-semibold text-sm leading-tight mb-0.5">{title}</p>
        )}
        <p className={`${title ? 'text-white/90 text-sm' : 'font-medium text-sm'} leading-snug`}>
          {message}
        </p>
      </div>
      
      {/* Close button */}
      <button 
        onClick={handleClose} 
        className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10">
        <div 
          className="h-full bg-white/40 rounded-full"
          style={{
            animation: `shrink ${duration}ms linear forwards`,
          }}
        />
      </div>
      
      {/* Add keyframes via style tag */}
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
        @keyframes shine {
          from { transform: translateX(-100%); }
          to { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

// Toast context for global usage
interface ToastContextType {
  showToast: (message: string, type?: ToastType, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; type: ToastType; title?: string }[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success', title?: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, title }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container - bottom on mobile, top-right on desktop */}
      <div className="fixed bottom-20 left-4 right-4 sm:bottom-auto sm:top-6 sm:right-6 sm:left-auto z-[100] flex flex-col gap-3 items-center sm:items-end pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast
              message={toast.message}
              title={toast.title}
              type={toast.type}
              onClose={() => removeToast(toast.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
