import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Briefcase, Receipt, BarChart3, Users, Shield, FileCheck } from 'lucide-react';

const features = [
  {
    title: 'Precision Time Tracking',
    description: 'Capture every billable minute. Teams report 40% fewer missed hours with our streamlined timesheet interface.',
    icon: Clock,
  },
  {
    title: 'Project Management',
    description: 'Keep projects on track. Real-time budget tracking helps teams stay within budget 95% of the time.',
    icon: Briefcase,
  },
  {
    title: 'Automated Billing',
    description: 'Turn tracked time into invoices in seconds—not hours. Support for T&M, Fixed Fee, and Retainers.',
    icon: FileCheck,
    isHighlighted: true,
  },
  {
    title: 'Real-time Analytics',
    description: 'See profitability, utilization, and project health at a glance. Make data-driven decisions instantly.',
    icon: BarChart3,
  },
  {
    title: 'Team Collaboration',
    description: 'Role-based access and approval workflows keep everyone aligned without the back-and-forth.',
    icon: Users,
  },
  {
    title: 'Secure & Reliable',
    description: 'Enterprise-grade security with encrypted data, automatic backups, and 99.9% uptime guarantee.',
    icon: Shield,
  },
];

export const Features = () => {
  return (
    <section id="features" className="py-24 bg-gray-50 border-y border-gray-200">
      <div className="container mx-auto px-6 max-w-[1200px]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mb-16 md:w-2/3"
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 text-swiss-black">
            Engineered for Efficiency.
          </h2>
          <p className="text-xl leading-relaxed text-swiss-charcoal">
            Everything you need to run a profitable professional services firm, integrated into one cohesive system.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const isHighlighted = feature.isHighlighted;
            
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className={`bg-white p-8 border transition-all duration-300 group hover:shadow-md ${
                  isHighlighted 
                    ? 'border-green-600' 
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                {/* Icon - Line Work Style */}
                <div
                  className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 border-2 ${
                    isHighlighted 
                      ? 'border-green-600' 
                      : 'border-gray-300 group-hover:border-gray-500'
                  }`}
                >
                  <feature.icon 
                    className={`w-7 h-7 ${
                      isHighlighted 
                        ? 'text-green-600' 
                        : 'text-gray-600 group-hover:text-gray-800'
                    }`}
                    strokeWidth={1.5} 
                  />
                </div>
                
                {/* Content */}
                <h3 className={`text-xl font-bold mb-3 transition-colors ${
                  isHighlighted 
                    ? 'text-green-600' 
                    : 'text-gray-900'
                }`}>
                  {feature.title}
                </h3>
                <p className="text-base leading-relaxed text-gray-600">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
