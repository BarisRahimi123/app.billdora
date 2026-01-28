import { useState } from 'react';
import { X, Building2, Users, FileText, Clock, CheckCircle, ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  tip: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Set Up Your Company',
    description: 'Add your company logo, address, and contact info. This appears on all invoices and proposals.',
    icon: <Building2 className="w-6 h-6" />,
    tip: 'Go to Settings > Company Profile',
  },
  {
    title: 'Add Your Team',
    description: 'Invite team members and assign roles. Control who can view financials, approve time, and manage clients.',
    icon: <Users className="w-6 h-6" />,
    tip: 'Go to Settings > Users & Roles',
  },
  {
    title: 'Create Your First Client',
    description: 'Add a client to start tracking projects, sending invoices, and managing proposals.',
    icon: <FileText className="w-6 h-6" />,
    tip: 'Go to Sales > Clients > Add Client',
  },
  {
    title: 'Track Time & Expenses',
    description: 'Log billable hours and expenses. They flow directly into invoices with one click.',
    icon: <Clock className="w-6 h-6" />,
    tip: 'Go to Time & Expense > Log Time',
  },
];

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  userId?: string;
  onDismissed?: () => void;
}

export default function OnboardingModal({ isOpen, onClose, userName, userId, onDismissed }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const savePreference = async (dismissed: boolean) => {
    // Save to localStorage as fallback
    localStorage.setItem('onboarding_completed', 'true');
    if (dismissed) {
      localStorage.setItem('onboarding_never_show', 'true');
    }
    
    // Save to database for persistence across sessions
    if (userId && dismissed) {
      try {
        await supabase
          .from('profiles')
          .update({ onboarding_dismissed: true })
          .eq('id', userId);
        onDismissed?.();
      } catch (err) {
        console.error('Failed to save onboarding preference:', err);
      }
    }
  };

  const handleNext = () => {
    setCompletedSteps(prev => new Set([...prev, currentStep]));
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    await savePreference(dontShowAgain);
    onClose();
  };

  const handleSkip = async () => {
    await savePreference(dontShowAgain);
    onClose();
  };

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#476E66] to-[#5A8A80] px-6 py-8 text-white">
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium opacity-90">Welcome to Billdora</span>
          </div>
          <h2 className="text-2xl font-bold">
            {userName ? `Hey ${userName}! Let's get started` : "Let's get you set up"}
          </h2>
          <p className="text-sm opacity-80 mt-1">
            Quick tour to help you hit the ground running
          </p>
        </div>

        {/* Progress Dots */}
        <div className="flex justify-center gap-2 py-4 bg-neutral-50">
          {ONBOARDING_STEPS.map((_, idx) => (
            <div
              key={idx}
              className={`w-2 h-2 rounded-full transition-all ${
                idx === currentStep
                  ? 'w-6 bg-[#476E66]'
                  : completedSteps.has(idx)
                  ? 'bg-[#476E66]'
                  : 'bg-neutral-300'
              }`}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="px-6 py-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-[#476E66]/10 rounded-xl flex items-center justify-center text-[#476E66]">
              {step.icon}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-neutral-900 mb-1">
                {step.title}
              </h3>
              <p className="text-sm text-neutral-600 mb-3">
                {step.description}
              </p>
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-800">
                  <span className="font-medium">Tip:</span> {step.tip}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100">
          {/* Don't show again checkbox - visible and clear */}
          <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-300 text-[#476E66] focus:ring-[#476E66] cursor-pointer"
            />
            <span className="text-sm text-neutral-600">Don't show this again</span>
          </label>
          
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-5 py-2 bg-[#476E66] text-white text-sm font-medium rounded-lg hover:bg-[#3A5B54] transition-colors"
              >
                {isLastStep ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Get Started
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
