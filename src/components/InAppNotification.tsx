/**
 * In-App Notification Component
 * 
 * Beautiful, modern notification popup that appears when notifications
 * are received while the app is open.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Bell, FileText, DollarSign, CheckCircle, AlertTriangle, Clock, Users, FolderOpen, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface InAppNotificationProps {
  id: string;
  type: string;
  title: string;
  message: string;
  referenceId?: string;
  referenceType?: string;
  timestamp?: Date;
  onDismiss: (id: string) => void;
  onClick?: () => void;
}

const typeConfig: Record<string, { icon: React.ComponentType<any>; gradient: string; iconBg: string }> = {
  proposal_viewed: {
    icon: FileText,
    gradient: 'from-blue-500 to-blue-600',
    iconBg: 'bg-blue-400/30',
  },
  proposal_signed: {
    icon: CheckCircle,
    gradient: 'from-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-400/30',
  },
  proposal_declined: {
    icon: FileText,
    gradient: 'from-neutral-600 to-neutral-700',
    iconBg: 'bg-neutral-400/30',
  },
  invoice_viewed: {
    icon: DollarSign,
    gradient: 'from-blue-500 to-indigo-600',
    iconBg: 'bg-blue-400/30',
  },
  invoice_paid: {
    icon: DollarSign,
    gradient: 'from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-400/30',
  },
  invoice_overdue: {
    icon: Clock,
    gradient: 'from-amber-500 to-orange-600',
    iconBg: 'bg-amber-400/30',
  },
  payment_received: {
    icon: DollarSign,
    gradient: 'from-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-400/30',
  },
  project_created: {
    icon: FolderOpen,
    gradient: 'from-[#476E66] to-[#3A5B54]',
    iconBg: 'bg-[#5A8078]/30',
  },
  project_completed: {
    icon: CheckCircle,
    gradient: 'from-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-400/30',
  },
  budget_warning: {
    icon: AlertTriangle,
    gradient: 'from-amber-500 to-orange-500',
    iconBg: 'bg-amber-400/30',
  },
  task_assigned: {
    icon: ClipboardList,
    gradient: 'from-[#476E66] to-[#3A5B54]',
    iconBg: 'bg-[#5A8078]/30',
  },
  new_client_added: {
    icon: Users,
    gradient: 'from-[#476E66] to-[#3A5B54]',
    iconBg: 'bg-[#5A8078]/30',
  },
  default: {
    icon: Bell,
    gradient: 'from-[#476E66] to-[#3A5B54]',
    iconBg: 'bg-[#5A8078]/30',
  },
};

export function InAppNotification({
  id,
  type,
  title,
  message,
  referenceId,
  referenceType,
  timestamp,
  onDismiss,
  onClick,
}: InAppNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const navigate = useNavigate();
  
  const config = typeConfig[type] || typeConfig.default;
  const Icon = config.icon;

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true));
    
    // Auto dismiss after 6 seconds
    const timer = setTimeout(() => handleDismiss(), 6000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = useCallback(() => {
    setIsLeaving(true);
    setTimeout(() => onDismiss(id), 400);
  }, [id, onDismiss]);

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick();
    } else if (referenceId && referenceType) {
      // Navigate based on reference type
      switch (referenceType) {
        case 'quote':
          navigate(`/sales?tab=quotes&id=${referenceId}`);
          break;
        case 'invoice':
          navigate(`/invoices?id=${referenceId}`);
          break;
        case 'project':
          navigate(`/projects/${referenceId}`);
          break;
        case 'task':
          navigate(`/projects?task=${referenceId}`);
          break;
        case 'client':
          navigate(`/sales?tab=clients&id=${referenceId}`);
          break;
        default:
          navigate('/notifications');
      }
    }
    handleDismiss();
  }, [onClick, referenceId, referenceType, navigate, handleDismiss]);

  const timeAgo = timestamp ? getTimeAgo(timestamp) : 'Just now';

  return (
    <div
      onClick={handleClick}
      className={`
        relative overflow-hidden
        w-full max-w-sm
        bg-gradient-to-r ${config.gradient}
        rounded-2xl
        shadow-2xl
        cursor-pointer
        transition-all duration-400 ease-out
        transform
        ${isVisible && !isLeaving 
          ? 'opacity-100 translate-x-0 scale-100' 
          : 'opacity-0 translate-x-8 scale-95'
        }
      `}
      style={{
        boxShadow: '0 20px 40px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset',
      }}
    >
      {/* Animated background glow */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          background: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.4) 0%, transparent 50%)',
        }}
      />
      
      {/* Content */}
      <div className="relative flex items-start gap-3 p-4">
        {/* Icon */}
        <div className={`flex-shrink-0 w-11 h-11 ${config.iconBg} rounded-xl flex items-center justify-center backdrop-blur-sm`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        
        {/* Text */}
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="font-semibold text-white text-sm leading-tight">{title}</p>
          <p className="text-white/85 text-sm mt-0.5 leading-snug">{message}</p>
          <p className="text-white/50 text-xs mt-1.5">{timeAgo}</p>
        </div>
        
        {/* Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>
      
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10">
        <div 
          className="h-full bg-white/40"
          style={{
            animation: 'shrink 6s linear forwards',
          }}
        />
      </div>
      
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ==================== Notification Container ====================

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  referenceId?: string;
  referenceType?: string;
  timestamp: Date;
}

interface NotificationContainerProps {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
}

export function NotificationContainer({ notifications, onDismiss }: NotificationContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-3 pointer-events-none"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {notifications.map((notification) => (
        <div key={notification.id} className="pointer-events-auto">
          <InAppNotification
            {...notification}
            onDismiss={onDismiss}
          />
        </div>
      ))}
    </div>
  );
}

export default InAppNotification;
