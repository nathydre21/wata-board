export enum KYCStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED'
}

export interface KYCData {
  userId: string;
  status: KYCStatus;
  verifiedAt?: Date;
  idDocumentType?: string;
}

export class KYCService {
  private kycRegistry: Map<string, KYCData> = new Map();

  /**
   * Check if a user is KYC verified
   */
  async isVerified(userId: string): Promise<boolean> {
    const data = this.kycRegistry.get(userId);
    return data?.status === KYCStatus.VERIFIED;
  }

  /**
   * Submit KYC verification request
   */
  async submitKYC(userId: string, documentType: string): Promise<KYCData> {
    const kycData: KYCData = {
      userId,
      status: KYCStatus.PENDING,
      idDocumentType: documentType
    };
    this.kycRegistry.set(userId, kycData);
    
    // Simulate async verification process
    setTimeout(() => {
      this.verifyUser(userId);
    }, 5000);

    return kycData;
  }

  /**
   * Internal method to verify user (mocking automated check)
   */
  private verifyUser(userId: string) {
    const data = this.kycRegistry.get(userId);
    if (data) {
      data.status = KYCStatus.VERIFIED;
      data.verifiedAt = new Date();
      this.kycRegistry.set(userId, data);
    }
  }

  /**
   * Perform AML check for a transaction
   */
  async performAMLCheck(userId: string, amount: number): Promise<boolean> {
    // Threshold for suspicious activity
    const AML_THRESHOLD = 10000;
    
    if (amount > AML_THRESHOLD) {
      console.warn(`AML ALERT: High value transaction of ${amount} for user ${userId}`);
      // In a real system, this would trigger manual review or freeze the transaction
      return false;
    }
    
    return true;
  }

  /**
   * Get KYC status for a user
   */
  async getStatus(userId: string): Promise<KYCStatus> {
    const data = this.kycRegistry.get(userId);
    return data?.status || KYCStatus.NOT_STARTED;
  }
}

export const kycService = new KYCService();
