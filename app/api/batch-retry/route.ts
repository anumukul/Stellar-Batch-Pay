/**
 * API route for retrying only failed payments from a completed batch.
 *
 * POST /api/batch-retry
 * {
 *   jobId: string
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createJob, getJob } from "@/lib/job-store";
import { processJobInBackground } from "@/lib/stellar/batch-worker";
import { safeJsonResponse } from "@/lib/safe-json";

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as { jobId?: string };
        const jobId = body.jobId;

        if (!jobId || typeof jobId !== "string") {
            return NextResponse.json(
                { error: "jobId is required" },
                { status: 400 },
            );
        }

        if (process.env.ALLOW_SERVER_SIGNING !== "true") {
            return NextResponse.json(
                {
                    error:
                        "Server-side retry is disabled. Enable ALLOW_SERVER_SIGNING=true in server configuration to retry failed payments from stored jobs.",
                },
                { status: 403 },
            );
        }

        const secretKey = process.env.STELLAR_SECRET_KEY;
        if (!secretKey) {
            return NextResponse.json(
                {
                    error:
                        "STELLAR_SECRET_KEY is not configured. Retry cannot proceed without server-side signing credentials.",
                },
                { status: 500 },
            );
        }

        const job = getJob(jobId);
        if (!job || !job.result) {
            return NextResponse.json(
                { error: "Batch job not found or not completed yet" },
                { status: 404 },
            );
        }

        const failedResults = job.result.results.filter((r) => r.status === "failed");
        if (failedResults.length === 0) {
            return NextResponse.json(
                { error: "No failed payments available for retry" },
                { status: 400 },
            );
        }

        if (!job.payments || job.payments.length === 0) {
            return NextResponse.json(
                {
                    error:
                        "Retry is not available for pre-signed batches without preserved payment metadata.",
                },
                { status: 400 },
            );
        }

        const failedPaymentsMap = new Map<string, number>();
        for (const result of failedResults) {
            const key = JSON.stringify({
                address: result.recipient,
                amount: result.amount,
                asset: result.asset,
            });
            failedPaymentsMap.set(key, (failedPaymentsMap.get(key) ?? 0) + 1);
        }

        const failedPayments = job.payments.filter((payment) => {
            const key = JSON.stringify({
                address: payment.address,
                amount: payment.amount,
                asset: payment.asset,
            });
            const count = failedPaymentsMap.get(key) ?? 0;
            if (count > 0) {
                failedPaymentsMap.set(key, count - 1);
                return true;
            }
            return false;
        });

        if (failedPayments.length === 0) {
            return NextResponse.json(
                { error: "Could not map failed results back to original payments" },
                { status: 500 },
            );
        }

        const retryJobId = createJob(failedPayments, job.network, job.publicKey || "");
        void processJobInBackground(retryJobId, failedPayments, job.network, secretKey);

        return safeJsonResponse(
            {
                jobId: retryJobId,
                originalJobId: job.jobId,
                failedPayments: failedPayments.length,
                message: "Retry job queued. Poll /api/batch-status/" + retryJobId + " for progress.",
            },
            { status: 202 },
        );
    } catch (error: unknown) {
        console.error("Batch retry error:", error);
        return safeJsonResponse(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to create retry job",
            },
            { status: 500 },
        );
    }
}
