#!/usr/bin/env node

/**
 * CORS Configuration Test Script
 * Tests various CORS scenarios to ensure proper configuration
 */

const fetch = require('node-fetch');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const TEST_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://malicious-site.com',
  'https://yourdomain.com',
  'null'
];

class CorsTester {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.testResults = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${timestamp} ${prefix} ${message}`);
  }

  async testCorsOrigin(origin, endpoint = '/health') {
    this.log(`Testing CORS for origin: ${origin}`);
    
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Origin': origin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });

      const corsHeaders = {
        'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
        'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
        'access-control-allow-headers': response.headers.get('access-control-allow-headers'),
        'access-control-allow-credentials': response.headers.get('access-control-allow-credentials'),
        'access-control-max-age': response.headers.get('access-control-max-age')
      };

      const result = {
        origin,
        status: response.status,
        allowed: corsHeaders['access-control-allow-origin'] === origin || 
                corsHeaders['access-control-allow-origin'] === '*',
        corsHeaders,
        success: response.ok
      };

      this.testResults.push(result);
      
      if (result.success && result.allowed) {
        this.log(`✅ Origin ${origin} allowed`, 'success');
      } else if (!result.success && response.status === 403) {
        this.log(`❌ Origin ${origin} blocked (expected for unauthorized origins)`, 'error');
      } else {
        this.log(`⚠️  Unexpected response for origin ${origin}: ${response.status}`, 'error');
      }

      return result;
    } catch (error) {
      this.log(`❌ Error testing origin ${origin}: ${error.message}`, 'error');
      const result = {
        origin,
        error: error.message,
        success: false
      };
      this.testResults.push(result);
      return result;
    }
  }

  async testPreflight(origin) {
    this.log(`Testing preflight request for origin: ${origin}`);
    
    try {
      const response = await fetch(`${this.baseUrl}/api/payment`, {
        method: 'OPTIONS',
        headers: {
          'Origin': origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type,Authorization'
        }
      });

      const result = {
        origin,
        method: 'OPTIONS',
        status: response.status,
        headers: {
          'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
          'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
          'access-control-allow-headers': response.headers.get('access-control-allow-headers')
        },
        success: response.status === 200 || response.status === 204
      };

      if (result.success) {
        this.log(`✅ Preflight request successful for ${origin}`, 'success');
      } else {
        this.log(`❌ Preflight request failed for ${origin}: ${response.status}`, 'error');
      }

      return result;
    } catch (error) {
      this.log(`❌ Error in preflight for ${origin}: ${error.message}`, 'error');
      return { origin, error: error.message, success: false };
    }
  }

  async testApiEndpoint(origin) {
    this.log(`Testing API endpoint with origin: ${origin}`);
    
    try {
      const response = await fetch(`${this.baseUrl}/api/payment`, {
        method: 'POST',
        headers: {
          'Origin': origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          meter_id: 'TEST-001',
          amount: 10,
          userId: 'test-user'
        })
      });

      const result = {
        origin,
        endpoint: '/api/payment',
        status: response.status,
        success: response.ok || response.status === 429, // Rate limit is OK
        headers: {
          'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
          'x-rate-limit-remaining': response.headers.get('x-rate-limit-remaining')
        }
      };

      if (result.success) {
        this.log(`✅ API endpoint accessible for ${origin}`, 'success');
      } else {
        this.log(`❌ API endpoint blocked for ${origin}: ${response.status}`, 'error');
      }

      return result;
    } catch (error) {
      this.log(`❌ Error testing API endpoint for ${origin}: ${error.message}`, 'error');
      return { origin, error: error.message, success: false };
    }
  }

  async testRateLimitHeaders() {
    this.log('Testing rate limit headers');
    
    try {
      const response = await fetch(`${this.baseUrl}/api/payment`, {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:3000',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          meter_id: 'TEST-001',
          amount: 10,
          userId: 'rate-limit-test'
        })
      });

      const rateLimitHeaders = {
        'x-rate-limit-remaining': response.headers.get('x-rate-limit-remaining'),
        'access-control-expose-headers': response.headers.get('access-control-expose-headers')
      };

      this.log(`Rate limit remaining: ${rateLimitHeaders['x-rate-limit-remaining']}`);
      this.log(`Exposed headers: ${rateLimitHeaders['access-control-expose-headers']}`);

      return {
        success: true,
        headers: rateLimitHeaders
      };
    } catch (error) {
      this.log(`❌ Error testing rate limit headers: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  async runAllTests() {
    this.log('🚀 Starting CORS configuration tests');
    this.log(`Testing against API: ${this.baseUrl}`);
    
    // Test basic CORS for different origins
    this.log('\n📋 Testing basic CORS headers...');
    for (const origin of TEST_ORIGINS) {
      await this.testCorsOrigin(origin);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
    }

    // Test preflight requests
    this.log('\n📋 Testing preflight requests...');
    await this.testPreflight('http://localhost:3000');
    await this.testPreflight('https://malicious-site.com');

    // Test API endpoints
    this.log('\n📋 Testing API endpoints...');
    await this.testApiEndpoint('http://localhost:3000');
    await this.testApiEndpoint('https://malicious-site.com');

    // Test rate limit headers
    this.log('\n📋 Testing rate limit headers...');
    await this.testRateLimitHeaders();

    // Generate summary
    this.generateSummary();
  }

  generateSummary() {
    this.log('\n📊 Test Results Summary');
    this.log('========================');
    
    const totalTests = this.testResults.length;
    const successfulTests = this.testResults.filter(r => r.success).length;
    const allowedOrigins = this.testResults.filter(r => r.allowed).length;
    
    this.log(`Total tests: ${totalTests}`);
    this.log(`Successful: ${successfulTests}`);
    this.log(`Allowed origins: ${allowedOrigins}`);
    
    // Check for expected behavior
    const localhostAllowed = this.testResults.find(r => 
      r.origin === 'http://localhost:3000' && r.success
    );
    const maliciousBlocked = this.testResults.find(r => 
      r.origin === 'https://malicious-site.com' && !r.success
    );
    
    if (localhostAllowed) {
      this.log('✅ localhost correctly allowed', 'success');
    } else {
      this.log('❌ localhost should be allowed in development', 'error');
    }
    
    if (maliciousBlocked) {
      this.log('✅ malicious origins correctly blocked', 'success');
    } else {
      this.log('❌ malicious origins should be blocked', 'error');
    }
    
    this.log('\n🎯 CORS Configuration Status');
    if (localhostAllowed && maliciousBlocked) {
      this.log('✅ CORS configuration is working correctly!', 'success');
    } else {
      this.log('❌ CORS configuration needs attention', 'error');
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new CorsTester(API_BASE_URL);
  
  tester.runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = CorsTester;
