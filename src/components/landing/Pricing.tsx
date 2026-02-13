import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Users, Building2, Rocket, Loader2, Shield, CreditCard, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAppUrl } from '../../lib/domains';

interface Plan {
  id: string;
  name: string;
  stripe_price_id: string | null;
  amount: number;
  interval: string;
  limits: {
    projects: number;
    team_members: number;
    clients: number;
    invoices_per_month: number;
  };
  features: string[];
  is_active: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const getIconForPlan = (planName: string) => {
  if (planName.toLowerCase().includes('free')) return Rocket;
  if (planName.toLowerCase().includes('starter')) return Users;
  if (planName.toLowerCase().includes('professional')) return Building2;
  return Users;
};

const defaultFeatures: Record<string, string[]> = {
  free: [
    'Up to 5 projects',
    'Up to 10 clients',
    '15 invoices per month',
    '2 team members',
    'Time & expense tracking',
    'Email support',
  ],
  starter: [
    'Unlimited clients',
    'Unlimited invoices',
    'Up to 3 team members',
    'Time & expense tracking',
    'Plaid bank sync',
    'Payment processing',
    'Email support',
  ],
  professional: [
    'Unlimited projects',
    'Up to 50 team members',
    'Unlimited clients & invoices',
    'Advanced time & expense tracking',
    'Reports & analytics',
    'Proposals & estimates',
    'Plaid bank sync',
    'Stripe payment integration',
    'Custom branding',
    'Priority support',
  ],
};

export const Pricing = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    { q: 'How does the 14-day free trial work?', a: 'Start with full access to Professional features. Your card won\'t be charged until after the trial ends. Cancel anytime during the trial at no cost.' },
    { q: 'Can I switch between monthly and yearly billing?', a: 'Yes! You can upgrade to yearly billing anytime to save 20%. When switching, we\'ll prorate the remaining balance.' },
    { q: 'What payment methods do you accept?', a: 'We accept all major credit cards (Visa, Mastercard, American Express) via Stripe. Enterprise customers can pay via invoice.' },
    { q: 'Can I cancel my subscription anytime?', a: 'Yes, you can cancel anytime from your account settings. You\'ll retain access until the end of your billing period.' },
    { q: 'Is my payment information secure?', a: 'Absolutely. All payments are processed by Stripe with bank-level encryption. We never store your card details on our servers.' },
  ];

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    try {
      const { data, error: err } = await supabase
        .from('billdora_plans')
        .select('*')
        .eq('is_active', true)
        .order('amount', { ascending: true });

      if (err) throw err;
      setPlans(data || []);
    } catch (err: any) {
      console.error('Failed to load plans:', err);
      // Fallback to default tiers
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(plan: Plan) {
    if (plan.amount === 0) {
      // Free plan - redirect to signup
      window.location.href = getAppUrl('/login?signup=true');
      return;
    }

    if (!plan.stripe_price_id) {
      // Enterprise or custom plan - contact sales
      window.location.href = 'mailto:sales@billdora.com?subject=Enterprise%20Plan%20Inquiry';
      return;
    }

    setCheckoutLoading(plan.id);
    setError(null);

    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        // Not logged in - redirect to login with plan info
        window.location.href = getAppUrl(`/login?signup=true&plan=${plan.id}`);
        return;
      }

      // Call the stripe checkout edge function
      const response = await fetch(`${SUPABASE_URL}/functions/v1/stripe-subscription-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          price_id: plan.stripe_price_id,
          user_id: session.user.id,
          success_url: `${window.location.origin}/dashboard?subscription=success`,
          cancel_url: `${window.location.origin}/dashboard?subscription=canceled`,
        }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error.message || result.error);
      }

      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.message || 'Failed to start checkout');
    } finally {
      setCheckoutLoading(null);
    }
  }

  // Build tiers from database plans or fallback to defaults
  // Filter plans to only show the ones matching current billing cycle
  const filteredPlans = plans.filter((plan) => {
    const isMonthly = plan.interval === 'month';
    const isYearly = plan.interval === 'year';
    const isFree = plan.name.toLowerCase() === 'free' || plan.amount === 0;
    // Keep Free always, filter Starter/Professional by billing cycle
    if (isFree) return true;
    return billingCycle === 'monthly' ? isMonthly : isYearly;
  });

  const tiers = filteredPlans.length > 0 ? filteredPlans.map((plan) => {
    const planKey = plan.name.toLowerCase().split(' ')[0];
    const features = plan.features?.length > 0
      ? plan.features
      : defaultFeatures[planKey] || defaultFeatures.starter;

    const isProfessional = plan.name.toLowerCase().includes('professional');
    const isStarter = plan.name.toLowerCase().includes('starter');
    const isFree = plan.name.toLowerCase() === 'free' || plan.amount === 0;

    // Handle pricing based on billing cycle for Professional
    let displayPrice: string;
    let period = '/ month';
    let yearlyTotal: number | null = null;

    if (isFree) {
      displayPrice = 'Free';
      period = '';
    } else if (isStarter) {
      displayPrice = billingCycle === 'monthly' ? '$20' : '$17';
      yearlyTotal = 200;
    } else if (isProfessional) {
      displayPrice = billingCycle === 'monthly' ? '$60' : '$50';
      yearlyTotal = 600;
    } else {
      displayPrice = `$${plan.amount / 100}`;
    }

    return {
      id: plan.id,
      name: plan.name.replace(' Monthly', '').replace(' Yearly', ''),
      price: displayPrice,
      period,
      yearlyPrice: yearlyTotal,
      interval: plan.interval,
      description: isFree
        ? 'Get started with essential invoicing features.'
        : isStarter
          ? 'Perfect for freelancers and small teams.'
          : 'Ideal for growing businesses with expanding teams.',
      icon: getIconForPlan(plan.name),
      features,
      cta: isFree
        ? 'Get Started Free'
        : 'Start 14-Day Trial',
      highlighted: isStarter,
      plan,
    };
  }) : [
    {
      id: 'free',
      name: 'Free',
      price: 'Free',
      period: '',
      yearlyPrice: null,
      description: 'Get started with essential invoicing features.',
      icon: Rocket,
      features: defaultFeatures.free,
      cta: 'Get Started Free',
      highlighted: false,
      plan: null,
    },
    {
      id: 'starter',
      name: 'Starter',
      price: billingCycle === 'monthly' ? '$20' : '$17',
      period: '/ month',
      yearlyPrice: 200,
      description: 'Perfect for freelancers and small teams.',
      icon: Users,
      features: defaultFeatures.starter,
      cta: 'Start 14-Day Trial',
      highlighted: true,
      plan: null,
    },
    {
      id: 'professional',
      name: 'Professional',
      price: billingCycle === 'monthly' ? '$60' : '$50',
      period: '/ month',
      yearlyPrice: 600,
      description: 'Ideal for growing businesses with expanding teams.',
      icon: Building2,
      features: defaultFeatures.professional,
      cta: 'Start 14-Day Trial',
      highlighted: false,
      plan: null,
    },
  ];

  return (
    <section id="pricing" className="py-24" style={{ backgroundColor: '#F5F5F3' }}>
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold tracking-tight mb-6"
            style={{ color: '#474747' }}
          >
            Simple, Transparent Pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-xl leading-relaxed"
            style={{ color: '#6B6B6B' }}
          >
            Choose the plan that fits your business. No hidden fees.
          </motion.p>

          {/* Billing Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex items-center justify-center gap-3 mt-8"
          >
            <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-neutral-900' : 'text-neutral-500'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className="relative w-14 h-7 rounded-full transition-colors"
              style={{ backgroundColor: billingCycle === 'yearly' ? '#476E66' : '#D1D5DB' }}
            >
              <span
                className="absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform"
                style={{ left: billingCycle === 'yearly' ? '32px' : '4px' }}
              />
            </button>
            <span className={`text-sm font-medium ${billingCycle === 'yearly' ? 'text-neutral-900' : 'text-neutral-500'}`}>
              Yearly
            </span>
            {billingCycle === 'yearly' && (
              <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                Save 20%
              </span>
            )}
          </motion.div>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-8 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-center">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8 pt-4">
            {tiers.map((tier, index) => {
              const Icon = tier.icon;
              return (
                <motion.div
                  key={tier.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  className={`relative rounded-2xl p-8 ${tier.highlighted
                      ? 'bg-white shadow-xl border-2 mt-4'
                      : 'bg-white border border-gray-200'
                    }`}
                  style={tier.highlighted ? { borderColor: '#476E66' } : {}}
                >
                  {tier.highlighted && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex gap-2">
                      <span className="px-3 py-1 text-white text-sm font-semibold rounded-full" style={{ backgroundColor: '#476E66' }}>
                        Most Popular
                      </span>
                      <span className="px-3 py-1 bg-emerald-500 text-white text-sm font-semibold rounded-full flex items-center gap-1">
                        <Clock size={12} /> 14-Day Trial
                      </span>
                    </div>
                  )}

                  <div className="text-center mb-6">
                    <div
                      className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
                      style={{ backgroundColor: tier.highlighted ? '#476E66' : '#E8E8E6' }}
                    >
                      <Icon
                        size={24}
                        strokeWidth={1.5}
                        style={{ color: tier.highlighted ? '#fff' : '#474747' }}
                      />
                    </div>
                    <h3 className="text-xl font-bold mb-2" style={{ color: '#474747' }}>
                      {tier.name}
                    </h3>
                    <p className="text-sm" style={{ color: '#6B6B6B' }}>
                      {tier.description}
                    </p>
                  </div>

                  <div className="text-center mb-6">
                    <span className="text-4xl font-bold" style={{ color: '#474747' }}>
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className="text-lg" style={{ color: '#6B6B6B' }}>
                        {tier.period}
                      </span>
                    )}
                    {billingCycle === 'yearly' && tier.yearlyPrice && (
                      <p className="text-sm text-neutral-500 mt-1">
                        ${tier.yearlyPrice}/year billed annually (save 20%)
                      </p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check
                          className="w-5 h-5 flex-shrink-0 mt-0.5"
                          style={{ color: '#476E66' }}
                        />
                        <span className="text-sm" style={{ color: '#474747' }}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => tier.plan ? handleCheckout(tier.plan) : (tier.name === 'Enterprise' ? window.location.href = 'mailto:sales@billdora.com' : window.location.href = getAppUrl('/login?signup=true'))}
                    disabled={checkoutLoading === tier.id}
                    className={`w-full py-3 px-6 rounded-lg font-semibold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 ${tier.highlighted ? 'text-white' : ''
                      }`}
                    style={
                      tier.highlighted
                        ? { backgroundColor: '#476E66', color: '#fff' }
                        : { backgroundColor: '#E8E8E6', color: '#474747' }
                    }
                  >
                    {checkoutLoading === tier.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      tier.cta
                    )}
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-wrap justify-center gap-8 mt-16 pt-8 border-t border-neutral-200"
        >
          <div className="flex items-center gap-2 text-neutral-600">
            <Shield className="w-5 h-5" style={{ color: '#476E66' }} />
            <span className="text-sm font-medium">256-bit SSL Encryption</span>
          </div>
          <div className="flex items-center gap-2 text-neutral-600">
            <CreditCard className="w-5 h-5" style={{ color: '#476E66' }} />
            <span className="text-sm font-medium">Secure Payments via Stripe</span>
          </div>
          <div className="flex items-center gap-2 text-neutral-600">
            <Clock className="w-5 h-5" style={{ color: '#476E66' }} />
            <span className="text-sm font-medium">Cancel Anytime</span>
          </div>
          <div className="flex items-center gap-2 text-neutral-600">
            <Check className="w-5 h-5" style={{ color: '#476E66' }} />
            <span className="text-sm font-medium">30-Day Money Back Guarantee</span>
          </div>
        </motion.div>

        {/* FAQ Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto mt-20"
        >
          <h3 className="text-2xl font-bold text-center mb-8" style={{ color: '#474747' }}>
            Frequently Asked Questions
          </h3>
          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-neutral-50 transition-colors"
                >
                  <span className="font-medium text-neutral-900">{faq.q}</span>
                  {openFaq === idx ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
                </button>
                {openFaq === idx && (
                  <div className="px-4 pb-4 text-neutral-600 text-sm">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};
