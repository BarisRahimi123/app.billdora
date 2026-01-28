import { Link } from 'react-router-dom';

export default function PrivacyPage() {
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
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Privacy Policy</h1>

        {/* Table of Contents */}
        <nav className="bg-gray-50 rounded-lg p-6 mb-10">
          <h2 className="font-bold text-gray-900 mb-4">Table of Contents</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-[#476E66]">
            <li><a href="#information-collected" className="hover:underline">Information We Collect</a></li>
            <li><a href="#how-used" className="hover:underline">How We Use Your Information</a></li>
            <li><a href="#data-sharing" className="hover:underline">Data Sharing and Disclosure</a></li>
            <li><a href="#cookies" className="hover:underline">Cookies and Tracking Technologies</a></li>
            <li><a href="#security" className="hover:underline">Data Security</a></li>
            <li><a href="#user-rights" className="hover:underline">Your Rights</a></li>
            <li><a href="#retention" className="hover:underline">Data Retention</a></li>
            <li><a href="#children" className="hover:underline">Children's Privacy</a></li>
            <li><a href="#international" className="hover:underline">International Data Transfers</a></li>
            <li><a href="#third-party" className="hover:underline">Third-Party Services</a></li>
            <li><a href="#gdpr" className="hover:underline">GDPR Compliance</a></li>
            <li><a href="#ccpa" className="hover:underline">CCPA Compliance</a></li>
            <li><a href="#changes" className="hover:underline">Changes to This Policy</a></li>
            <li><a href="#contact" className="hover:underline">Contact Information</a></li>
          </ol>
        </nav>

        <div className="prose prose-gray max-w-none space-y-8">
          <section id="information-collected">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Information We Collect</h2>
            <p className="text-gray-600 leading-relaxed">
              We collect information to provide and improve our Service. The types of information we collect include:
            </p>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Personal Information</h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>Name, email address, and phone number</li>
              <li>Company name and job title</li>
              <li>Billing address and payment information</li>
              <li>Profile information and preferences</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Usage Data</h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>Device information (browser type, operating system, device identifiers)</li>
              <li>IP address and location data</li>
              <li>Pages visited and features used</li>
              <li>Time spent on the Service and interaction patterns</li>
              <li>Referring URLs and search terms</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Payment Information</h3>
            <p className="text-gray-600 leading-relaxed">
              Payment processing is handled by Stripe. We do not store complete credit card numbers on our servers. Stripe may collect and process payment information in accordance with their privacy policy.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">User Content</h3>
            <p className="text-gray-600 leading-relaxed">
              Information you voluntarily provide, including project data, client information, invoices, time entries, and any other content you create or upload to the Service.
            </p>
          </section>

          <section id="how-used">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. How We Use Your Information</h2>
            <p className="text-gray-600 leading-relaxed">We use the information we collect to:</p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process transactions and send related information</li>
              <li>Send you technical notices, updates, and support messages</li>
              <li>Respond to your comments, questions, and customer service requests</li>
              <li>Communicate with you about products, services, and events</li>
              <li>Monitor and analyze trends, usage, and activities</li>
              <li>Detect, investigate, and prevent fraudulent or unauthorized activities</li>
              <li>Personalize and improve your experience</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section id="data-sharing">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Data Sharing and Disclosure</h2>
            <p className="text-gray-600 leading-relaxed">We may share your information with:</p>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Service Providers</h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li><strong>Stripe:</strong> For secure payment processing</li>
              <li><strong>HubSpot:</strong> For customer relationship management and communications</li>
              <li><strong>Supabase:</strong> For data storage and authentication services</li>
              <li>Analytics and monitoring services</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Legal Requirements</h3>
            <p className="text-gray-600 leading-relaxed">
              We may disclose your information if required by law, court order, or governmental regulation, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Business Transfers</h3>
            <p className="text-gray-600 leading-relaxed">
              In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction.
            </p>

            <p className="text-gray-600 leading-relaxed mt-4">
              We do not sell your personal information to third parties for marketing purposes.
            </p>
          </section>

          <section id="cookies">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Cookies and Tracking Technologies</h2>
            <p className="text-gray-600 leading-relaxed">
              We use cookies and similar tracking technologies to collect and track information about your use of the Service. Types of cookies we use:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li><strong>Essential Cookies:</strong> Required for the Service to function properly</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how you use the Service</li>
              <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
              <li><strong>Marketing Cookies:</strong> Track your activity across websites for advertising</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              You can control cookies through your browser settings. Disabling certain cookies may affect the functionality of the Service.
            </p>
          </section>

          <section id="security">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Security</h2>
            <p className="text-gray-600 leading-relaxed">
              We implement appropriate technical and organizational measures to protect your information, including:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li>Encryption of data in transit using TLS/SSL</li>
              <li>Encryption of sensitive data at rest</li>
              <li>Regular security assessments and audits</li>
              <li>Access controls and authentication requirements</li>
              <li>Employee training on data protection</li>
              <li>Incident response procedures</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              While we strive to protect your information, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section id="user-rights">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Your Rights</h2>
            <p className="text-gray-600 leading-relaxed">You have the right to:</p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request your data in a portable format</li>
              <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
              <li><strong>Objection:</strong> Object to processing based on legitimate interests</li>
              <li><strong>Withdraw Consent:</strong> Withdraw consent where processing is based on consent</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              To exercise these rights, please contact us at support@billdora.com. We will respond to your request within 30 days.
            </p>
          </section>

          <section id="retention">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Data Retention</h2>
            <p className="text-gray-600 leading-relaxed">
              We retain your information for as long as your account is active or as needed to provide services. After account termination:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li>User Content is available for export for 30 days</li>
              <li>Account data is deleted within 90 days</li>
              <li>Backup copies may persist for up to 180 days</li>
              <li>Some information may be retained longer for legal compliance</li>
            </ul>
          </section>

          <section id="children">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Children's Privacy</h2>
            <p className="text-gray-600 leading-relaxed">
              The Service is not intended for individuals under 13 years of age. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete that information promptly.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              If you are a parent or guardian and believe your child has provided us with personal information, please contact us at support@billdora.com.
            </p>
          </section>

          <section id="international">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. International Data Transfers</h2>
            <p className="text-gray-600 leading-relaxed">
              Your information may be transferred to and processed in countries other than your country of residence, including the United States. These countries may have different data protection laws.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              When we transfer personal information outside of the European Economic Area (EEA), we ensure appropriate safeguards are in place, such as Standard Contractual Clauses approved by the European Commission.
            </p>
          </section>

          <section id="third-party">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Third-Party Services</h2>
            <p className="text-gray-600 leading-relaxed">
              Our Service integrates with third-party services. Each has its own privacy policy:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li><strong>Supabase:</strong> Database and authentication infrastructure</li>
              <li><strong>Stripe:</strong> Payment processing and subscription management</li>
              <li><strong>SendGrid:</strong> Transactional email delivery (invoices, reminders, notifications)</li>
              <li><strong>HubSpot:</strong> Customer relationship management and email communications</li>
            </ul>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Usage Monitoring</h3>
            <p className="text-gray-600 leading-relaxed">
              To ensure service quality and prevent abuse as outlined in our Terms of Service, we monitor:
            </p>
            <ul className="list-disc list-inside text-gray-600 mt-4 space-y-2">
              <li>API request frequency and patterns</li>
              <li>Email send rates and delivery metrics</li>
              <li>Storage consumption and file uploads</li>
              <li>Login frequency and session patterns</li>
              <li>Feature usage and automation detection</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              This monitoring is used solely for service optimization, abuse prevention, and billing purposes. We do not use this data for advertising or sell it to third parties.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              We encourage you to review the privacy policies of these third-party services.
            </p>
          </section>

          <section id="gdpr">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. GDPR Compliance (European Users)</h2>
            <p className="text-gray-600 leading-relaxed">
              If you are located in the European Economic Area (EEA), the following provisions apply:
            </p>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Legal Basis for Processing</h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li><strong>Contract:</strong> Processing necessary to perform our contract with you</li>
              <li><strong>Consent:</strong> Processing based on your explicit consent</li>
              <li><strong>Legitimate Interests:</strong> Processing for our legitimate business interests</li>
              <li><strong>Legal Obligation:</strong> Processing required to comply with law</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Data Protection Officer</h3>
            <p className="text-gray-600 leading-relaxed">
              For GDPR-related inquiries, contact us at support@billdora.com with "GDPR Request" in the subject line.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Supervisory Authority</h3>
            <p className="text-gray-600 leading-relaxed">
              You have the right to lodge a complaint with your local data protection authority if you believe we have violated your privacy rights.
            </p>
          </section>

          <section id="ccpa">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. CCPA Compliance (California Residents)</h2>
            <p className="text-gray-600 leading-relaxed">
              If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
            </p>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Your CCPA Rights</h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li><strong>Right to Know:</strong> Request disclosure of personal information collected, used, and shared</li>
              <li><strong>Right to Delete:</strong> Request deletion of your personal information</li>
              <li><strong>Right to Opt-Out:</strong> Opt-out of the sale of personal information (we do not sell personal information)</li>
              <li><strong>Right to Non-Discrimination:</strong> Equal service regardless of exercising your rights</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Categories of Information</h3>
            <p className="text-gray-600 leading-relaxed">
              In the preceding 12 months, we have collected the following categories of personal information: identifiers, commercial information, internet activity, and professional information.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">Exercising Your Rights</h3>
            <p className="text-gray-600 leading-relaxed">
              To exercise your CCPA rights, contact us at support@billdora.com or call us. We will verify your identity before processing your request.
            </p>
          </section>

          <section id="changes">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Changes to This Policy</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy on our website and updating the "Last updated" date.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              Your continued use of the Service after any changes indicates your acceptance of the updated Privacy Policy. We encourage you to review this policy periodically.
            </p>
          </section>

          <section id="contact">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Contact Information</h2>
            <p className="text-gray-600 leading-relaxed">
              If you have any questions about this Privacy Policy or our data practices, please contact us:
            </p>
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-gray-700 font-medium">Billdora</p>
              <p className="text-gray-600">Email: support@billdora.com</p>
              <p className="text-gray-600">Website: billdora.com</p>
            </div>
            <p className="text-gray-600 leading-relaxed mt-4">
              For GDPR or CCPA requests, please include "Privacy Request" in your email subject line.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <Link to="/" className="text-[#476E66] hover:underline text-sm">Back to Home</Link>
          <Link to="/terms" className="text-[#476E66] hover:underline text-sm">Terms of Service</Link>
        </div>
      </main>
    </div>
  );
}
