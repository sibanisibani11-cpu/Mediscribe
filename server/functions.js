'use strict';
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
// Secrets are read only at invocation time, when Secret Manager injects them.
exports.mediscribeApi = onRequest({ region: 'us-central1', timeoutSeconds: 60, memory: '512MiB', maxInstances: 10,
  secrets: ['ENTITLEMENT_PRIVATE_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] }, (req, res) => require('./index')(req, res));
exports.reconcilePayments = onSchedule({ schedule: 'every 15 minutes', timeZone: 'UTC', region: 'us-central1',
  timeoutSeconds: 540, memory: '256MiB', maxInstances: 1, concurrency: 1, retryCount: 2,
  minBackoffSeconds: 60, maxBackoffSeconds: 300,
  secrets: ['ENTITLEMENT_PRIVATE_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] }, () => require('./index').reconcile());
