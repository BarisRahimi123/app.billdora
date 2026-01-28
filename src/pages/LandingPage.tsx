import React from 'react';
import { Navbar } from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import { Features } from '../components/landing/Features';
import { Workflow } from '../components/landing/Workflow';
import { SocialProof } from '../components/landing/SocialProof';
import { Pricing } from '../components/landing/Pricing';
import { CTA } from '../components/landing/CTA';
import { Footer } from '../components/landing/Footer';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-white font-sans text-swiss-black selection:bg-swiss-red-DEFAULT selection:text-white">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Workflow />
        <SocialProof />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;
