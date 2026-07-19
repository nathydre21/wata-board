#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class CodeSecurityScanner {
  constructor() {
    this.scanResults = {
      timestamp: new Date().toISOString(),
      filesScanned: 0,
      linesScanned: 0,
      issuesFound: 0,
      severity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      categories: {
        injection: 0,
        xss: 0,
        authentication: 0,
        cryptography: 0,
        configuration: 0,
        sensitive_data: 0
      },
      issues: [],
      recommendations: []
    };
  }

  async scanCodebase() {
    console.log('🔍 Scanning codebase for security issues...\n');
    
    const sourceDirectories = [
      '../backend/src',
      '../frontend/src'
    ];

    for (const dir of sourceDirectories) {
      await this.scanDirectory(dir);
    }

    this.analyzeResults();
    this.generateRecommendations();
    this.saveResults();
    this.displayResults();
    
    return this.scanResults;
  }

  async scanDirectory(dirPath) {
    const fullPath = path.resolve(__dirname, dirPath);
    
    if (!fs.existsSync(fullPath)) {
      console.warn(`Warning: Directory ${dirPath} not found`);
      return;
    }

    console.log(`Scanning ${dirPath}...`);
    
    const files = this.getAllFiles(fullPath);
    
    for (const file of files) {
      await this.scanFile(file);
    }
  }

  getAllFiles(dir) {
    const files = [];
    
    if (!fs.existsSync(dir)) {
      return files;
    }

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else if (this.isCodeFile(item)) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  isCodeFile(filename) {
    const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.vue', '.svelte'];
    return codeExtensions.some(ext => filename.endsWith(ext));
  }

  async scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      this.scanResults.filesScanned++;
      this.scanResults.linesScanned += lines.length;
      
      // Scan each line for security issues
      lines.forEach((line, index) => {
        this.checkSecurityPatterns(line, index + 1, filePath);
      });
      
      // Check for multi-line security issues
      this.checkMultiLinePatterns(content, filePath);
      
    } catch (error) {
      console.warn(`Warning: Could not scan ${filePath}:`, error.message);
    }
  }

  checkSecurityPatterns(line, lineNumber, filePath) {
    const patterns = [
      // Injection vulnerabilities
      {
        pattern: /eval\s*\(/,
        severity: 'critical',
        category: 'injection',
        title: 'Use of eval() function',
        description: 'eval() can execute arbitrary code and is a major security risk'
      },
      {
        pattern: /new\s+Function\s*\(/,
        severity: 'critical',
        category: 'injection',
        title: 'Dynamic function creation',
        description: 'Creating functions from strings can lead to code injection'
      },
      {
        pattern: /setTimeout\s*\(\s*['"`]/,
        severity: 'high',
        category: 'injection',
        title: 'setTimeout with string argument',
        description: 'setTimeout with string arguments can lead to code injection'
      },
      {
        pattern: /setInterval\s*\(\s*['"`]/,
        severity: 'high',
        category: 'injection',
        title: 'setInterval with string argument',
        description: 'setInterval with string arguments can lead to code injection'
      },

      // XSS vulnerabilities
      {
        pattern: /innerHTML\s*=/,
        severity: 'high',
        category: 'xss',
        title: 'Direct innerHTML assignment',
        description: 'innerHTML assignment without sanitization can lead to XSS'
      },
      {
        pattern: /outerHTML\s*=/,
        severity: 'high',
        category: 'xss',
        title: 'Direct outerHTML assignment',
        description: 'outerHTML assignment without sanitization can lead to XSS'
      },
      {
        pattern: /document\.write\s*\(/,
        severity: 'high',
        category: 'xss',
        title: 'Use of document.write()',
        description: 'document.write() can lead to XSS vulnerabilities'
      },

      // Sensitive data exposure
      {
        pattern: /password\s*=\s*['"`][^'"`]{3,}/,
        severity: 'high',
        category: 'sensitive_data',
        title: 'Hardcoded password',
        description: 'Passwords should not be hardcoded in source code'
      },
      {
        pattern: /secret\s*=\s*['"`][^'"`]{3,}/,
        severity: 'high',
        category: 'sensitive_data',
        title: 'Hardcoded secret',
        description: 'Secrets should not be hardcoded in source code'
      },
      {
        pattern: /api[_-]?key\s*=\s*['"`][^'"`]{3,}/,
        severity: 'high',
        category: 'sensitive_data',
        title: 'Hardcoded API key',
        description: 'API keys should not be hardcoded in source code'
      },
      {
        pattern: /token\s*=\s*['"`][^'"`]{10,}/,
        severity: 'medium',
        category: 'sensitive_data',
        title: 'Potential hardcoded token',
        description: 'Tokens should not be hardcoded in source code'
      },

      // Cryptographic issues
      {
        pattern: /md5\s*\(/,
        severity: 'medium',
        category: 'cryptography',
        title: 'Use of MD5 hash',
        description: 'MD5 is cryptographically broken and should not be used for security'
      },
      {
        pattern: /sha1\s*\(/,
        severity: 'medium',
        category: 'cryptography',
        title: 'Use of SHA1 hash',
        description: 'SHA1 is considered weak and should not be used for security'
      },

      // Debug information
      {
        pattern: /console\.log\s*\(/,
        severity: 'low',
        category: 'configuration',
        title: 'Console log in production code',
        description: 'Console logs can leak sensitive information in production'
      },
      {
        pattern: /console\.error\s*\(/,
        severity: 'low',
        category: 'configuration',
        title: 'Console error in production code',
        description: 'Console errors can leak sensitive information in production'
      },

      // Authentication issues
      {
        pattern: /jwt\.sign\s*\(\s*[^,]+,\s*['"`][^'"`]{3,}/,
        severity: 'medium',
        category: 'authentication',
        title: 'Hardcoded JWT secret',
        description: 'JWT secrets should not be hardcoded'
      },
      {
        pattern: /bcrypt\.compare\s*\(\s*['"`][^'"`]+/i,
        severity: 'medium',
        category: 'authentication',
        title: 'Hardcoded password in comparison',
        description: 'Passwords should not be hardcoded for comparison'
      }
    ];

    for (const pattern of patterns) {
      if (pattern.pattern.test(line)) {
        this.addIssue({
          id: this.generateIssueId(),
          severity: pattern.severity,
          category: pattern.category,
          title: pattern.title,
          description: pattern.description,
          file: filePath,
          line: lineNumber,
          code: line.trim()
        });
      }
    }
  }

  checkMultiLinePatterns(content, filePath) {
    // Check for SQL injection patterns
    const sqlPatterns = [
      {
        pattern: /query\s*\(\s*['"`][^'"`]*\$\s*{[^}]*}/g,
        severity: 'high',
        category: 'injection',
        title: 'SQL injection vulnerability',
        description: 'Direct string interpolation in SQL queries can lead to injection'
      },
      {
        pattern: /execute\s*\(\s*['"`][^'"`]*\+/g,
        severity: 'high',
        category: 'injection',
        title: 'SQL injection vulnerability',
        description: 'String concatenation in SQL queries can lead to injection'
      }
    ];

    for (const pattern of sqlPatterns) {
      const matches = content.match(pattern.pattern);
      if (matches) {
        matches.forEach((match, index) => {
          const lines = content.split('\n');
          const lineIndex = lines.findIndex(line => line.includes(match));
          
          if (lineIndex !== -1) {
            this.addIssue({
              id: this.generateIssueId(),
              severity: pattern.severity,
              category: pattern.category,
              title: pattern.title,
              description: pattern.description,
              file: filePath,
              line: lineIndex + 1,
              code: match
            });
          }
        });
      }
    }
  }

  addIssue(issue) {
    this.scanResults.issues.push(issue);
    this.scanResults.issuesFound++;
    this.scanResults.severity[issue.severity]++;
    this.scanResults.categories[issue.category]++;
  }

  generateIssueId() {
    return `CODE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  analyzeResults() {
    console.log('\n📊 Analyzing scan results...');
    
    // Calculate security metrics
    const criticalIssues = this.scanResults.severity.critical;
    const highIssues = this.scanResults.severity.high;
    const totalIssues = this.scanResults.issuesFound;
    
    // Risk assessment
    if (criticalIssues > 0) {
      this.scanResults.riskLevel = 'critical';
    } else if (highIssues > 0) {
      this.scanResults.riskLevel = 'high';
    } else if (totalIssues > 5) {
      this.scanResults.riskLevel = 'medium';
    } else if (totalIssues > 0) {
      this.scanResults.riskLevel = 'low';
    } else {
      this.scanResults.riskLevel = 'minimal';
    }
    
    // Security score
    this.scanResults.securityScore = this.calculateSecurityScore();
  }

  calculateSecurityScore() {
    let score = 100;
    
    // Deduct points based on severity
    score -= this.scanResults.severity.critical * 25;
    score -= this.scanResults.severity.high * 15;
    score -= this.scanResults.severity.medium * 8;
    score -= this.scanResults.severity.low * 3;
    
    // Additional deductions for certain categories
    score -= this.scanResults.categories.injection * 10;
    score -= this.scanResults.categories.xss * 8;
    score -= this.scanResults.categories.sensitive_data * 12;
    
    return Math.max(0, Math.min(100, score));
  }

  generateRecommendations() {
    console.log('\n💡 Generating security recommendations...');
    
    const recommendations = [];
    
    // Critical issues
    if (this.scanResults.severity.critical > 0) {
      recommendations.push({
        priority: 'critical',
        title: 'Fix Critical Security Vulnerabilities',
        description: `Found ${this.scanResults.severity.critical} critical issues that require immediate attention`,
        actions: [
          'Remove all eval() and dynamic function creation',
          'Implement proper input validation and sanitization',
          'Use parameterized queries for database operations'
        ]
      });
    }
    
    // High severity issues
    if (this.scanResults.severity.high > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Address High-Severity Security Issues',
        description: `Found ${this.scanResults.severity.high} high-severity security issues`,
        actions: [
          'Remove hardcoded credentials and secrets',
          'Implement proper XSS protection',
          'Use secure authentication methods'
        ]
      });
    }
    
    // Injection vulnerabilities
    if (this.scanResults.categories.injection > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Prevent Injection Attacks',
        description: `Found ${this.scanResults.categories.injection} potential injection vulnerabilities`,
        actions: [
          'Use prepared statements or parameterized queries',
          'Validate and sanitize all user inputs',
          'Avoid dynamic code execution'
        ]
      });
    }
    
    // XSS vulnerabilities
    if (this.scanResults.categories.xss > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Prevent XSS Attacks',
        description: `Found ${this.scanResults.categories.xss} potential XSS vulnerabilities`,
        actions: [
          'Use textContent instead of innerHTML when possible',
          'Sanitize HTML content before rendering',
          'Implement Content Security Policy (CSP)'
        ]
      });
    }
    
    // Sensitive data exposure
    if (this.scanResults.categories.sensitive_data > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Protect Sensitive Data',
        description: `Found ${this.scanResults.categories.sensitive_data} instances of sensitive data exposure`,
        actions: [
          'Remove all hardcoded credentials',
          'Use environment variables for secrets',
          'Implement proper key management'
        ]
      });
    }
    
    // General improvements
    recommendations.push({
      priority: 'medium',
      title: 'Implement Security Best Practices',
      description: 'General security improvements for the codebase',
      actions: [
        'Set up automated security scanning in CI/CD',
        'Implement code review processes with security focus',
        'Train development team on secure coding practices',
        'Use security linters and static analysis tools'
      ]
    });
    
    this.scanResults.recommendations = recommendations;
  }

  saveResults() {
    const reportsDir = path.resolve(__dirname, '../reports');
    
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportPath = path.join(reportsDir, `code-security-scan-${Date.now()}.json`);
    const latestPath = path.join(reportsDir, 'latest-code-security-scan.json');
    
    fs.writeFileSync(reportPath, JSON.stringify(this.scanResults, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(this.scanResults, null, 2));
    
    console.log(`\n📄 Code security scan report saved to: ${reportPath}`);
  }

  displayResults() {
    console.log('\n🎯 Code Security Scan Results');
    console.log('==============================');
    console.log(`Files Scanned: ${this.scanResults.filesScanned}`);
    console.log(`Lines Scanned: ${this.scanResults.linesScanned}`);
    console.log(`Issues Found: ${this.scanResults.issuesFound}`);
    console.log(`Security Score: ${this.scanResults.securityScore}/100`);
    console.log(`Risk Level: ${this.scanResults.riskLevel?.toUpperCase()}`);
    
    console.log('\n📊 Severity Breakdown:');
    console.log(`Critical: ${this.scanResults.severity.critical}`);
    console.log(`High: ${this.scanResults.severity.high}`);
    console.log(`Medium: ${this.scanResults.severity.medium}`);
    console.log(`Low: ${this.scanResults.severity.low}`);
    
    console.log('\n📋 Category Breakdown:');
    Object.entries(this.scanResults.categories).forEach(([category, count]) => {
      if (count > 0) {
        console.log(`${category}: ${count}`);
      }
    });
    
    if (this.scanResults.issuesFound > 0) {
      console.log('\n🚨 Critical and High Issues:');
      this.scanResults.issues
        .filter(issue => issue.severity === 'critical' || issue.severity === 'high')
        .slice(0, 10)
        .forEach(issue => {
          console.log(`\n[${issue.severity.toUpperCase()}] ${issue.title}`);
          console.log(`File: ${issue.file}:${issue.line}`);
          console.log(`Description: ${issue.description}`);
          console.log(`Code: ${issue.code}`);
        });
      
      if (this.scanResults.issues.filter(i => i.severity === 'critical' || i.severity === 'high').length > 10) {
        console.log(`\n... and ${this.scanResults.issues.filter(i => i.severity === 'critical' || i.severity === 'high').length - 10} more critical/high issues`);
      }
    }
    
    console.log('\n💡 Top Recommendations:');
    this.scanResults.recommendations.slice(0, 3).forEach((rec, index) => {
      console.log(`${index + 1}. ${rec.title} (${rec.priority})`);
      console.log(`   ${rec.description}`);
    });
    
    if (this.scanResults.issuesFound === 0) {
      console.log('\n✅ No security issues found in the codebase!');
    }
  }
}

// Run the scanner
if (require.main === module) {
  const scanner = new CodeSecurityScanner();
  scanner.scanCodebase().catch(console.error);
}

module.exports = CodeSecurityScanner;
