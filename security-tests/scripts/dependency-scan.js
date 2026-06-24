#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

class DependencyScanner {
  constructor() {
    this.scanResults = {
      timestamp: new Date().toISOString(),
      totalPackages: 0,
      vulnerablePackages: 0,
      dependencies: [],
      recommendations: []
    };
  }

  async scanAllDependencies() {
    console.log('🔍 Scanning all project dependencies for vulnerabilities...\n');
    
    const packageFiles = [
      '../backend/package.json',
      '../frontend/package.json',
      './package.json'
    ];

    for (const packageFile of packageFiles) {
      await this.scanPackageFile(packageFile);
    }

    await this.checkKnownVulnerabilities();
    this.generateRecommendations();
    this.saveResults();
    this.displayResults();
    
    return this.scanResults;
  }

  async scanPackageFile(packageFile) {
    const fullPath = path.resolve(__dirname, packageFile);
    
    if (!fs.existsSync(fullPath)) {
      console.warn(`Warning: ${packageFile} not found`);
      return;
    }

    console.log(`Scanning ${packageFile}...`);
    
    try {
      const packageData = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const allDeps = {
        ...packageData.dependencies,
        ...packageData.devDependencies,
        ...packageData.peerDependencies
      };

      for (const [name, version] of Object.entries(allDeps)) {
        this.scanResults.dependencies.push({
          name,
          version,
          type: this.getDependencyType(packageData, name),
          file: packageFile
        });
        this.scanResults.totalPackages++;
      }
    } catch (error) {
      console.error(`Error reading ${packageFile}:`, error.message);
    }
  }

  getDependencyType(packageData, dependencyName) {
    if (packageData.dependencies && packageData.dependencies[dependencyName]) {
      return 'production';
    }
    if (packageData.devDependencies && packageData.devDependencies[dependencyName]) {
      return 'development';
    }
    if (packageData.peerDependencies && packageData.peerDependencies[dependencyName]) {
      return 'peer';
    }
    return 'unknown';
  }

  async checkKnownVulnerabilities() {
    console.log('\n🔍 Checking for known vulnerabilities...');
    
    // Known vulnerability database (simplified - in production, use real vulnerability APIs)
    const knownVulns = {
      'axios': [
        {
          id: 'CVE-2023-45857',
          severity: 'high',
          affectedVersions: '<1.6.0',
          title: 'SSRF vulnerability in axios',
          description: 'Server-Side Request Forgery vulnerability'
        }
      ],
      'express': [
        {
          id: 'CVE-2023-36459',
          severity: 'medium',
          affectedVersions: '<4.18.2',
          title: 'Express path traversal',
          description: 'Path traversal vulnerability in Express'
        }
      ],
      'helmet': [
        {
          id: 'CVE-2021-32821',
          severity: 'low',
          affectedVersions: '<4.6.0',
          title: 'Helmet CORS bypass',
          description: 'CORS headers can be bypassed in certain configurations'
        }
      ],
      'cors': [
        {
          id: 'CVE-2019-10742',
          severity: 'medium',
          affectedVersions: '<2.8.5',
          title: 'CORS origin bypass',
          description: 'CORS origin validation can be bypassed'
        }
      ]
    };

    for (const dep of this.scanResults.dependencies) {
      const vulns = knownVulns[dep.name] || [];
      
      for (const vuln of vulns) {
        if (this.isVersionAffected(dep.version, vuln.affectedVersions)) {
          dep.vulnerabilities = dep.vulnerabilities || [];
          dep.vulnerabilities.push(vuln);
          dep.hasVulnerability = true;
          this.scanResults.vulnerablePackages++;
        }
      }
    }
  }

  isVersionAffected(currentVersion, affectedRange) {
    // Simplified version comparison (in production, use semver library)
    if (affectedRange.startsWith('<')) {
      const maxVersion = affectedRange.substring(1);
      return this.compareVersions(currentVersion, maxVersion) < 0;
    }
    return false;
  }

  compareVersions(v1, v2) {
    const parts1 = v1.replace(/[^0-9.]/g, '').split('.').map(Number);
    const parts2 = v2.replace(/[^0-9.]/g, '').split('.').map(Number);
    
    const maxLength = Math.max(parts1.length, parts2.length);
    
    for (let i = 0; i < maxLength; i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;
      
      if (num1 !== num2) {
        return num1 - num2;
      }
    }
    
    return 0;
  }

  generateRecommendations() {
    console.log('\n💡 Generating security recommendations...');
    
    const recommendations = [];
    
    // Recommendations for vulnerable packages
    const vulnerableDeps = this.scanResults.dependencies.filter(d => d.hasVulnerability);
    
    if (vulnerableDeps.length > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Update Vulnerable Dependencies',
        description: `Found ${vulnerableDeps.length} packages with known vulnerabilities`,
        actions: vulnerableDeps.map(dep => 
          `Update ${dep.name} from ${dep.version} to latest stable version`
        )
      });
    }

    // Recommendations for outdated packages
    const outdatedDeps = this.scanResults.dependencies.filter(d => 
      this.isVersionOutdated(d.version)
    );

    if (outdatedDeps.length > 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Update Outdated Dependencies',
        description: `Found ${outdatedDeps.length} outdated packages`,
        actions: outdatedDeps.map(dep => 
          `Consider updating ${dep.name} to a more recent version`
        )
      });
    }

    // Recommendations for security best practices
    const securityPackages = ['helmet', 'cors', 'bcrypt', 'jsonwebtoken'];
    const missingSecurityPackages = securityPackages.filter(pkg => 
      !this.scanResults.dependencies.some(d => d.name === pkg)
    );

    if (missingSecurityPackages.length > 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Add Security Packages',
        description: 'Consider adding security-focused packages',
        actions: missingSecurityPackages.map(pkg => 
          `Add ${pkg} for enhanced security`
        )
      });
    }

    // Recommendations for development dependencies in production
    const devDepsInProduction = this.scanResults.dependencies.filter(d => 
      d.type === 'development' && this.isProductionPackage(d.name)
    );

    if (devDepsInProduction.length > 0) {
      recommendations.push({
        priority: 'low',
        title: 'Review Development Dependencies',
        description: 'Some development dependencies may not be needed in production',
        actions: devDepsInProduction.map(dep => 
          `Consider moving ${dep.name} to devDependencies if not needed in production`
        )
      });
    }

    this.scanResults.recommendations = recommendations;
  }

  isVersionOutdated(version) {
    // Consider versions older than 2 years as outdated
    const currentYear = new Date().getFullYear();
    const versionYear = this.extractYearFromVersion(version);
    return versionYear && (currentYear - versionYear) > 2;
  }

  extractYearFromVersion(version) {
    // This is a simplified approach - in reality, you'd query package registries
    const match = version.match(/20(\d{2})/);
    return match ? parseInt(match[1]) + 2000 : null;
  }

  isProductionPackage(packageName) {
    const commonDevPackages = [
      'jest', 'mocha', 'chai', 'supertest', 'eslint', 'prettier',
      '@types/', 'ts-node', 'nodemon', 'webpack', 'rollup'
    ];
    
    return !commonDevPackages.some(prefix => 
      packageName.startsWith(prefix) || packageName === prefix
    );
  }

  saveResults() {
    const reportsDir = path.resolve(__dirname, '../reports');
    
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportPath = path.join(reportsDir, `dependency-scan-${Date.now()}.json`);
    const latestPath = path.join(reportsDir, 'latest-dependency-scan.json');
    
    fs.writeFileSync(reportPath, JSON.stringify(this.scanResults, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(this.scanResults, null, 2));
    
    console.log(`\n📄 Dependency scan report saved to: ${reportPath}`);
  }

  displayResults() {
    console.log('\n🎯 Dependency Scan Results');
    console.log('==========================');
    console.log(`Total Packages Scanned: ${this.scanResults.totalPackages}`);
    console.log(`Vulnerable Packages: ${this.scanResults.vulnerablePackages}`);
    console.log(`Security Score: ${this.calculateSecurityScore()}/100`);
    
    if (this.scanResults.vulnerablePackages > 0) {
      console.log('\n🚨 Vulnerable Packages:');
      this.scanResults.dependencies
        .filter(d => d.hasVulnerability)
        .forEach(dep => {
          console.log(`\n❌ ${dep.name}@${dep.version}`);
          dep.vulnerabilities.forEach(vuln => {
            console.log(`   ${vuln.severity.toUpperCase()}: ${vuln.title}`);
            console.log(`   ${vuln.description}`);
            console.log(`   Affected versions: ${vuln.affectedVersions}`);
          });
        });
    }
    
    console.log('\n💡 Top Recommendations:');
    this.scanResults.recommendations.slice(0, 3).forEach((rec, index) => {
      console.log(`${index + 1}. ${rec.title} (${rec.priority})`);
      console.log(`   ${rec.description}`);
    });
    
    if (this.scanResults.vulnerablePackages === 0) {
      console.log('\n✅ No known vulnerabilities found in dependencies!');
    }
  }

  calculateSecurityScore() {
    let score = 100;
    
    // Deduct points for vulnerable packages
    score -= this.scanResults.vulnerablePackages * 20;
    
    // Deduct points for outdated packages
    const outdatedCount = this.scanResults.dependencies.filter(d => 
      this.isVersionOutdated(d.version)
    ).length;
    score -= outdatedCount * 5;
    
    // Bonus for having security packages
    const securityPackageCount = this.scanResults.dependencies.filter(d => 
      ['helmet', 'cors', 'bcrypt', 'jsonwebtoken'].includes(d.name)
    ).length;
    score += securityPackageCount * 2;
    
    return Math.max(0, Math.min(100, score));
  }
}

// Run the scanner
if (require.main === module) {
  const scanner = new DependencyScanner();
  scanner.scanAllDependencies().catch(console.error);
}

module.exports = DependencyScanner;
