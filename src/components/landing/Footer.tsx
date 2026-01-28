import React from 'react';

export const Footer = () => {
  return (
    <footer className="bg-white py-16 border-t border-swiss-gray-border">
      <div className="container mx-auto px-6 max-w-[1200px]">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-1">
            <a href="#" className="flex items-center gap-2 mb-6">
              <img src="/billdora-logo.png" alt="Billdora" className="h-8" />
            </a>
            <p className="text-swiss-gray-medium text-sm leading-relaxed">
              The operating system for modern professional service firms.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold uppercase tracking-wider text-sm mb-6 text-swiss-black">Product</h4>
            <ul className="space-y-4 text-sm text-swiss-charcoal">
              <li><a href="#" className="hover:text-swiss-red-DEFAULT transition-colors">Features</a></li>
              <li><a href="#" className="hover:text-swiss-red-DEFAULT transition-colors">Pricing</a></li>
              <li><a href="#" className="hover:text-swiss-red-DEFAULT transition-colors">Security</a></li>
              <li><a href="#" className="hover:text-swiss-red-DEFAULT transition-colors">Changelog</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold uppercase tracking-wider text-sm mb-6 text-swiss-black">Company</h4>
            <ul className="space-y-4 text-sm text-swiss-charcoal">
              <li><a href="#" className="hover:text-swiss-red-DEFAULT transition-colors">About</a></li>
              <li><a href="#" className="hover:text-swiss-red-DEFAULT transition-colors">Careers</a></li>
              <li><a href="/terms" className="hover:text-swiss-red-DEFAULT transition-colors">Terms</a></li>
              <li><a href="/privacy" className="hover:text-swiss-red-DEFAULT transition-colors">Privacy</a></li>
              <li><a href="#" className="hover:text-swiss-red-DEFAULT transition-colors">Contact</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold uppercase tracking-wider text-sm mb-6 text-swiss-black">Connect</h4>
            <ul className="space-y-4 text-sm text-swiss-charcoal">
              <li><a href="#" className="hover:text-swiss-red-DEFAULT transition-colors">Twitter</a></li>
              <li><a href="#" className="hover:text-swiss-red-DEFAULT transition-colors">LinkedIn</a></li>
              <li><a href="#" className="hover:text-swiss-red-DEFAULT transition-colors">GitHub</a></li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-swiss-gray-border flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-swiss-gray-light">
          <p>&copy; {new Date().getFullYear()} Billdora Inc. All rights reserved.</p>
          <div className="flex gap-8">
            <a href="/privacy" className="hover:text-swiss-black transition-colors">Privacy Policy</a>
            <a href="/terms" className="hover:text-swiss-black transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
