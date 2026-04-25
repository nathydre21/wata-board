# Data Retention Policy - Wata Board

This policy outlines how long we retain different types of data within the Wata Board application.

## 1. User Account Data
* **Retention Period**: Until account deletion.
* **Deletion Process**: Upon user request or account closure, all personal identifiable information (PII) is removed within 30 days.

## 2. Financial Transaction Data
* **Retention Period**: 7 years.
* **Reason**: Legal compliance and tax purposes.
* **Storage**: Encrypted archive after 2 years of inactivity.

## 3. Audit Logs (Security & Transactions)
* **Retention Period**: 1 year (365 days).
* **Storage**: Dedicated audit log files rotated daily.
* **Cleanup**: Automated script removes logs older than 365 days.

## 4. Application Logs (Debugging)
* **Retention Period**: 14 days.
* **Reason**: Operational monitoring and troubleshooting.
* **Cleanup**: Winston `DailyRotateFile` automatic cleanup.

## 5. Temporary / Cache Data
* **Retention Period**: 24 hours to 30 days depending on type.
* **Cleanup**: Automatic expiration or scheduled cleanup tasks.

## 6. Data Governance
Wata Board is committed to the principle of data minimization. We only collect and retain data that is necessary for the operation of the service and legal compliance.
