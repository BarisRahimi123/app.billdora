import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle, FileText, Briefcase, Clock, Receipt, FileCheck } from 'lucide-react';
import { getAppUrl } from '../../lib/domains';

export const CTA = () => {
  const benefits = [
    'No credit card required',
    '14-day free trial',
    'Cancel anytime',
  ];

  const workflowIcons = [
    { icon: FileText, label: 'Proposal' },
    { icon: Briefcase, label: 'Project' },
    { icon: Clock, label: 'Time' },
    { icon: Receipt, label: 'Expense' },
    { icon: FileCheck, label: 'Invoice', isHighlighted: true },
  ];

  return (
    <section className="py-24 bg-gray-50 border-t border-gray-200 overflow-hidden">
      <div className="container mx-auto px-6 max-w-[1200px]">
        <div className="grid grid-cols-12 gap-8 items-center">
          {/* Left - Minimal Line Work Diagram */}
          <motion.div 
            className="col-span-12 lg:col-span-5 hidden lg:block"
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="relative bg-white rounded-2xl p-8 border border-gray-200">
              {/* Circular workflow - Line Work Style */}
              <div className="relative w-64 h-64 mx-auto">
                {/* Center text */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-3xl font-bold text-gray-800">5</span>
                    <p className="text-xs text-gray-500 mt-1">Steps</p>
                  </div>
                </div>

                {/* Orbiting icons - Line Work */}
                {workflowIcons.map((item, index) => {
                  const angle = (index * 72 - 90) * (Math.PI / 180);
                  const radius = 95;
                  const x = Math.cos(angle) * radius;
                  const y = Math.sin(angle) * radius;

                  return (
                    <motion.div
                      key={index}
                      className={`absolute w-12 h-12 rounded-lg flex items-center justify-center bg-white border-2 ${
                        item.isHighlighted ? 'border-green-600' : 'border-gray-400'
                      }`}
                      style={{
                        left: `calc(50% + ${x}px - 24px)`,
                        top: `calc(50% + ${y}px - 24px)`,
                      }}
                      initial={{ opacity: 0, scale: 0 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + index * 0.1 }}
                      whileHover={{ scale: 1.1 }}
                    >
                      <item.icon 
                        className={`w-5 h-5 ${item.isHighlighted ? 'text-green-600' : 'text-gray-600'}`} 
                        strokeWidth={1.5} 
                      />
                    </motion.div>
                  );
                })}

                {/* Connecting ring - charcoal */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 256 256">
                  <motion.circle
                    cx="128"
                    cy="128"
                    r="95"
                    fill="none"
                    stroke="#9CA3AF"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                  />
                </svg>
              </div>

              <p className="text-center text-sm text-gray-500 mt-4">Complete Workflow</p>
            </div>
          </motion.div>

          {/* Right - Content */}
          <div className="col-span-12 lg:col-span-7 lg:pl-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <h2 className="text-4xl md:text-5xl font-bold tracking-tighter mb-6 text-swiss-black">
                Ready to Professionalize Your Operations?
              </h2>
              <p className="text-xl text-swiss-charcoal mb-8">
                Join thousands of firms that have transformed their workflow with Billdora.
              </p>

              {/* Benefits List */}
              <div className="flex flex-wrap gap-6 mb-10">
                {benefits.map((benefit) => (
                  <div key={benefit} className="flex items-center gap-2 text-gray-600">
                    <CheckCircle className="w-5 h-5 text-green-600" strokeWidth={1.5} />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-4">
                <a 
                  href={getAppUrl('/login?signup=true')} 
                  className="w-full sm:w-auto h-16 px-12 text-white text-lg font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors duration-200 hover:opacity-90"
                  style={{ backgroundColor: '#476E66' }}
                >
                  Get Started Now <ArrowRight size={20} />
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
