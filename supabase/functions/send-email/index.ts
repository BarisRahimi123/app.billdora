// Edge function to send emails via SendGrid - self-contained
const ALLOWED_ORIGINS = [
  'https://app.billdora.com',
  'https://app-billdora.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'capacitor://localhost',
  'http://localhost'
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.vercel.app') || origin.endsWith('.minimax.io')
  ) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Verify auth - allow service role calls
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Allow service role key or validate user token
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  try {
    const { to, subject, type, data } = await req.json();

    if (!to || !subject) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!SENDGRID_API_KEY) {
      console.error('SENDGRID_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let htmlContent = '';
    
    if (type === 'invitation') {
      const { inviterName, companyName, roleName, signupUrl } = data || {};
      htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #476E66; color: white; font-size: 24px; font-weight: bold; line-height: 48px; border-radius: 12px;">B</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">Billdora</h1>
          </div>
          <h2 style="color: #111827; font-size: 20px; margin-bottom: 24px;">You've been invited!</h2>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            ${inviterName || 'A team member'} has invited you to join <strong>${companyName || 'their company'}</strong> on Billdora${roleName ? ` as a <strong>${roleName}</strong>` : ''}.
          </p>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Click the button below to create your account and get started:
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${signupUrl || '#'}" style="display: inline-block; background: #476E66; color: white; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 600; border-radius: 8px;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #9CA3AF; font-size: 14px; margin-top: 40px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `;
    } else if (type === 'confirmation') {
      const { userName, confirmationUrl } = data || {};
      htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #476E66; color: white; font-size: 24px; font-weight: bold; line-height: 48px; border-radius: 12px;">B</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">Billdora</h1>
          </div>
          <h2 style="color: #111827; font-size: 20px; margin-bottom: 24px;">Confirm your email</h2>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Hi${userName ? ` ${userName}` : ''},
          </p>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Thank you for signing up for Billdora. Please confirm your email address by clicking the button below:
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${confirmationUrl || '#'}" style="display: inline-block; background: #476E66; color: white; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 600; border-radius: 8px;">
              Confirm Email
            </a>
          </div>
          <p style="color: #9CA3AF; font-size: 14px; margin-top: 40px;">
            If you didn't create an account, you can safely ignore this email.
          </p>
        </div>
      `;
    } else if (type === 'signed_proposal') {
      const { proposalNumber, proposalTitle, clientName, companyName, signerName, signedDate, viewUrl, accessCode } = data || {};
      htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #476E66; color: white; font-size: 24px; font-weight: bold; line-height: 48px; border-radius: 12px;">B</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">Billdora</h1>
          </div>
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: #D1FAE5; color: #065F46; padding: 8px 20px; border-radius: 20px; font-weight: 600;">
              ✓ Proposal Accepted
            </div>
          </div>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Dear ${clientName || 'Valued Customer'},
          </p>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Thank you for accepting proposal <strong>#${proposalNumber || ''}</strong>${proposalTitle ? ` - ${proposalTitle}` : ''} from ${companyName || 'our company'}.
          </p>
          <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px; color: #6B7280; font-size: 14px;">Signed by</p>
            <p style="margin: 0; color: #111827; font-size: 16px; font-weight: 600;">${signerName || clientName || 'Client'}</p>
            <p style="margin: 8px 0 0; color: #6B7280; font-size: 14px;">${signedDate || new Date().toLocaleDateString()}</p>
          </div>
          ${viewUrl ? `
          <div style="text-align: center; margin: 32px 0;">
            <a href="${viewUrl}" style="display: inline-block; background: #476E66; color: white; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 600; border-radius: 8px;">
              View Signed Proposal
            </a>
          </div>
          ${accessCode ? `
          <div style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 12px; padding: 16px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 8px; color: #92400E; font-size: 14px; font-weight: 600;">Your Access Code</p>
            <p style="margin: 0; color: #111827; font-size: 28px; font-weight: bold; letter-spacing: 8px;">${accessCode}</p>
            <p style="margin: 8px 0 0; color: #92400E; font-size: 12px;">Use this code to view your signed proposal anytime</p>
          </div>
          ` : ''}
          ` : ''}
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Our team will be in touch shortly to discuss next steps.
          </p>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Best regards,<br/>
            ${companyName || 'The Team'}
          </p>
        </div>
      `;
    } else if (type === 'collaborator_invitation') {
      const { inviterName, companyName, projectName, categoryName, message, deadline, respondUrl } = data || {};
      htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #476E66; color: white; font-size: 24px; font-weight: bold; line-height: 48px; border-radius: 12px;">B</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">Billdora</h1>
          </div>
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: #E0E7FF; color: #3730A3; padding: 8px 20px; border-radius: 20px; font-weight: 600;">
              📋 Collaboration Request
            </div>
          </div>
          <h2 style="color: #111827; font-size: 20px; margin-bottom: 24px;">You've been invited to collaborate!</h2>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            <strong>${inviterName || 'A team member'}</strong> from <strong>${companyName || 'a company'}</strong> has invited you to provide a quote for their project.
          </p>
          ${projectName ? `
          <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px; color: #6B7280; font-size: 14px;">Project</p>
            <p style="margin: 0; color: #111827; font-size: 18px; font-weight: 600;">${projectName}</p>
            ${categoryName ? `<p style="margin: 8px 0 0; color: #6B7280; font-size: 14px;">Category: ${categoryName}</p>` : ''}
            ${deadline ? `<p style="margin: 4px 0 0; color: #DC2626; font-size: 14px;">Response needed by: ${new Date(deadline).toLocaleDateString()}</p>` : ''}
          </div>
          ` : ''}
          ${message ? `
          <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 16px; margin: 24px 0;">
            <p style="margin: 0 0 4px; color: #92400E; font-size: 12px; font-weight: 600;">Message from ${inviterName || 'the requester'}:</p>
            <p style="margin: 0; color: #78350F; font-size: 14px; font-style: italic;">"${message}"</p>
          </div>
          ` : ''}
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Click the button below to view the project details and submit your quote:
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${respondUrl || '#'}" style="display: inline-block; background: #476E66; color: white; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 600; border-radius: 8px;">
              View & Respond to Request
            </a>
          </div>
          <p style="color: #9CA3AF; font-size: 14px; margin-top: 40px;">
            If you didn't expect this invitation or don't want to participate, you can safely ignore this email.
          </p>
        </div>
      `;
    } else if (type === 'password_reset') {
      const { userName, resetUrl } = data || {};
      htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #476E66; color: white; font-size: 24px; font-weight: bold; line-height: 48px; border-radius: 12px;">B</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">Billdora</h1>
          </div>
          <h2 style="color: #111827; font-size: 20px; margin-bottom: 24px;">Reset Your Password</h2>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Hi${userName ? ` ${userName}` : ''},
          </p>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            We received a request to reset your password. Click the button below to create a new password:
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl || '#'}" style="display: inline-block; background: #476E66; color: white; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 600; border-radius: 8px;">
              Reset Password
            </a>
          </div>
          <p style="color: #9CA3AF; font-size: 14px; margin-top: 40px;">
            This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
      `;
    } else if (type === 'project_collaboration_invite') {
      const { inviterName, companyName, projectName, role, acceptUrl, permissions } = data || {};
      const permissionsList = [];
      if (permissions?.can_comment) permissionsList.push('Comment on project');
      if (permissions?.can_view_financials) permissionsList.push('View financials');
      if (permissions?.can_view_time_entries) permissionsList.push('View time entries');
      if (permissions?.can_edit_tasks) permissionsList.push('Edit tasks');
      
      htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #476E66; color: white; font-size: 24px; font-weight: bold; line-height: 48px; border-radius: 12px;">B</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">Billdora</h1>
          </div>
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: #E0E7FF; color: #3730A3; padding: 8px 20px; border-radius: 20px; font-weight: 600;">
              🤝 Project Collaboration Invite
            </div>
          </div>
          <h2 style="color: #111827; font-size: 20px; margin-bottom: 24px;">You've been invited to collaborate!</h2>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            <strong>${inviterName || 'Someone'}</strong> from <strong>${companyName || 'a company'}</strong> has invited you to collaborate on a project.
          </p>
          <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px; color: #6B7280; font-size: 14px;">Project</p>
            <p style="margin: 0; color: #111827; font-size: 18px; font-weight: 600;">${projectName || 'Untitled Project'}</p>
            <p style="margin: 12px 0 0; color: #6B7280; font-size: 14px;">Your role: <strong style="color: #111827; text-transform: capitalize;">${role || 'Collaborator'}</strong></p>
          </div>
          ${permissionsList.length > 0 ? `
          <div style="margin: 24px 0;">
            <p style="margin: 0 0 12px; color: #6B7280; font-size: 14px;">You'll be able to:</p>
            <ul style="margin: 0; padding-left: 20px; color: #4B5563;">
              ${permissionsList.map(p => `<li style="margin-bottom: 8px;">${p}</li>`).join('')}
            </ul>
          </div>
          ` : ''}
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Sign in to your Billdora account to get started. If you don't have an account yet, you can create one — the project will be added to your account automatically.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${acceptUrl || '#'}" style="display: inline-block; background: #476E66; color: white; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 600; border-radius: 8px;">
              Sign In to Accept
            </a>
          </div>
          <p style="color: #9CA3AF; font-size: 14px; margin-top: 40px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `;
    } else if (type === 'collaborator_proposal_approved') {
      const { projectName, ownerName, signedDate, viewUrl } = data || {};
      htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #476E66; color: white; font-size: 24px; font-weight: bold; line-height: 48px; border-radius: 12px;">B</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">Billdora</h1>
          </div>
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: #D1FAE5; color: #065F46; padding: 8px 20px; border-radius: 20px; font-weight: 600;">
              ✅ Proposal Approved
            </div>
          </div>
          <h2 style="color: #111827; font-size: 20px; margin-bottom: 24px;">Great news! Your proposal has been approved.</h2>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            <strong>${ownerName || 'The project owner'}</strong> has signed and approved your proposal for <strong>${projectName || 'the project'}</strong>.
          </p>
          <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px; color: #6B7280; font-size: 14px;">Signed by</p>
            <p style="margin: 0; color: #111827; font-size: 16px; font-weight: 600;">${ownerName || 'Project Owner'}</p>
            <p style="margin: 8px 0 0; color: #6B7280; font-size: 14px;">${signedDate || new Date().toLocaleDateString()}</p>
          </div>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            You can now proceed with the project. Click the button below to view the signed proposal:
          </p>
          ${viewUrl ? `
          <div style="text-align: center; margin: 32px 0;">
            <a href="${viewUrl}" style="display: inline-block; background: #476E66; color: white; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 600; border-radius: 8px;">
              View Signed Proposal
            </a>
          </div>
          ` : ''}
          <p style="color: #9CA3AF; font-size: 14px; margin-top: 40px;">
            If you have any questions, please contact the project owner directly.
          </p>
        </div>
      `;
    } else if (type === 'invoice' || type === 'quote') {
      const { documentNumber, clientName, companyName, total, pdfUrl } = data || {};
      htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #476E66; color: white; font-size: 24px; font-weight: bold; line-height: 48px; border-radius: 12px;">B</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">Billdora</h1>
          </div>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Dear ${clientName || 'Valued Customer'},
          </p>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Please find attached your ${type} ${documentNumber ? `#${documentNumber}` : ''} from ${companyName || 'our company'}.
          </p>
          ${total ? `<p style="color: #111827; font-size: 20px; font-weight: bold;">Total Amount: $${Number(total).toFixed(2)}</p>` : ''}
          ${pdfUrl ? `
          <div style="text-align: center; margin: 32px 0;">
            <a href="${pdfUrl}" style="display: inline-block; background: #476E66; color: white; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 600; border-radius: 8px;">
              View ${type}
            </a>
          </div>
          ` : ''}
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            If you have any questions, please don't hesitate to contact us.
          </p>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Best regards,<br/>
            ${companyName || 'The Team'}
          </p>
        </div>
      `;
    } else if (type === 'invoice_paid') {
      const { invoiceNumber, clientName, companyName, total, paidDate, paymentMethod } = data || {};
      htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #476E66; color: white; font-size: 24px; font-weight: bold; line-height: 48px; border-radius: 12px;">B</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">Billdora</h1>
          </div>
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: #D1FAE5; color: #065F46; padding: 8px 20px; border-radius: 20px; font-weight: 600;">
              💰 Payment Received
            </div>
          </div>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Great news! Invoice <strong>#${invoiceNumber || ''}</strong> from <strong>${clientName || 'your client'}</strong> has been paid.
          </p>
          <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #6B7280;">Amount</span>
              <span style="color: #111827; font-weight: 600; font-size: 20px;">$${Number(total || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #6B7280;">Client</span>
              <span style="color: #111827; font-weight: 500;">${clientName || 'N/A'}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #6B7280;">Date</span>
              <span style="color: #111827; font-weight: 500;">${paidDate || new Date().toLocaleDateString()}</span>
            </div>
          </div>
          <p style="color: #9CA3AF; font-size: 14px; margin-top: 40px; text-align: center;">
            This is an automated notification from ${companyName || 'Billdora'}.
          </p>
        </div>
      `;
    } else if (type === 'invoice_overdue') {
      const { invoiceNumber, clientName, clientEmail, companyName, total, dueDate, daysOverdue, viewUrl } = data || {};
      htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #476E66; color: white; font-size: 24px; font-weight: bold; line-height: 48px; border-radius: 12px;">B</div>
            <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">Billdora</h1>
          </div>
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: #FEE2E2; color: #991B1B; padding: 8px 20px; border-radius: 20px; font-weight: 600;">
              ⚠️ Invoice Overdue
            </div>
          </div>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Invoice <strong>#${invoiceNumber || ''}</strong> for <strong>${clientName || 'a client'}</strong> is now <strong>${daysOverdue || 0} days overdue</strong>.
          </p>
          <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #991B1B;">Amount Due</span>
              <span style="color: #991B1B; font-weight: 600; font-size: 20px;">$${Number(total || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #6B7280;">Client</span>
              <span style="color: #111827; font-weight: 500;">${clientName || 'N/A'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #6B7280;">Due Date</span>
              <span style="color: #DC2626; font-weight: 500;">${dueDate || 'N/A'}</span>
            </div>
            ${clientEmail ? `
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #6B7280;">Client Email</span>
              <span style="color: #111827; font-weight: 500;">${clientEmail}</span>
            </div>
            ` : ''}
          </div>
          <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
            Consider sending a payment reminder to the client.
          </p>
          ${viewUrl ? `
          <div style="text-align: center; margin: 32px 0;">
            <a href="${viewUrl}" style="display: inline-block; background: #476E66; color: white; text-decoration: none; padding: 14px 32px; font-size: 14px; font-weight: 600; border-radius: 8px;">
              View Invoice
            </a>
          </div>
          ` : ''}
          <p style="color: #9CA3AF; font-size: 14px; margin-top: 40px; text-align: center;">
            This is an automated notification from ${companyName || 'Billdora'}.
          </p>
        </div>
      `;
    } else {
      htmlContent = `<p>${data?.message || 'You have a new notification from Billdora.'}</p>`;
    }

    // Send via SendGrid
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'info@billdora.com', name: 'Billdora' },
        subject: subject,
        content: [{ type: 'text/html', value: htmlContent }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SendGrid error:', errorText);
      throw new Error(`SendGrid error: ${response.status}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Email sent to ${to}` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Email error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to send email' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
