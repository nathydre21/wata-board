import * as NepaClient from './packages/nepa_client';
import { Keypair } from '@stellar/stellar-sdk';

async function main() {
    // 1. Initialize the client
    // The bindings automatically know the contract ID and network from Step 4.2
    const client = new NepaClient.Client({
        ...NepaClient.networks.testnet,
        rpcUrl: 'https://soroban-testnet.stellar.org:443',
    });

    const adminSecret = "SBJZL75I3EUN4WUWO6TPMJGYZH5SYQDU4SZRNL2AVH5I3XPYAWXPZIOV"; 
    
    const adminKeypair = Keypair.fromSecret(adminSecret);

    const meterId = "METER-001";

    console.log(`Checking balance for ${meterId}...`);
    
    // 3. Call the 'get_total_paid' function (Read-only)
    const initialBalance = await client.get_total_paid({ meter_id: meterId });
    console.log(`Current Total Paid: ${initialBalance.result}`);

    console.log(`Processing new payment of 1500 for ${meterId}...`);

    // 4. Call the 'pay_bill' function (Write/Transaction)
    const tx = await client.pay_bill({ 
        meter_id: meterId, 
        amount: 1500 
    });

    // Sign and send the transaction
    const { result } = await tx.signAndSend({
        signTransaction: async (tx) => {
            tx.sign(adminKeypair);
            return tx.toXDR();
        }
    });

    console.log("Payment successful!");

    // 5. Verify the new total
    const finalBalance = await client.get_total_paid({ meter_id: meterId });
    console.log(`New Total Paid: ${finalBalance.result}`);
}

main().catch(console.error);