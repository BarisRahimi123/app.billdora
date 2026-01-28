import { motion } from 'framer-motion';
import Lottie from 'lottie-react';
import { useEffect, useState } from 'react';
import { FileText, FolderKanban, Clock, Receipt, FileCheck } from 'lucide-react';
import { getAppUrl } from '../../lib/domains';

const workflowSteps = [
  { icon: FileText, label: 'Proposal', accent: false },
  { icon: FolderKanban, label: 'Project', accent: false },
  { icon: Clock, label: 'Time', accent: false },
  { icon: Receipt, label: 'Expense', accent: false },
  { icon: FileCheck, label: 'Invoice', accent: true },
];

const floatAnimation = {
  y: [0, -6, 0],
  transition: {
    duration: 2.5,
    repeat: Infinity,
    ease: 'easeInOut',
  },
};

export default function Hero() {
  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    fetch('/hero-animation.json')
      .then(res => res.json())
      .then(data => setAnimationData(data))
      .catch(err => console.error('Failed to load animation:', err));
  }, []);

  return (
    <section className="pt-28 md:pt-36 pb-12 md:pb-20 px-4" style={{ backgroundColor: '#F5F5F3' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 md:gap-12">
          {/* Left side - Text content */}
          <div className="flex-1 text-center md:text-left">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 md:mb-6 leading-tight"
              style={{ color: '#474747' }}
            >
              Proposal to Invoice
              <br />
              in Minutes, Not Days
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base md:text-xl mb-6 md:mb-8 max-w-lg"
              style={{ color: '#6B6B6B' }}
            >
              Save 10+ hours weekly on billing. Track time, manage projects, and get paid faster—all in one platform.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <a
                href={getAppUrl('/login?signup=true')}
                className="inline-block px-6 md:px-8 py-3 md:py-4 text-white font-semibold rounded-lg transition-all hover:opacity-90 hover:scale-105"
                style={{ backgroundColor: '#476E66' }}
              >
                Start Free Trial
              </a>
            </motion.div>
          </div>

          {/* Right side - Lottie Animation */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex-1 w-full max-w-md md:max-w-lg lg:max-w-xl"
          >
            {animationData ? (
              <Lottie 
                animationData={animationData} 
                loop={true}
                className="w-full h-auto"
              />
            ) : (
              <div className="w-full aspect-video bg-neutral-200 rounded-xl animate-pulse" />
            )}
          </motion.div>
        </div>

        {/* Workflow visualization */}
        <div className="relative mt-16 md:mt-24">
          {/* Animated connecting path */}
          <svg
            className="absolute top-1/2 left-0 w-full h-4 -translate-y-1/2 overflow-visible hidden md:block"
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M 100 50 Q 300 20, 500 50 T 900 50"
              fill="none"
              stroke="#C4C4C4"
              strokeWidth="2"
              strokeDasharray="8 4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, ease: 'easeInOut' }}
            />
          </svg>

          {/* Workflow icons */}
          <div className="relative flex justify-between items-center max-w-4xl mx-auto gap-2 md:gap-4 overflow-x-auto pb-4 md:pb-0 px-2">
            {workflowSteps.map((step, index) => {
              const Icon = step.icon;
              const color = step.accent ? '#476E66' : '#474747';
              return (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.15 }}
                  className="flex flex-col items-center flex-shrink-0"
                >
                  <motion.div
                    animate={floatAnimation}
                    transition={{ ...floatAnimation.transition, delay: index * 0.2 }}
                  >
                    <Icon
                      className="w-8 h-8 md:w-10 md:h-10"
                      strokeWidth={1.5}
                      style={{ color }}
                    />
                  </motion.div>
                  <span
                    className="mt-2 md:mt-3 text-xs md:text-sm font-medium whitespace-nowrap"
                    style={{ color }}
                  >
                    {step.label}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
