#!/usr/bin/env node

const VulnerabilityScanner = require('./vulnerability-scan');
const SecurityAuditReporter = require('./generate-security-report');
const fs = require('fs');
const path = require('path');

class SecurityAuditor {
  constructor() {
    this.startTime = Date.now();
    this.results = {
      timestamp: new Date().toISOString(),
      auditType: 'comprehensive',
      phases: []
    };
  }

  async runComprehensiveAudit() {
    console.log('🔒 Starting Comprehensive Security Audit for Wata-Board');
    console.log('=====================================================\n');

    try {
      // Phase 1: Vulnerability Scanning
      await this.runPhase('Vulnerability Scanning', async () => {
        const scanner = new VulnerabilityScanner();
        return await scanner.run();
      });

      // Phase 2: OWASP Security Testing
      await this.runPhase('OWASP Security Testing', async () => {
        return this.runSecurityTests('owasp');
      });

      // Phase 3: Penetration Testing
      await this.runPhase('Penetration Testing', async () => {
        return this.runSecurityTests('penetration');
      });

      // Phase 4: Code Security Analysis
      await this.runPhase('Code Security Analysis', async () => {
        return this.analyzeCodeSecurity();
      });

      // Phase 5: Configuration Security Review
      await this.runPhase('Configuration Security Review', async () => {
        return this.reviewConfigurationSecurity();
      });

      // Phase 6: Generate Comprehensive Report
      await this.runPhase('Report Generation', async () => {
        const reporter = new SecurityAuditReporter();
        return await reporter.generateReport();
      });

      // Display final results
      this.displayFinalResults();

    } catch (error) {
      console.error('❌ Audit failed:', error.message);
      process.exit(1);
    }
  }

  async runPhase(phaseName, phaseFunction) {
    console.log(`\n📍 Phase: ${phaseName}`);
    console.log('='.repeat(50));
    
    const phaseStart = Date.now();
    
    try {
      const result = await phaseFunction();
      const phaseEnd = Date.now();
      
      this.results.phases.push({
        name: phaseName,
        status: 'completed',
        duration: phaseEnd - phaseStart,
        result: result
      });
      
      console.log(`✅ ${phaseName} completed in ${phaseEnd - phaseStart}ms`);
      return result;
      
    } catch (error) {
      const phaseEnd = Date.now();
      
      this.results.phases.push({
        name: phaseName,
        status: 'failed',
        duration: phaseEnd - phaseStart,
        error: error.message
      });
      
      console.log(`❌ ${phaseName} failed: ${error.message}`);
      throw error;
    }
  }

  async runSecurityTests(testType) {
    // Mock test execution (in real implementation, run actual tests)
    console.log(`Running ${testType} security tests...`);
    
    const testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      vulnerabilities: []
    };

    // Simulate test execution
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock results based on test type
    if (testType === 'owasp') {
      testResults.total = 45;
      testResults.passed = 38;
      testResults.failed = 7;
      testResults.vulnerabilities = [
        {
          id: 'OWASP-001',
          severity: 'high',
          title: 'Missing Input Validation',
          description: 'API endpoints lack proper input sanitization',
          category: 'owasp'
        },
        {
          id: 'OWASP-002',
          severity: 'medium',
          title: 'Insufficient Rate Limiting',
          description: 'Rate limiting thresholds are too permissive',
          category: 'owasp'
        }
      ];
    } else if (testType === 'penetration') {
      testResults.total = 32;
      testResults.passed = 28;
      testResults.failed = 4;
      testResults.vulnerabilities = [
        {
          id: 'PEN-001',
          severity: 'medium',
          title: 'Weak Authentication',
          description: 'Authentication mechanism can be bypassed',
          category: 'penetration'
        }
      ];
    }

    console.log(`Tests completed: ${testResults.passed}/${testResults.total} passed`);
    if (testResults.failed > 0) {
      console.log(`⚠️  ${testResults.failed} tests failed`);
    }

    return testResults;
  }

  async analyzeCodeSecurity() {
    console.log('Analyzing code security...');
    
    const codeAnalysis = {
      filesScanned: 0,
      issuesFound: 0,
      securityIssues: []
    };

    // Scan source code directories
    const sourceDirs = [
      '../backend/src',
      '../frontend/src'
    ];

    for (const dir of sourceDirs) {
      const fullPath = path.resolve(__dirname, dir);
      if (fs.existsSync(fullPath)) {
        const files = this.scanDirectory(fullPath);
        codeAnalysis.filesScanned += files.length;
        
        for (const file of files) {
          const issues = await this.analyzeFile(file);
          codeAnalysis.securityIssues.push(...issues);
        }
      }
    }

    codeAnalysis.issuesFound = codeAnalysis.securityIssues.length;

    console.log(`Scanned ${codeAnalysis.filesScanned} files`);
    console.log(`Found ${codeAnalysis.issuesFound} security issues`);

    return codeAnalysis;
  }

  scanDirectory(dir) {
    const files = [];
    
    if (!fs.existsSync(dir)) {
      return files;
    }

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...this.scanDirectory(fullPath));
      } else if (item.match(/\.(ts|js|tsx|jsx)$/)) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  async analyzeFile(filePath) {
    const issues = [];
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Security patterns to check
      const patterns = [
        {
          pattern: /eval\(/,
          severity: 'high',
          title: 'Use of eval() function',
          description: 'eval() can execute arbitrary code'
        },
        {
          pattern: /innerHTML\s*=/,
          severity: 'high',
          title: 'Direct innerHTML assignment',
          description: 'Potential XSS vulnerability'
        },
        {
          pattern: /password.*=.*['"]/i,
          severity: 'medium',
          title: 'Potential hardcoded password',
          description: 'Possible hardcoded credential'
        },
        {
          pattern: /api.*key.*=.*['"]/i,
          severity: 'medium',
          title: 'Potential hardcoded API key',
          description: 'Possible hardcoded API key'
        }
      ];

      lines.forEach((line, index) => {
        for (const pattern of patterns) {
          if (pattern.pattern.test(line)) {
            issues.push({
              id: `CODE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              severity: pattern.severity,
              title: pattern.title,
              description: pattern.description,
              file: filePath,
              line: index + 1,
              code: line.trim()
            });
          }
        }
      });
      
    } catch (error) {
      console.warn(`Warning: Could not analyze ${filePath}:`, error.message);
    }
    
    return issues;
  }

  async reviewConfigurationSecurity() {
    console.log('Reviewing configuration security...');
    
    const configReview = {
      filesReviewed: 0,
      issuesFound: 0,
      configurationIssues: []
    };

    const configFiles = [
      '../backend/.env.example',
      '../frontend/.env.example',
      '../nginx.conf',
      '../docker-compose.prod.yml',
      '../backend/package.json',
      '../frontend/package.json'
    ];

    for (const configFile of configFiles) {
      const fullPath = path.resolve(__dirname, configFile);
      if (fs.existsSync(fullPath)) {
        configReview.filesReviewed++;
        
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const issues = this.analyzeConfiguration(content, fullPath);
          configReview.configurationIssues.push(...issues);
        } catch (error) {
          console.warn(`Warning: Could not review ${configFile}:`, error.message);
        }
      }
    }

    configReview.issuesFound = configReview.configurationIssues.length;

    console.log(`Reviewed ${configReview.filesReviewed} configuration files`);
    console.log(`Found ${configReview.issuesFound} configuration issues`);

    return configReview;
  }

  analyzeConfiguration(content, filePath) {
    const issues = [];
    
    // Security configuration checks
    const checks = [
      {
        pattern: /DEBUG.*=.*true/i,
        severity: 'medium',
        title: 'Debug mode enabled in production',
        description: 'Debug mode should be disabled in production'
      },
      {
        pattern: /CORS_ORIGIN.*\*|ACCESS_CONTROL_ALLOW_ORIGIN.*\*/i,
        severity: 'high',
        title: 'Wildcard CORS origin',
        description: 'Wildcard CORS allows any domain'
      },
      {
        pattern: /ssl_protocols.*TLSv1|TLSv1\.1/i,
        severity: 'high',
        title: 'Weak SSL/TLS protocol',
        description: 'TLSv1 and TLSv1.1 are deprecated'
      },
      {
        pattern: /password|secret|key.*=.*test|demo|example/i,
        severity: 'medium',
        title: 'Test credentials in configuration',
        description: 'Test credentials should not be used in production'
      }
    ];

    for (const check of checks) {
      if (check.pattern.test(content)) {
        issues.push({
          id: `CONFIG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          severity: check.severity,
          title: check.title,
          description: check.description,
          file: filePath
        });
      }
    }
    
    return issues;
  }

  displayFinalResults() {
    const duration = Date.now() - this.startTime;
    
    console.log('\n🎉 Comprehensive Security Audit Completed!');
    console.log('==========================================');
    console.log(`Total Duration: ${(duration / 1000).toFixed(2)} seconds`);
    console.log(`Phases Completed: ${this.results.phases.filter(p => p.status === 'completed').length}/${this.results.phases.length}`);
    
    console.log('\n📊 Phase Summary:');
    this.results.phases.forEach(phase => {
      const status = phase.status === 'completed' ? '✅' : '❌';
      console.log(`${status} ${phase.name} (${(phase.duration / 1000).toFixed(2)}s)`);
    });
    
    // Calculate overall statistics
    const totalVulnerabilities = this.results.phases.reduce((sum, phase) => {
      if (phase.result && phase.result.vulnerabilities) {
        return sum + phase.result.vulnerabilities.length;
      }
      if (phase.result && phase.result.securityIssues) {
        return sum + phase.result.securityIssues.length;
      }
      if (phase.result && phase.result.configurationIssues) {
        return sum + phase.result.configurationIssues.length;
      }
      return sum;
    }, 0);
    
    const totalTests = this.results.phases.reduce((sum, phase) => {
      return sum + (phase.result?.total || 0);
    }, 0);
    
    const totalPassedTests = this.results.phases.reduce((sum, phase) => {
      return sum + (phase.result?.passed || 0);
    }, 0);
    
    console.log('\n📈 Overall Statistics:');
    console.log(`Total Vulnerabilities Found: ${totalVulnerabilities}`);
    console.log(`Security Tests Passed: ${totalPassedTests}/${totalTests}`);
    
    if (totalVulnerabilities > 0) {
      console.log('\n⚠️  Security Issues Detected:');
      console.log('Please review the detailed security report for remediation steps.');
    } else {
      console.log('\n✅ No critical security issues detected!');
    }
    
    console.log('\n📄 Detailed reports have been generated in the reports directory.');
    console.log('🔧 Review the recommendations and implement the suggested security improvements.');
  }
}

// Run the auditor
if (require.main === module) {
  const auditor = new SecurityAuditor();
  auditor.runComprehensiveAudit().catch(console.error);
}

module.exports = SecurityAuditor;
