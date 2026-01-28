import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Briefcase, Clock, Receipt, FileCheck } from 'lucide-react';

const stages = [
  {
    id: 'proposal',
    title: 'Proposal',
    description: 'Create professional quotes and proposals for your clients',
    icon: FileText,
  },
  {
    id: 'project',
    title: 'Project',
    description: 'Convert approved proposals into active projects',
    icon: Briefcase,
  },
  {
    id: 'time',
    title: 'Time Entry',
    description: 'Track billable hours with precision timesheets',
    icon: Clock,
  },
  {
    id: 'expense',
    title: 'Expense',
    description: 'Capture project expenses and receipts',
    icon: Receipt,
  },
  {
    id: 'invoice',
    title: 'Invoice',
    description: 'Generate and send professional invoices',
    icon: FileCheck,
    isHighlighted: true,
  },
];

export const Workflow = () => {
  const [activeStage, setActiveStage] = useState(4); // Invoice highlighted by default

  return (
    <section id="workflow" className="py-24 bg-white overflow-hidden">
      <div className="container mx-auto px-6 max-w-[1200px]">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 text-swiss-black">
            From Proposal to Payment
          </h2>
          <p className="text-xl leading-relaxed text-swiss-charcoal max-w-2xl mx-auto">
            A streamlined workflow that ensures nothing slips through the cracks
          </p>
        </motion.div>

        {/* Desktop Timeline - Minimal Line Work */}
        <div className="hidden md:block">
          {/* Connection Line - charcoal */}
          <div className="relative mx-16 mb-8">
            <div className="absolute top-16 left-0 right-0 h-px bg-gray-300" />
            <motion.div 
              className="absolute top-16 left-0 h-px bg-gray-700"
              initial={{ width: '0%' }}
              whileInView={{ width: '100%' }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          </div>

          {/* Stage Icons - Line Work Style */}
          <div className="flex justify-between items-start relative">
            {stages.map((stage, index) => {
              const isHighlighted = stage.isHighlighted;
              const isActive = activeStage === index;
              
              return (
                <motion.div
                  key={stage.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className="flex flex-col items-center text-center w-1/5 cursor-pointer group"
                  onMouseEnter={() => setActiveStage(index)}
                >
                  {/* Icon Circle - Line Work */}
                  <motion.div
                    className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center bg-white border-2 transition-all duration-300 ${
                      isHighlighted 
                        ? 'border-green-600' 
                        : isActive 
                          ? 'border-gray-900' 
                          : 'border-gray-300 group-hover:border-gray-500'
                    }`}
                    whileHover={{ scale: 1.05 }}
                  >
                    <stage.icon 
                      className={`w-12 h-12 transition-colors duration-300 ${
                        isHighlighted 
                          ? 'text-green-600' 
                          : isActive 
                            ? 'text-gray-900' 
                            : 'text-gray-400 group-hover:text-gray-600'
                      }`}
                      strokeWidth={1.5}
                    />
                  </motion.div>

                  {/* Stage Number */}
                  <span 
                    className={`text-sm font-medium mt-4 mb-2 transition-colors duration-300 ${
                      isHighlighted 
                        ? 'text-green-600' 
                        : isActive 
                          ? 'text-gray-900' 
                          : 'text-gray-400'
                    }`}
                  >
                    0{index + 1}
                  </span>

                  {/* Title */}
                  <h3 
                    className={`text-lg font-bold mb-2 transition-colors duration-300 ${
                      isHighlighted 
                        ? 'text-green-600' 
                        : isActive 
                          ? 'text-gray-900' 
                          : 'text-gray-600'
                    }`}
                  >
                    {stage.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-gray-500 leading-relaxed px-2 max-w-[160px]">
                    {stage.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Mobile Timeline - Line Work Style */}
        <div className="md:hidden space-y-6">
          {stages.map((stage, index) => {
            const isHighlighted = stage.isHighlighted;
            
            return (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="flex items-start gap-4"
              >
                {/* Left line and icon */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center border-2 bg-white ${
                      isHighlighted ? 'border-green-600' : 'border-gray-700'
                    }`}
                  >
                    <stage.icon 
                      className={`w-6 h-6 ${isHighlighted ? 'text-green-600' : 'text-gray-700'}`} 
                      strokeWidth={1.5} 
                    />
                  </div>
                  {index < stages.length - 1 && (
                    <div className="w-px h-12 bg-gray-300 mt-2" />
                  )}
                </div>

                {/* Content */}
                <div className="pt-2">
                  <span className={`text-sm font-medium ${isHighlighted ? 'text-green-600' : 'text-gray-500'}`}>
                    0{index + 1}
                  </span>
                  <h3 className={`text-xl font-bold mb-1 ${isHighlighted ? 'text-green-600' : 'text-gray-900'}`}>
                    {stage.title}
                  </h3>
                  <p className="text-gray-500">{stage.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
