// src/routes/webhooks.ts
import { Hono } from 'hono';
import { db } from '../db/client';
import { payments, activityRegistrations, activities, organizers, users } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { createHmac } from 'crypto';

const app = new Hono();

// Razorpay webhook signature verification
function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return signature === expectedSignature;
}

app.post('/razorpay', async (c) => {
  try {
    const body = await c.req.text();
    const signature = c.req.header('x-razorpay-signature');

    if (!signature) {
      console.error('❌ Missing Razorpay signature');
      return c.json({ error: 'Missing signature' }, 400);
    }

    const event = JSON.parse(body);
    const paymentEntity = event.payload.payment.entity;
    const razorpayOrderId = paymentEntity.order_id; // This is the Razorpay order ID

    // Find payment record by Razorpay order ID stored in providerPaymentId
    const paymentWithOrganizer = await db
      .select({
        payment: payments,
        organizer: organizers,
      })
      .from(payments)
      .innerJoin(activityRegistrations, eq(payments.registrationId, activityRegistrations.id))
      .innerJoin(activities, eq(activityRegistrations.activityId, activities.id))
      .innerJoin(organizers, eq(activities.organizerId, organizers.id))
      .where(eq(payments.providerPaymentId, razorpayOrderId))
      .limit(1)
      .execute();

    if (!paymentWithOrganizer.length) {
      console.error('❌ Payment record or organizer not found for Razorpay order:', razorpayOrderId);
      return c.json({ error: 'Payment record not found' }, 404);
    }

    const webhookSecret = paymentWithOrganizer[0].organizer.razorpayWebhookSecret;
    if (!webhookSecret) {
      console.error('❌ Organizer webhook secret not configured');
      return c.json({ error: 'Webhook secret not configured for organizer' }, 500);
    }

    // Verify webhook signature
    const isValidSignature = await verifyWebhookSignature(body, signature, webhookSecret);
    if (!isValidSignature) {
      console.error('❌ Invalid webhook signature');
      return c.json({ error: 'Invalid signature' }, 400);
    }

    console.log('🔄 Razorpay webhook received:', event.event);

    switch (event.event) {
      case 'payment.captured':
      case 'order.paid':
        await handlePaymentSuccess(event, paymentWithOrganizer[0]);
        break;

      case 'payment.failed':
        await handlePaymentFailed(event);
        break;

      default:
        console.log('⚠️ Unhandled webhook event:', event.event);
    }

    return c.json({ status: 'ok' }, 200);

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

async function handlePaymentSuccess(event: any, paymentWithOrganizer: any) {
  const paymentEntity = event.payload.payment.entity;
  const razorpayOrderId = paymentEntity.order_id;
  const paymentId = paymentEntity.id;
  const amount = paymentEntity.amount / 100; // Convert from paisa to rupees

  console.log('💰 Payment successful (order.paid or payment.captured):', {
    event: event.event,
    paymentId,
    razorpayOrderId,
    amount,
    status: paymentEntity.status
  });

  try {
    // Find payment by Razorpay order ID
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.providerPaymentId, razorpayOrderId))
      .limit(1)
      .execute();

    if (!payment) {
      console.error('❌ Payment record not found for Razorpay order:', razorpayOrderId);
      return;
    }

    // Check if already processed to avoid duplicate updates
    if (payment.status === 'completed') {
      console.log('ℹ️ Payment already processed, skipping duplicate webhook');
      return;
    }

    // Update payment status
    await db
      .update(payments)
      .set({
        status: 'completed',
        // providerPaymentId already has Razorpay order ID, we can store payment ID in a note or leave as is
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))
      .execute();

    // Get registration details
    if (!payment.registrationId) {
      console.error('❌ No registration ID found for payment:', payment.id);
      return;
    }

    const [registration] = await db
      .select()
      .from(activityRegistrations)
      .where(eq(activityRegistrations.id, payment.registrationId))
      .limit(1)
      .execute();

    if (!registration) {
      console.error('❌ Registration not found:', payment.registrationId);
      return;
    }

    // Get activity details
    if (!registration.activityId) {
      console.error('❌ No activity ID found for registration:', registration.id);
      return;
    }

    const [activity] = await db
      .select()
      .from(activities)
      .where(eq(activities.id, registration.activityId))
      .limit(1)
      .execute();

    if (!activity) {
      console.error('❌ Activity not found:', registration.activityId);
      return;
    }

    // Get user details for email
    if (!registration.userId) {
      console.error('❌ No user ID found for registration:', registration.id);
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, registration.userId))
      .limit(1)
      .execute();

    if (!user) {
      console.error('❌ User not found:', registration.userId);
      return;
    }

    // ⚠️ CRITICAL: Update activity booked slots ONLY when order is fully paid
    const previousBookedSlots = activity.bookedSlots || 0;
    await db
      .update(activities)
      .set({
        bookedSlots: sql`${activities.bookedSlots} + ${registration.ticketCount}`,
      })
      .where(eq(activities.id, activity.id))
      .execute();

    console.log(`✅ Seats updated for activity "${activity.name}": ${previousBookedSlots} -> ${previousBookedSlots + registration.ticketCount} (added ${registration.ticketCount} tickets)`);

    // Update registration timestamp
    await db
      .update(activityRegistrations)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(activityRegistrations.id, registration.id))
      .execute();

    // Send confirmation email
    const organizer = paymentWithOrganizer.organizer;
    if (user.email && organizer) {
      console.log('\n========== WEBHOOK EMAIL SENDING ==========');
      console.log('📧 Sending payment confirmation email');
      console.log('📋 User:', user.email, `(${user.firstName} ${user.lastName})`);
      console.log('📋 Organizer:', {
        id: organizer.id,
        name: organizer.organizationName,
        email: organizer.organizerEmail,
        systemEmail: organizer.systemEmail,
        hasResendApiKey: !!organizer.resendApiKey,
      });
      
      try {
        const { sendRegistrationEmail } = await import('../utils/email');
        console.log('🚀 Calling sendRegistrationEmail from webhook...');
        const emailResult = await sendRegistrationEmail(
          user.email,
          `${user.firstName} ${user.lastName}`,
          activity.name,
          organizer.organizationName || 'Event Organizer',
          organizer.organizerEmail,
          registration.ticketCount,
          activity.venueName || undefined,
          typeof activity.additionalInfo === 'string' ? activity.additionalInfo : undefined,
          organizer.resendApiKey,
          organizer.systemEmail
        );

        console.log('📬 Webhook email result:', JSON.stringify(emailResult, null, 2));

        if (emailResult.success) {
          console.log('✅✅✅ Payment confirmation email sent successfully!');
          console.log('   → Message ID:', emailResult.messageId);
        } else {
          console.error('❌❌❌ Failed to send payment confirmation email!');
          console.error('   → Error:', emailResult.error);
        }
        console.log('========== WEBHOOK EMAIL COMPLETE ==========\n');
      } catch (emailError) {
        console.error('❌❌❌ EXCEPTION in webhook email!');
        console.error('Exception:', emailError);
        console.error('Stack:', (emailError as Error)?.stack);
        console.log('========== WEBHOOK EMAIL FAILED ==========\n');
      }
    } else {
      if (!user.email) {
        console.log('⚠️ No user email found, skipping payment confirmation email');
      }
      if (!organizer) {
        console.log('⚠️ No organizer found, skipping payment confirmation email');
      }
    }

    console.log('✅ Payment processed successfully for payment ID:', payment.id);

  } catch (error) {
    console.error('❌ Error processing payment success:', error);
  }
}

async function handlePaymentFailed(event: any) {
  const paymentEntity = event.payload.payment.entity;
  const razorpayOrderId = paymentEntity.order_id;
  const paymentId = paymentEntity.id;

  console.log('❌ Payment failed:', {
    paymentId,
    razorpayOrderId,
    reason: paymentEntity.error_description
  });

  try {
    // Find payment by Razorpay order ID
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.providerPaymentId, razorpayOrderId))
      .limit(1)
      .execute();

    if (!payment) {
      console.error('❌ Payment record not found for failed payment with Razorpay order:', razorpayOrderId);
      return;
    }

    // Update payment status to failed
    await db
      .update(payments)
      .set({
        status: 'failed',
        // providerPaymentId already has Razorpay order ID
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))
      .execute();

    // Update registration status to canceled
    if (payment.registrationId) {
      await db
        .update(activityRegistrations)
        .set({
          status: 'canceled',
          updatedAt: new Date(),
        })
        .where(eq(activityRegistrations.id, payment.registrationId))
        .execute();
    }

    console.log('ℹ️ Payment failed - seats NOT updated (no deduction on failure)');
    console.log('✅ Payment failure processed for payment ID:', payment.id);

  } catch (error) {
    console.error('❌ Error processing payment failure:', error);
  }
}

export default app;