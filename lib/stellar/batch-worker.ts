/**
 * Background worker for processing Stellar batch payments asynchronously.
 *
 * Called fire-and-forget from the batch-submit route. Updates job state
 * in the job store so the polling endpoint can track progress.
 */

import { StellarService } from "./server";
import { updateJob } from "../job-store";
import { createBatches } from "./batcher";
import type { PaymentInstruction, BatchResult, PaymentResult } from "./types";
import { Horizon, TransactionBuilder } from "stellar-sdk";

/**
 * Process a batch job in the background. This function must NOT be awaited
 * by the caller — it runs asynchronously and updates job state via the store.
 * #300: Supports both server-side signing (via secretKey) and client-side signing (via signedTransactions).
 */
export async function processJobInBackground(
  jobId: string,
  payments: PaymentInstruction[],
  network: "testnet" | "mainnet",
  secretKey?: string,
  signedTransactions?: string[],
): Promise<void> {
  const MAX_OPS = 100;

  try {
    // Create server instance for fee fetching
    const serverUrl = network === 'testnet'
      ? 'https://horizon-testnet.stellar.org'
      : 'https://horizon.stellar.org';
    const server = new Horizon.Server(serverUrl);

    // #300: Handle pre-signed transactions (client-side signing)
    if (signedTransactions && signedTransactions.length > 0) {
      updateJob(jobId, {
        status: "processing",
        totalBatches: signedTransactions.length,
        completedBatches: 0,
      });

      const allResults: PaymentResult[] = [];
      let successCount = 0;
      let failCount = 0;
      const paymentsPerBatch = payments.length > 0 ? Math.min(MAX_OPS, payments.length) : 0;

      for (let i = 0; i < signedTransactions.length; i++) {
        const xdr = signedTransactions[i];
        const batchPayments = paymentsPerBatch
          ? payments.slice(i * paymentsPerBatch, Math.min((i + 1) * paymentsPerBatch, payments.length))
          : [];

        try {
          const tx = TransactionBuilder.fromXDR(xdr, network === 'testnet' ? 'TESTNET' : 'PUBLIC');
          const result = await server.submitTransaction(tx);

          successCount += batchPayments.length || 1;
          if (batchPayments.length > 0) {
            for (const payment of batchPayments) {
              allResults.push({
                recipient: payment.address,
                amount: payment.amount,
                asset: payment.asset,
                status: "success",
                transactionHash: result.hash,
              });
            }
          } else {
            allResults.push({
              recipient: `tx-${i}`,
              amount: "0",
              asset: "XLM",
              status: "success",
              transactionHash: result.hash,
            });
          }
        } catch (error) {
          if (batchPayments.length > 0) {
            for (const payment of batchPayments) {
              allResults.push({
                recipient: payment.address,
                amount: payment.amount,
                asset: payment.asset,
                status: "failed",
                error: error instanceof Error ? error.message : "Unknown error",
              });
              failCount++;
            }
          } else {
            failCount++;
            allResults.push({
              recipient: `tx-${i}`,
              amount: "0",
              asset: "XLM",
              status: "failed",
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        updateJob(jobId, { completedBatches: i + 1 });
      }

      updateJob(jobId, {
        status: "completed",
        result: {
          batchId: `batch-${Date.now()}`,
          totalRecipients: payments.length > 0 ? payments.length : signedTransactions.length,
          totalAmount: payments.length > 0
            ? payments.reduce((sum, p) => sum + parseFloat(p.amount), 0).toString()
            : "0",
          totalTransactions: signedTransactions.length,
          network,
          timestamp: new Date().toISOString(),
          results: allResults,
          summary: {
            successful: successCount,
            failed: failCount,
          },
        },
      });
      return;
    }

    // Standard payment-based flow (server-side signing)
    if (!secretKey) {
      throw new Error("secretKey is required for payment-based submissions");
    }

    // Compute batches up-front so we know totalBatches immediately
    const batches = await createBatches(payments, MAX_OPS, { network, server });

    updateJob(jobId, {
      status: "processing",
      totalBatches: batches.length,
      completedBatches: 0,
    });

    const service = new StellarService({
      secretKey,
      network,
      maxOperationsPerTransaction: MAX_OPS,
    });

    const allResults: PaymentResult[] = [];
    let successCount = 0;
    let failCount = 0;
    const startTime = new Date().toISOString();

    // Load account once — StellarService.submitBatch reloads it internally,
    // but the worker drives per-batch processing for incremental progress.
    // We reuse the single-batch submission path from StellarService by calling
    // submitBatch with each batch's payments individually.
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      // Submit this single batch of ≤100 payments as one Stellar transaction
      const batchResult = await service.submitBatch(batch.payments);

      for (const r of batchResult.results) {
        allResults.push(r);
        if (r.status === "success") successCount++;
        else failCount++;
      }

      // Update progress after each batch completes
      updateJob(jobId, { completedBatches: i + 1 });
    }

    const totalAmount = payments.reduce(
      (sum, p) => sum + parseFloat(p.amount),
      0,
    );

    const finalResult: BatchResult = {
      batchId: jobId,
      totalRecipients: payments.length,
      totalAmount: totalAmount.toString(),
      totalTransactions: batches.length,
      network,
      timestamp: startTime,
      submittedAt: new Date().toISOString(),
      results: allResults,
      summary: {
        successful: successCount,
        failed: failCount,
      },
    };

    updateJob(jobId, {
      status: "completed",
      result: finalResult,
    });
  } catch (error) {
    updateJob(jobId, {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown worker error",
    });
  }
}
