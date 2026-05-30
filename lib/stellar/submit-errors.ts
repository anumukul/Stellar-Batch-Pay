/**
 * Classification helpers for Horizon transaction submission errors (#330).
 *
 * Horizon reports submission failures under
 * `error.response.data.extras.result_codes`, with a top-level `transaction`
 * code and a per-operation `operations` array. Different transaction codes
 * call for very different remediation, so fee, sequence, and generic failures
 * are kept separate instead of being lumped together.
 *
 * Previously `tx_bad_seq` was treated as a fee error, which told users to
 * raise their fee when the real fix is to rebuild the transaction against a
 * fresh account sequence.
 */

export interface HorizonResultCodes {
    transaction?: string;
    operations?: string[];
}

/** Stable codes returned to the client so the UI can branch on remediation. */
export type SubmitErrorCode =
    | "BAD_SEQ"
    | "INSUFFICIENT_FEE"
    | "TX_FAILED"
    | "UNKNOWN";

/** Suggested next step for the client/user. */
export type SubmitErrorAction = "rebuild" | "increase_fee" | "review" | "retry";

export interface ClassifiedSubmitError {
    code: SubmitErrorCode;
    message: string;
    action: SubmitErrorAction;
    /** Raw Horizon result codes, when available, for debugging/telemetry. */
    resultCodes?: HorizonResultCodes;
}

/**
 * Safely pull the Horizon `result_codes` object off an unknown error value.
 * Returns `undefined` when the error is not a Horizon submission error.
 */
export function getResultCodes(error: unknown): HorizonResultCodes | undefined {
    if (!error || typeof error !== "object") return undefined;
    const resultCodes = (error as any).response?.data?.extras?.result_codes;
    if (!resultCodes || typeof resultCodes !== "object") return undefined;
    return resultCodes as HorizonResultCodes;
}

/**
 * A bad sequence number means the transaction was built against a stale
 * account sequence (e.g. another transaction consumed it, or it was signed
 * against a stale sequence from the build step). Resubmitting the same signed
 * XDR can never succeed — the transaction must be rebuilt against a fresh
 * sequence and re-signed.
 */
export function isBadSequenceError(error: unknown): boolean {
    return getResultCodes(error)?.transaction === "tx_bad_seq";
}

/**
 * A fee-related failure: the offered fee was too low, possibly due to surge
 * pricing. This is transient and worth retrying with a higher fee.
 *
 * Note: `tx_bad_seq` is deliberately NOT treated as a fee error here (#330).
 */
export function isInsufficientFeeError(error: unknown): boolean {
    const txCode = getResultCodes(error)?.transaction;
    return (
        txCode === "tx_insufficient_fee" || txCode === "tx_fee_bump_inner_failed"
    );
}

/**
 * Map an arbitrary submission error to a structured, client-facing result with
 * an actionable remediation hint.
 */
export function classifySubmitError(error: unknown): ClassifiedSubmitError {
    const resultCodes = getResultCodes(error);

    if (isBadSequenceError(error)) {
        return {
            code: "BAD_SEQ",
            message:
                "Transaction sequence number is out of date. Refresh the account sequence, rebuild the transaction, and sign again.",
            action: "rebuild",
            resultCodes,
        };
    }

    if (isInsufficientFeeError(error)) {
        return {
            code: "INSUFFICIENT_FEE",
            message:
                "The transaction fee is too low, likely due to network surge pricing. Increase the fee and try again.",
            action: "increase_fee",
            resultCodes,
        };
    }

    if (resultCodes) {
        return {
            code: "TX_FAILED",
            message:
                "The transaction was rejected by the network. Review the operation result codes for details.",
            action: "review",
            resultCodes,
        };
    }

    return {
        code: "UNKNOWN",
        message:
            error instanceof Error
                ? error.message
                : "An unexpected error occurred while submitting the transaction.",
        action: "retry",
    };
}
