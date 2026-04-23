// Fixed path: added ../ to go up one level from 'src' to find 'packages'
import * as NepaClient from '../packages/nepa_client_v2';
import { Keypair } from '@stellar/stellar-sdk';
import { envConfig } from './utils/env';
import { getCurrentNetworkConfig } from './utils/network-config';

async function main() {
    // Get current network configuration
    const networkConfig = getCurrentNetworkConfig();
    
    const client = new NepaClient.Client({
        networkPassphrase: networkConfig.networkPassphrase,
        contractId: networkConfig.contractId,
        rpcUrl: networkConfig.rpcUrl,
    });

    // Admin secret key is validated at startup by envConfig
    const adminKeypair = Keypair.fromSecret(envConfig.ADMIN_SECRET_KEY);

    const meterId = "METER-001";

    console.log(`Processing payment on ${networkConfig.networkPassphrase.includes('Test') ? 'Testnet' : 'Mainnet'}...`);

    // Amount as u32 (matches contract)
    const amount = 10;

    const tx = await client.pay_bill({
        meter_id: meterId,
        amount: amount
    });

    await tx.signAndSend({
        signTransaction: async (transaction: any) => {
            transaction.sign(adminKeypair);
            return transaction.toXDR();
        }
    });

    const total = await client.get_total_paid({ meter_id: meterId });

    // Convert result to readable number
    const formattedTotal = Number(total.result);
    console.log(`Payment successful! Total recorded for ${meterId}: ${formattedTotal} XLM`);
    console.log(`Network: ${networkConfig.networkPassphrase.includes('Test') ? 'Testnet' : 'Mainnet'}`);
    console.log(`Contract ID: ${networkConfig.contractId}`);
}

main().catch(console.error);