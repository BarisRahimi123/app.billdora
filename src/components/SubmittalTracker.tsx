import { useMemo } from 'react';
import { SubmittalStatus } from '../lib/api';
import { Check, Clock, AlertCircle, X, Send, FileText, CheckCircle2 } from 'lucide-react';

interface SubmittalTrackerProps {
    status: SubmittalStatus;
    submittedDate?: string;
    expectedResponseDate?: string;
    receivedDate?: string;
    agencyName?: string;
}

export function SubmittalTracker({ status, submittedDate, expectedResponseDate, receivedDate }: SubmittalTrackerProps) {

    // Logic to determine state of each step
    const state = useMemo(() => {
        let progressIndex = -1; // 0=Submitted done, 1=Expected done, etc.
        let activeIndex = 0;    // Which node is currently "in progress"
        let outcomeStatus: 'pending' | 'success' | 'error' | 'warning' = 'pending';
        let outcomeLabel = 'Outcome';

        switch (status) {
            case 'not_submitted':
                progressIndex = -1;
                activeIndex = 0; // Waiting to submit
                break;
            case 'submitted':
                progressIndex = 0; // Submitted is done
                activeIndex = 1;   // Waiting for Expected/Response
                break;
            case 'resubmitted':
                progressIndex = 0;
                activeIndex = 1;
                break;
            case 'under_review':
                progressIndex = 1; // Expected/Review technically "done" or in progress? 
                // Let's say we are waiting for Receive.
                activeIndex = 2;
                break;
            case 'approved':
                progressIndex = 3; // All done
                activeIndex = 3;   // Final check
                outcomeStatus = 'success';
                outcomeLabel = 'Approved';
                break;
            case 'rejected':
                progressIndex = 3;
                activeIndex = 3;
                outcomeStatus = 'error';
                outcomeLabel = 'Rejected';
                break;
            case 'revisions_required':
                progressIndex = 3;
                activeIndex = 3;
                outcomeStatus = 'warning';
                outcomeLabel = 'Revisions';
                break;
            case 'not_applicable':
                progressIndex = 3;
                activeIndex = -1;
                outcomeLabel = 'N/A';
                break;
        }

        return { progressIndex, activeIndex, outcomeStatus, outcomeLabel };
    }, [status]);

    // Step definitions
    const stepConfig = [
        { label: 'Submitted', icon: Send, date: submittedDate ? new Date(submittedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null },
        { label: 'Expected', icon: Clock, date: expectedResponseDate ? new Date(expectedResponseDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null },
        { label: 'Received', icon: FileText, date: receivedDate ? new Date(receivedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null },
        {
            label: state.outcomeLabel,
            icon: state.outcomeStatus === 'success' ? Check : state.outcomeStatus === 'error' ? X : state.outcomeStatus === 'warning' ? AlertCircle : CheckCircle2,
            date: null // Outcome usually happens on 'Received' date
        }
    ];

    return (
        <div className="w-full py-4 px-4 overflow-x-auto">
            <div className="relative min-w-[300px]">

                {/* The Track (Background Line) */}
                <div className="absolute top-[14px] left-[40px] right-[40px] h-[2px] bg-neutral-100 rounded-full overflow-hidden z-0">
                    {/* Progress Bar */}
                    <div
                        className={`h-full transition-all duration-700 ease-out ${state.outcomeStatus === 'error' ? 'bg-red-500' :
                                state.outcomeStatus === 'warning' ? 'bg-amber-500' : 'bg-[#476E66]'
                            }`}
                        style={{ width: `${Math.max(0, Math.min(100, (state.progressIndex / 3) * 100))}%` }}
                    />
                </div>

                {/* Steps */}
                <div className="relative z-10 flex justify-between w-full">
                    {stepConfig.map((step, index) => {
                        const isCompleted = index <= state.progressIndex;
                        const isActive = index === state.activeIndex;
                        const isFuture = index > state.progressIndex && !isActive;

                        // Determination of styling
                        let circleClass = "bg-white border-2 border-neutral-100 text-neutral-300";
                        let iconClass = "w-3.5 h-3.5";

                        if (isCompleted) {
                            circleClass = "bg-[#476E66] border-[#476E66] text-white";
                            if (index === 3) {
                                if (state.outcomeStatus === 'error') circleClass = "bg-red-500 border-red-500 text-white";
                                if (state.outcomeStatus === 'warning') circleClass = "bg-amber-500 border-amber-500 text-white";
                            }
                        } else if (isActive) {
                            circleClass = "bg-white border-2 border-[#476E66] text-[#476E66] ring-4 ring-[#476E66]/10 scale-110";
                        }

                        // Icon Logic: Check mark for completed intermediate steps
                        let Icon = step.icon;
                        if (isCompleted && index < 3) Icon = Check;

                        return (
                            <div key={index} className="flex flex-col items-center group cursor-default w-24">
                                {/* Circle Node */}
                                <div
                                    className={`
                                        w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 z-10
                                        ${circleClass}
                                    `}
                                >
                                    <Icon className={iconClass} />
                                </div>

                                {/* Labels */}
                                <div className="mt-2.5 text-center">
                                    <p className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${isCompleted || isActive ? 'text-neutral-900' : 'text-neutral-300'
                                        }`}>
                                        {step.label}
                                    </p>
                                    {step.date ? (
                                        <p className={`text-[10px] font-medium mt-0.5 whitespace-nowrap ${isCompleted || isActive ? 'text-neutral-500' : 'text-neutral-300'
                                            }`}>
                                            {step.date}
                                        </p>
                                    ) : (
                                        <div className="h-[15px] w-1" /> // Spacer for alignment
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
