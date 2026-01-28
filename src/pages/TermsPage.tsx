import { Link } from 'react-router-dom';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 py-4">
        <div className="container mx-auto px-6 max-w-4xl">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#476E66] flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="text-xl font-bold text-neutral-900">Billdora</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-6 max-w-4xl py-12">
        <p className="text-sm text-gray-500 mb-2">Last updated: January 7, 2026</p>
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Terms of Service</h1>

        {/* Table of Contents */}
        <nav className="bg-gray-50 rounded-lg p-6 mb-10">
          <h2 className="font-bold text-gray-900 mb-4">Table of Contents</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-[#476E66]">
            <li><a href="#acceptance" className="hover:underline">Acceptance of Terms</a></li>
            <li><a href="#description" className="hover:underline">Description of Service</a></li>
            <li><a href="#accounts" className="hover:underline">User Accounts and Responsibilities</a></li>
            <li><a href="#subscription" className="hover:underline">Subscription and Payment Terms</a></li>
            <li><a href="#usage-limits" className="hover:underline">Service Limits and Fair Use Policy</a></li>
            <li><a href="#acceptable-use" className="hover:underline">Acceptable Use Policy</a></li>
            <li><a href="#ip" className="hover:underline">Intellectual Property Rights</a></li>
            <li><a href="#user-content" className="hover:underline">User Content and Data Ownership</a></li>
            <li><a href="#liability" className="hover:underline">Limitation of Liability</a></li>
            <li><a href="#disclaimer" className="hover:underline">Disclaimer of Warranties</a></li>
            <li><a href="#indemnification" className="hover:underline">Indemnification</a></li>
            <li><a href="#termination" className="hover:underline">Termination</a></li>
            <li><a href="#governing-law" className="hover:underline">Governing Law</a></li>
            <li><a href="#disputes" className="hover:underline">Dispute Resolution</a></li>
            <li><a href="#changes" className="hover:underline">Changes to Terms</a></li>
            <li><a href="#contact" className="hover:underline">Contact Information</a></li>
          </ol>
        </nav>

        <div className="prose prose-gray max-w-none space-y-8">
          <section id="acceptance">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              By accessing or using Billdora's services, website, or applications (collectively, the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use the Service. These Terms constitute a legally binding agreement between you and Billdora ("Company," "we," "us," or "our").
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              By creating an account, you represent that you are at least 18 years of age and have the legal capacity to enter into these Terms. If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.
            </p>
          </section>

          <section id="description">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Description of Service</h2>
            <p className="text-gray-600 leading-relaxed">
              Billdora provides a cloud-based software-as-a-service (SaaS) platform designed for professional service firms. Our Service includes, but is not limited to:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li>Invoicing and billing management</li>
              <li>Time tracking and expense management</li>
              <li>Project management and collaboration tools</li>
              <li>Client relationship management</li>
              <li>Financial reporting and analytics</li>
              <li>Team resource allocation and planning</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time, with or without notice.
            </p>
          </section>

          <section id="accounts">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. User Accounts and Responsibilities</h2>
            <p className="text-gray-600 leading-relaxed">
              To access certain features of the Service, you must create an account. You agree to:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain and promptly update your account information</li>
              <li>Keep your password secure and confidential</li>
              <li>Notify us immediately of any unauthorized access to your account</li>
              <li>Accept responsibility for all activities that occur under your account</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              You may not share your account credentials with third parties or allow others to access your account. We reserve the right to suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section id="subscription">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Subscription and Payment Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              <strong>Free Tier:</strong> We offer a free Starter plan with limited features and usage caps. This tier is provided as-is and may be modified or discontinued at our discretion.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              <strong>Paid Plans:</strong> Paid subscriptions are billed on a monthly or annual basis, depending on your selected billing cycle. Subscription fees are charged in advance and are non-refundable except as required by law.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              <strong>Billing:</strong> By subscribing to a paid plan, you authorize us to charge your designated payment method for all fees associated with your subscription. All payments are processed securely through Stripe, our third-party payment processor.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              <strong>Renewals:</strong> Subscriptions automatically renew at the end of each billing period unless you cancel before the renewal date. You may cancel your subscription at any time through your account settings.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              <strong>Price Changes:</strong> We reserve the right to change subscription prices. We will provide at least 30 days' notice before any price increase takes effect.
            </p>
          </section>

          <section id="usage-limits">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Service Limits and Fair Use Policy</h2>
            <p className="text-gray-600 leading-relaxed">
              To ensure optimal service quality for all users and prevent abuse, all accounts are subject to the following usage limits and fair use policies, regardless of subscription tier:
            </p>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.1 Standard Usage Limits</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              The following limits apply per billing cycle (monthly) unless otherwise specified:
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-gray-700 font-semibold">Resource</th>
                    <th className="text-right py-2 text-gray-700 font-semibold">Free Tier</th>
                    <th className="text-right py-2 text-gray-700 font-semibold">Pro Plan</th>
                    <th className="text-right py-2 text-gray-700 font-semibold">Unlimited Plan</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr className="border-b border-gray-100">
                    <td className="py-2">Invoices Created</td>
                    <td className="text-right">25/month</td>
                    <td className="text-right">500/month</td>
                    <td className="text-right">2,500/month*</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2">Email Notifications Sent</td>
                    <td className="text-right">50/month</td>
                    <td className="text-right">1,000/month</td>
                    <td className="text-right">5,000/month*</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2">Payment Reminders</td>
                    <td className="text-right">10/month</td>
                    <td className="text-right">250/month</td>
                    <td className="text-right">1,000/month*</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2">API Requests</td>
                    <td className="text-right">1,000/day</td>
                    <td className="text-right">10,000/day</td>
                    <td className="text-right">50,000/day*</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2">File Storage</td>
                    <td className="text-right">500 MB</td>
                    <td className="text-right">10 GB</td>
                    <td className="text-right">50 GB*</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2">Active Projects</td>
                    <td className="text-right">5</td>
                    <td className="text-right">100</td>
                    <td className="text-right">500*</td>
                  </tr>
                  <tr>
                    <td className="py-2">Team Members</td>
                    <td className="text-right">2</td>
                    <td className="text-right">25</td>
                    <td className="text-right">100*</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-gray-500 mt-3">* Unlimited Plan limits represent fair use thresholds. See Section 5.2 for details.</p>
            </div>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.2 Fair Use Policy for Unlimited Plans</h3>
            <p className="text-gray-600 leading-relaxed">
              "Unlimited" plans are subject to a Fair Use Policy designed to prevent abuse and ensure service quality for all customers. The limits specified above represent typical usage thresholds for legitimate business operations. Users exceeding these thresholds may be subject to:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li><strong>Usage Review:</strong> We may contact you to discuss your usage patterns and business needs</li>
              <li><strong>Temporary Throttling:</strong> API requests or email sends may be rate-limited during peak periods</li>
              <li><strong>Plan Upgrade Requirement:</strong> Excessive usage may require migration to an Enterprise plan with custom limits</li>
              <li><strong>Overage Charges:</strong> Usage significantly exceeding fair use thresholds may incur additional charges at the following rates:</li>
            </ul>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
              <p className="text-amber-800 font-medium mb-2">Overage Rates (if applicable):</p>
              <ul className="text-sm text-amber-700 space-y-1">
                <li>• Additional emails beyond limit: $0.01 per email</li>
                <li>• Additional API requests beyond limit: $0.001 per 100 requests</li>
                <li>• Additional storage beyond limit: $0.10 per GB per month</li>
                <li>• Additional invoices beyond limit: $0.25 per invoice</li>
              </ul>
            </div>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.3 Abuse Detection and Prevention</h3>
            <p className="text-gray-600 leading-relaxed">
              We employ automated systems to detect and prevent abuse of our Service. The following activities are considered abuse and may result in immediate account suspension or termination without refund:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li><strong>Automated Mass Operations:</strong> Using scripts, bots, or automated tools to generate invoices, send emails, or perform actions in bulk without prior authorization</li>
              <li><strong>Email Abuse:</strong> Sending spam, phishing attempts, or unsolicited commercial communications through our email systems</li>
              <li><strong>API Abuse:</strong> Making excessive API calls, attempting to circumvent rate limits, or using the API for purposes other than normal business operations</li>
              <li><strong>Account Stacking:</strong> Creating multiple free accounts to circumvent usage limits</li>
              <li><strong>Resource Exhaustion:</strong> Intentionally consuming system resources to degrade service performance for other users</li>
              <li><strong>Data Harvesting:</strong> Systematically extracting data from the Service beyond normal business export functions</li>
              <li><strong>Fraudulent Activity:</strong> Creating fake invoices, misrepresenting charges, or using the Service for fraudulent billing purposes</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.4 Consequences of Abuse</h3>
            <p className="text-gray-600 leading-relaxed">
              Upon detection of abuse, we reserve the right to take the following actions at our sole discretion:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li><strong>Warning:</strong> Issue a written warning for first-time or minor violations</li>
              <li><strong>Rate Limiting:</strong> Temporarily restrict access to certain features or reduce usage limits</li>
              <li><strong>Account Suspension:</strong> Temporarily suspend account access pending investigation</li>
              <li><strong>Account Termination:</strong> Permanently terminate the account without refund for severe or repeated violations</li>
              <li><strong>Legal Action:</strong> Pursue legal remedies for damages caused by abuse, including recovery of costs incurred due to the abuse</li>
              <li><strong>Reporting:</strong> Report illegal activities to appropriate law enforcement authorities</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.5 Third-Party Service Costs</h3>
            <p className="text-gray-600 leading-relaxed">
              Our Service integrates with third-party services including payment processors, email delivery services, and cloud infrastructure providers. These services incur costs based on usage. You acknowledge that:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li>Excessive usage that results in extraordinary third-party costs may be billed to your account</li>
              <li>Email delivery services charge per email sent; abuse of email features directly increases our costs</li>
              <li>Payment processing fees (typically 2.9% + $0.30 per transaction) are passed through as disclosed</li>
              <li>We reserve the right to recover costs caused by abusive behavior through billing or legal action</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">5.6 Usage Monitoring</h3>
            <p className="text-gray-600 leading-relaxed">
              You acknowledge and agree that we monitor usage patterns to enforce these limits and detect abuse. This monitoring includes, but is not limited to: API call frequency, email send rates, storage consumption, login patterns, and automated activity detection. All monitoring is conducted in accordance with our Privacy Policy.
            </p>
          </section>

          <section id="acceptable-use">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Acceptable Use Policy</h2>
            <p className="text-gray-600 leading-relaxed">You agree not to use the Service to:</p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li>Violate any applicable laws, regulations, or third-party rights</li>
              <li>Upload or transmit viruses, malware, or other harmful code</li>
              <li>Attempt to gain unauthorized access to the Service or related systems</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
              <li>Use the Service for fraudulent, deceptive, or illegal purposes</li>
              <li>Harvest or collect information about other users without consent</li>
              <li>Resell, sublicense, or redistribute the Service without authorization</li>
              <li>Use automated systems or bots to access the Service without permission</li>
            </ul>
          </section>

          <section id="ip">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Intellectual Property Rights</h2>
            <p className="text-gray-600 leading-relaxed">
              The Service, including all software, designs, text, graphics, logos, and other content, is owned by Billdora or its licensors and is protected by intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to use the Service for its intended purpose.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              You may not copy, modify, distribute, sell, or lease any part of the Service without our prior written consent. All trademarks, service marks, and trade names are the property of their respective owners.
            </p>
          </section>

          <section id="user-content">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. User Content and Data Ownership</h2>
            <p className="text-gray-600 leading-relaxed">
              You retain all ownership rights to the data, content, and information you submit to the Service ("User Content"). By using the Service, you grant us a limited license to host, store, and process your User Content solely for the purpose of providing and improving the Service.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              You are solely responsible for your User Content and ensuring that it does not violate any third-party rights or applicable laws. We do not claim ownership of your User Content.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              Upon termination of your account, we will make your User Content available for export for a period of 30 days, after which it may be permanently deleted.
            </p>
          </section>

          <section id="liability">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Limitation of Liability</h2>
            <p className="text-gray-600 leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, BILLDORA AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section id="disclaimer">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Disclaimer of Warranties</h2>
            <p className="text-gray-600 leading-relaxed">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              We do not warrant that the Service will be uninterrupted, secure, or error-free. You acknowledge that you use the Service at your own risk.
            </p>
          </section>

          <section id="indemnification">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Indemnification</h2>
            <p className="text-gray-600 leading-relaxed">
              You agree to indemnify, defend, and hold harmless Billdora and its affiliates, officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or related to:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li>Your use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party rights</li>
              <li>Your User Content</li>
            </ul>
          </section>

          <section id="termination">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Termination</h2>
            <p className="text-gray-600 leading-relaxed">
              You may terminate your account at any time by contacting us or through your account settings. We may suspend or terminate your access to the Service immediately, without prior notice, if we believe you have violated these Terms or for any other reason at our sole discretion.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              Upon termination, your right to use the Service will cease immediately. Sections of these Terms that by their nature should survive termination shall survive, including but not limited to intellectual property provisions, disclaimers, indemnification, and limitations of liability.
            </p>
          </section>

          <section id="governing-law">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Governing Law</h2>
            <p className="text-gray-600 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law principles. You agree to submit to the exclusive jurisdiction of the courts located in Delaware for the resolution of any disputes arising from these Terms.
            </p>
          </section>

          <section id="disputes">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Dispute Resolution</h2>
            <p className="text-gray-600 leading-relaxed">
              <strong>Informal Resolution:</strong> Before initiating any formal dispute resolution, you agree to first contact us at support@billdora.com to attempt to resolve any dispute informally.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              <strong>Arbitration:</strong> Any dispute that cannot be resolved informally shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association. The arbitration shall take place in Delaware, and the arbitrator's decision shall be final and binding.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              <strong>Class Action Waiver:</strong> You agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action.
            </p>
          </section>

          <section id="changes">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">15. Changes to Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify you of material changes by posting the updated Terms on our website and updating the "Last updated" date. Your continued use of the Service after such changes constitutes your acceptance of the revised Terms.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              We encourage you to review these Terms periodically for any updates.
            </p>
          </section>

          <section id="contact">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">16. Contact Information</h2>
            <p className="text-gray-600 leading-relaxed">
              If you have any questions about these Terms, please contact us at:
            </p>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-700 font-medium">Billdora</p>
              <p className="text-gray-600">Email: support@billdora.com</p>
              <p className="text-gray-600">Website: billdora.com</p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <Link to="/" className="text-[#476E66] hover:underline text-sm">Back to Home</Link>
          <Link to="/privacy" className="text-[#476E66] hover:underline text-sm">Privacy Policy</Link>
        </div>
      </main>
    </div>
  );
}
