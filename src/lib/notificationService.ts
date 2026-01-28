/**
 * Notification Service
 * 
 * Centralized service for creating in-app AND push notifications.
 * All notification triggers should go through this service.
 * 
 * Usage:
 *   import { NotificationService } from './notificationService';
 *   await NotificationService.projectCreated(companyId, projectName, clientName);
 */

import { supabase } from './supabase';
import { sendLocalNotification, isPushNotificationsAvailable } from './pushNotifications';

export type NotificationType = 
  | 'proposal_viewed'
  | 'proposal_signed'
  | 'proposal_declined'
  | 'invoice_viewed'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'invoice_overdue'
  | 'payment_received'
  | 'project_created'
  | 'project_completed'
  | 'budget_warning'
  | 'task_assigned'
  | 'new_client_added'
  | 'collaboration_declined'
  | 'collaboration_invited'
  | 'collaboration_response_submitted';

interface CreateNotificationParams {
  companyId: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  referenceId?: string;
  referenceType?: 'quote' | 'invoice' | 'project' | 'client' | 'task' | 'collaboration';
  sendPush?: boolean; // Whether to send a push notification (default: true)
}

/**
 * Create a notification in the database AND send push notification
 */
async function createNotification(params: CreateNotificationParams): Promise<boolean> {
  try {
    // 1. Create database notification
    const { error } = await supabase.from('notifications').insert({
      company_id: params.companyId,
      user_id: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      reference_id: params.referenceId,
      reference_type: params.referenceType,
      is_read: false,
    });

    if (error) {
      console.error('Failed to create notification:', error);
      return false;
    }

    // 2. Send push notification (if enabled and available)
    const shouldSendPush = params.sendPush !== false; // Default to true
    if (shouldSendPush && isPushNotificationsAvailable()) {
      try {
        await sendLocalNotification(
          params.title,
          params.message,
          {
            type: params.type,
            referenceId: params.referenceId,
            referenceType: params.referenceType,
            companyId: params.companyId,
          }
        );
      } catch (pushError) {
        // Don't fail the whole notification if push fails
        console.warn('Push notification failed, but database notification created:', pushError);
      }
    }

    return true;
  } catch (err) {
    console.error('Notification service error:', err);
    return false;
  }
}

/**
 * Notification Service - Use these methods to trigger notifications
 * 
 * Messages are designed to be:
 * - Engaging with relevant emojis
 * - Clear and actionable
 * - Personal and friendly
 */
export const NotificationService = {
  
  // ==================== PROPOSALS ====================
  
  async proposalViewed(companyId: string, proposalTitle: string, clientName: string, quoteId?: string) {
    return createNotification({
      companyId,
      type: 'proposal_viewed',
      title: "👀 Someone's Looking!",
      message: `${clientName} just opened "${proposalTitle}"`,
      referenceId: quoteId,
      referenceType: 'quote',
    });
  },

  async proposalSigned(companyId: string, proposalTitle: string, clientName: string, quoteId?: string) {
    return createNotification({
      companyId,
      type: 'proposal_signed',
      title: '🎉 Proposal Signed!',
      message: `Great news! ${clientName} signed "${proposalTitle}"`,
      referenceId: quoteId,
      referenceType: 'quote',
    });
  },

  async proposalDeclined(companyId: string, proposalTitle: string, clientName: string, quoteId?: string) {
    return createNotification({
      companyId,
      type: 'proposal_declined',
      title: '📋 Proposal Update',
      message: `${clientName} declined "${proposalTitle}"`,
      referenceId: quoteId,
      referenceType: 'quote',
    });
  },

  // ==================== INVOICES ====================

  async invoiceViewed(companyId: string, invoiceNumber: string, clientName: string, invoiceId?: string) {
    return createNotification({
      companyId,
      type: 'invoice_viewed',
      title: '👁️ Invoice Opened',
      message: `${clientName} is viewing invoice #${invoiceNumber}`,
      referenceId: invoiceId,
      referenceType: 'invoice',
    });
  },

  async invoiceSent(companyId: string, invoiceNumber: string, clientName: string, invoiceId?: string) {
    return createNotification({
      companyId,
      type: 'invoice_sent',
      title: '📨 Invoice Sent',
      message: `Invoice #${invoiceNumber} delivered to ${clientName}`,
      referenceId: invoiceId,
      referenceType: 'invoice',
    });
  },

  async invoicePaid(companyId: string, invoiceNumber: string, clientName: string, amount: string, invoiceId?: string) {
    return createNotification({
      companyId,
      type: 'invoice_paid',
      title: '💰 Payment Received!',
      message: `${clientName} paid ${amount} • Invoice #${invoiceNumber}`,
      referenceId: invoiceId,
      referenceType: 'invoice',
    });
  },

  async invoiceOverdue(companyId: string, invoiceNumber: string, clientName: string, daysOverdue: number, invoiceId?: string) {
    return createNotification({
      companyId,
      type: 'invoice_overdue',
      title: '⏰ Payment Overdue',
      message: `Invoice #${invoiceNumber} for ${clientName} is ${daysOverdue}d overdue`,
      referenceId: invoiceId,
      referenceType: 'invoice',
    });
  },

  async paymentReceived(companyId: string, invoiceNumber: string, clientName: string, amount: string, invoiceId?: string) {
    return createNotification({
      companyId,
      type: 'payment_received',
      title: '✅ Payment Confirmed',
      message: `${amount} received from ${clientName}`,
      referenceId: invoiceId,
      referenceType: 'invoice',
    });
  },

  // ==================== PROJECTS ====================

  async projectCreated(companyId: string, projectName: string, clientName: string, projectId?: string) {
    return createNotification({
      companyId,
      type: 'project_created',
      title: '🚀 New Project Started',
      message: `"${projectName}" is ready for ${clientName}`,
      referenceId: projectId,
      referenceType: 'project',
    });
  },

  async projectCompleted(companyId: string, projectName: string, clientName: string, projectId?: string) {
    return createNotification({
      companyId,
      type: 'project_completed',
      title: '🏆 Project Complete!',
      message: `Nice work! "${projectName}" for ${clientName} is done`,
      referenceId: projectId,
      referenceType: 'project',
    });
  },

  async budgetWarning(companyId: string, projectName: string, percentUsed: number, projectId?: string) {
    return createNotification({
      companyId,
      type: 'budget_warning',
      title: '⚠️ Budget Alert',
      message: `"${projectName}" has used ${percentUsed}% of budget`,
      referenceId: projectId,
      referenceType: 'project',
    });
  },

  // ==================== TASKS ====================

  async taskAssigned(companyId: string, taskName: string, projectName: string, assignedToUserId: string, taskId?: string) {
    return createNotification({
      companyId,
      userId: assignedToUserId, // Target the specific user who was assigned
      type: 'task_assigned',
      title: '📝 New Task for You',
      message: `"${taskName}" in ${projectName}`,
      referenceId: taskId,
      referenceType: 'task',
    });
  },

  // ==================== OTHER ====================

  async newClientAdded(companyId: string, clientName: string, clientId?: string) {
    return createNotification({
      companyId,
      type: 'new_client_added',
      title: '🤝 New Client Added',
      message: `Welcome ${clientName} to your client list!`,
      referenceId: clientId,
      referenceType: 'client',
    });
  },

  // ==================== COLLABORATIONS ====================

  async collaborationDeclined(companyId: string, projectTitle: string, collaboratorName: string, quoteId?: string) {
    return createNotification({
      companyId,
      type: 'collaboration_declined',
      title: '📋 Collaboration Update',
      message: `${collaboratorName} declined to collaborate on "${projectTitle}"`,
      referenceId: quoteId,
      referenceType: 'quote',
    });
  },

  async collaborationInvited(userId: string, companyId: string, projectTitle: string, ownerName: string, collaborationId: string) {
    return createNotification({
      companyId,
      userId,
      type: 'collaboration_invited',
      title: '🤝 Collaboration Request',
      message: `${ownerName} invited you to collaborate on "${projectTitle}"`,
      referenceId: collaborationId,
      referenceType: 'collaboration',
    });
  },

  async collaborationResponseSubmitted(companyId: string, projectTitle: string, collaboratorName: string, quoteId: string) {
    return createNotification({
      companyId,
      type: 'collaboration_response_submitted',
      title: '📬 Collaboration Response',
      message: `${collaboratorName} submitted their response for "${projectTitle}"`,
      referenceId: quoteId,
      referenceType: 'quote',
    });
  },
};

export default NotificationService;
