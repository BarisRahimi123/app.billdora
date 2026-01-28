import React from 'react';
import { motion } from 'framer-motion';

const stats = [
  { value: '10,000+', label: 'Businesses' },
  { value: '2M+', label: 'Invoices Sent' },
  { value: '$500M+', label: 'Payments Processed' },
  { value: '99.9%', label: 'Uptime' },
];

export const SocialProof = () => {
  return (
    <section id="testimonials" className="py-24 bg-swiss-surface border-y border-swiss-gray-border">
      <div className="container mx-auto px-6 max-w-[1200px]">
        <div className="text-center mb-16">
          <p className="text-sm font-bold uppercase tracking-widest text-swiss-gray-medium mb-8">
            Trusted by growing businesses worldwide
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center max-w-3xl mx-auto">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-swiss-black">{stat.value}</div>
                <div className="text-sm text-swiss-gray-medium mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="bg-white p-12 md:p-16 border border-swiss-gray-border max-w-4xl mx-auto text-center"
        >
          <blockquote className="text-3xl md:text-4xl font-medium leading-tight text-swiss-black mb-8">
            "We cut our invoicing time by 85%. What used to take two weeks now takes two hours. Billdora is the backbone of our operations."
          </blockquote>
          <cite className="not-italic">
            <div className="text-xl font-bold text-swiss-black">Sarah Chen</div>
            <div className="text-swiss-gray-medium">Founder, Apex Consulting</div>
          </cite>
        </motion.div>
      </div>
    </section>
  );
};
