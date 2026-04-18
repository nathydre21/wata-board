import { PaymentService, PaymentRequest } from './payment-service';

// Rate limiting configuration: 5 transactions per minute
const RATE_LIMIT_CONFIG = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 5,        // 5 transactions per minute
  queueSize: 10          // Allow 10 queued requests
};

// Initialize payment service with rate limiting
const paymentService = new PaymentService(RATE_LIMIT_CONFIG);

async function main() {
  const meterId = "METER-001";
  const amount = 10;
  const userId = "user_" + Date.now(); // In production, this would come from authentication

  console.log("Processing payment with rate limiting...");

  const paymentRequest: PaymentRequest = {
    meter_id: meterId,
    amount: amount,
    userId: userId
  };

  const result = await paymentService.processPayment(paymentRequest);

  if (result.success) {
    console.log(`✅ Payment successful! Transaction ID: ${result.transactionId}`);
    
    // Show rate limit status
    const status = paymentService.getRateLimitStatus(userId);
    console.log(`Rate limit status: ${status.remainingRequests}/${RATE_LIMIT_CONFIG.maxRequests} requests remaining`);
    console.log(`Reset time: ${status.resetTime.toLocaleTimeString()}`);
  } else {
    console.log(`❌ Payment failed: ${result.error}`);
    
    if (result.rateLimitInfo?.queued) {
      console.log(`📋 Payment is queued. Position: #${result.rateLimitInfo.queuePosition}`);
      console.log(`Queue length: ${paymentService.getQueueLength(userId)}`);
    } else if (result.rateLimitInfo) {
      const waitTime = Math.ceil((result.rateLimitInfo.resetTime.getTime() - Date.now()) / 1000);
      console.log(`⏰ Please wait ${waitTime} seconds before trying again.`);
    }
  }
}

// Test multiple rapid payments to demonstrate rate limiting
async function testRateLimiting() {
  console.log("\n=== Testing Rate Limiting ===");
  
  const userId = "test_user_" + Date.now();
  const requests = [];
  
  // Submit 8 rapid requests (should allow 5, queue 3, reject rest)
  for (let i = 1; i <= 8; i++) {
    const request: PaymentRequest = {
      meter_id: `METER-${i.toString().padStart(3, '0')}`,
      amount: i,
      userId: userId
    };
    
    console.log(`\nSubmitting request ${i}...`);
    const promise = paymentService.processPayment(request);
    requests.push(promise);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Wait for all requests to complete
  const results = await Promise.all(requests);
  
  console.log("\n=== Results ===");
  results.forEach((result, index) => {
    console.log(`Request ${index + 1}: ${result.success ? '✅ Success' : '❌ Failed'}`);
    if (!result.success) {
      console.log(`  Error: ${result.error}`);
      if (result.rateLimitInfo?.queued) {
        console.log(`  Queued: Position #${result.rateLimitInfo.queuePosition}`);
      }
    }
  });
  
  // Show final status
  const finalStatus = paymentService.getRateLimitStatus(userId);
  console.log(`\nFinal rate limit status: ${finalStatus.remainingRequests}/${RATE_LIMIT_CONFIG.maxRequests} remaining`);
}

// Run the tests
if (process.argv.includes('--test')) {
  testRateLimiting().catch(console.error);
} else {
  main().catch(console.error);
}
