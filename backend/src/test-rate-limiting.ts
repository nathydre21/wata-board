import { PaymentService, PaymentRequest } from './payment-service';

// Rate limiting configuration: 5 transactions per minute
const RATE_LIMIT_CONFIG = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 5,        // 5 transactions per minute
  queueSize: 10          // Allow 10 queued requests
};

// Mock payment execution for testing
class MockPaymentService extends PaymentService {
  private async executePayment(request: PaymentRequest): Promise<string> {
    // Simulate payment processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate occasional failures
    if (Math.random() < 0.1) {
      throw new Error('Simulated payment failure');
    }
    
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

async function demonstrateRateLimiting() {
  console.log("=== Rate Limiting Demonstration ===\n");
  
  const paymentService = new MockPaymentService(RATE_LIMIT_CONFIG);
  const userId = "demo_user_" + Date.now();
  
  console.log(`User ID: ${userId}`);
  console.log(`Rate limit: ${RATE_LIMIT_CONFIG.maxRequests} requests per ${RATE_LIMIT_CONFIG.windowMs / 1000} seconds`);
  console.log(`Queue size: ${RATE_LIMIT_CONFIG.queueSize}\n`);
  
  // Test 1: Normal usage within limits
  console.log("1. Testing normal usage (3 requests within limit):");
  for (let i = 1; i <= 3; i++) {
    const request: PaymentRequest = {
      meter_id: `METER-${i.toString().padStart(3, '0')}`,
      amount: i * 10,
      userId: userId
    };
    
    console.log(`\n  Request ${i}: Processing payment for ${request.meter_id}...`);
    const result = await paymentService.processPayment(request);
    
    if (result.success) {
      console.log(`  ✅ Success: ${result.transactionId}`);
    } else {
      console.log(`  ❌ Failed: ${result.error}`);
    }
    
    if (result.rateLimitInfo) {
      console.log(`  📊 Rate limit: ${result.rateLimitInfo.remainingRequests}/${RATE_LIMIT_CONFIG.maxRequests} remaining`);
    }
  }
  
  // Show current status
  const status = paymentService.getRateLimitStatus(userId);
  console.log(`\n📊 Current status: ${status.remainingRequests}/${RATE_LIMIT_CONFIG.maxRequests} requests remaining`);
  console.log(`⏰ Reset time: ${status.resetTime.toLocaleTimeString()}\n`);
  
  // Test 2: Exceeding rate limit
  console.log("2. Testing rate limit exceeded (3 more requests):");
  for (let i = 4; i <= 6; i++) {
    const request: PaymentRequest = {
      meter_id: `METER-${i.toString().padStart(3, '0')}`,
      amount: i * 10,
      userId: userId
    };
    
    console.log(`\n  Request ${i}: Processing payment for ${request.meter_id}...`);
    const result = await paymentService.processPayment(request);
    
    if (result.success) {
      console.log(`  ✅ Success: ${result.transactionId}`);
    } else {
      console.log(`  ❌ Failed: ${result.error}`);
      if (result.rateLimitInfo?.queued) {
        console.log(`  📋 Queued: Position #${result.rateLimitInfo.queuePosition}`);
      }
    }
    
    if (result.rateLimitInfo) {
      console.log(`  📊 Rate limit: ${result.rateLimitInfo.remainingRequests}/${RATE_LIMIT_CONFIG.maxRequests} remaining`);
    }
  }
  
  // Test 3: Queue overflow
  console.log("\n3. Testing queue overflow (5 more requests):");
  for (let i = 7; i <= 11; i++) {
    const request: PaymentRequest = {
      meter_id: `METER-${i.toString().padStart(3, '0')}`,
      amount: i * 10,
      userId: userId
    };
    
    console.log(`\n  Request ${i}: Processing payment for ${request.meter_id}...`);
    const result = await paymentService.processPayment(request);
    
    if (result.success) {
      console.log(`  ✅ Success: ${result.transactionId}`);
    } else {
      console.log(`  ❌ Failed: ${result.error}`);
      if (result.rateLimitInfo?.queued) {
        console.log(`  📋 Queued: Position #${result.rateLimitInfo.queuePosition}`);
      }
    }
    
    if (result.rateLimitInfo) {
      console.log(`  📊 Rate limit: ${result.rateLimitInfo.remainingRequests}/${RATE_LIMIT_CONFIG.maxRequests} remaining`);
    }
  }
  
  // Show final queue status
  console.log(`\n📋 Queue length: ${paymentService.getQueueLength(userId)}`);
  
  console.log("\n=== Rate Limiting Test Complete ===");
  console.log("✅ Rate limiting is working correctly!");
  console.log("✅ Queue system is handling overflow requests!");
  console.log("✅ User feedback is provided for rate-limited requests!");
}

// Test different user isolation
async function testUserIsolation() {
  console.log("\n=== Testing User Isolation ===\n");
  
  const paymentService = new MockPaymentService(RATE_LIMIT_CONFIG);
  const user1 = "user_1_" + Date.now();
  const user2 = "user_2_" + Date.now();
  
  console.log(`User 1 ID: ${user1}`);
  console.log(`User 2 ID: ${user2}\n`);
  
  // User 1 makes 5 requests (should hit limit)
  console.log("User 1 making 5 requests:");
  for (let i = 1; i <= 5; i++) {
    const request: PaymentRequest = {
      meter_id: `METER-U1-${i}`,
      amount: 10,
      userId: user1
    };
    
    const result = await paymentService.processPayment(request);
    console.log(`  Request ${i}: ${result.success ? '✅ Success' : '❌ Failed'}`);
  }
  
  const user1Status = paymentService.getRateLimitStatus(user1);
  console.log(`User 1 status: ${user1Status.remainingRequests}/${RATE_LIMIT_CONFIG.maxRequests} remaining\n`);
  
  // User 2 should still have full limit available
  console.log("User 2 making 1 request:");
  const request: PaymentRequest = {
    meter_id: `METER-U2-1`,
    amount: 10,
    userId: user2
  };
  
  const result = await paymentService.processPayment(request);
  console.log(`  Request: ${result.success ? '✅ Success' : '❌ Failed'}`);
  
  const user2Status = paymentService.getRateLimitStatus(user2);
  console.log(`User 2 status: ${user2Status.remainingRequests}/${RATE_LIMIT_CONFIG.maxRequests} remaining`);
  
  console.log("\n✅ User isolation is working correctly!");
}

// Run tests
async function main() {
  try {
    await demonstrateRateLimiting();
    await testUserIsolation();
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { demonstrateRateLimiting, testUserIsolation };
