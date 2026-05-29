/**
 * Tests for Horizon submission error classification (#330).
 *
 * Regression: `tx_bad_seq` must NOT be reported as an insufficient-fee error,
 * because the remediation is to rebuild against a fresh sequence — not to
 * raise the fee.
 */

import { describe, it, expect } from "vitest";
import {
    classifySubmitError,
    getResultCodes,
    isBadSequenceError,
    isInsufficientFeeError,
} from "@/lib/stellar/submit-errors";

/**
 * Build an error shaped like a Horizon submission failure thrown by the
 * Stellar SDK: `error.response.data.extras.result_codes`.
 */
function horizonError(resultCodes: {
    transaction?: string;
    operations?: string[];
}) {
    return {
        response: {
            data: {
                extras: { result_codes: resultCodes },
            },
        },
    };
}

describe("getResultCodes", () => {
    it("extracts result_codes from a Horizon error", () => {
        const err = horizonError({ transaction: "tx_bad_seq" });
        expect(getResultCodes(err)).toEqual({ transaction: "tx_bad_seq" });
    });

    it("returns undefined for non-Horizon errors", () => {
        expect(getResultCodes(new Error("network down"))).toBeUndefined();
        expect(getResultCodes(undefined)).toBeUndefined();
        expect(getResultCodes(null)).toBeUndefined();
        expect(getResultCodes({})).toBeUndefined();
    });
});

describe("isBadSequenceError", () => {
    it("is true for tx_bad_seq", () => {
        expect(
            isBadSequenceError(horizonError({ transaction: "tx_bad_seq" })),
        ).toBe(true);
    });

    it("is false for fee and other errors", () => {
        expect(
            isBadSequenceError(horizonError({ transaction: "tx_insufficient_fee" })),
        ).toBe(false);
        expect(isBadSequenceError(horizonError({ transaction: "tx_failed" }))).toBe(
            false,
        );
        expect(isBadSequenceError(new Error("boom"))).toBe(false);
    });
});

describe("isInsufficientFeeError", () => {
    it("is true for tx_insufficient_fee and tx_fee_bump_inner_failed", () => {
        expect(
            isInsufficientFeeError(
                horizonError({ transaction: "tx_insufficient_fee" }),
            ),
        ).toBe(true);
        expect(
            isInsufficientFeeError(
                horizonError({ transaction: "tx_fee_bump_inner_failed" }),
            ),
        ).toBe(true);
    });

    it("is NOT true for tx_bad_seq (regression for #330)", () => {
        expect(
            isInsufficientFeeError(horizonError({ transaction: "tx_bad_seq" })),
        ).toBe(false);
    });

    it("is false for unrelated errors", () => {
        expect(
            isInsufficientFeeError(horizonError({ transaction: "tx_failed" })),
        ).toBe(false);
        expect(isInsufficientFeeError(new Error("boom"))).toBe(false);
    });
});

describe("classifySubmitError", () => {
    it("classifies tx_bad_seq as BAD_SEQ with a rebuild action", () => {
        const result = classifySubmitError(
            horizonError({ transaction: "tx_bad_seq" }),
        );
        expect(result.code).toBe("BAD_SEQ");
        expect(result.action).toBe("rebuild");
        expect(result.message).toMatch(/sequence/i);
        expect(result.message).not.toMatch(/fee/i);
        expect(result.resultCodes).toEqual({ transaction: "tx_bad_seq" });
    });

    it("classifies tx_insufficient_fee as INSUFFICIENT_FEE with increase_fee action", () => {
        const result = classifySubmitError(
            horizonError({ transaction: "tx_insufficient_fee" }),
        );
        expect(result.code).toBe("INSUFFICIENT_FEE");
        expect(result.action).toBe("increase_fee");
        expect(result.message).toMatch(/fee/i);
    });

    it("classifies tx_failed as TX_FAILED with a review action", () => {
        const result = classifySubmitError(
            horizonError({
                transaction: "tx_failed",
                operations: ["op_underfunded"],
            }),
        );
        expect(result.code).toBe("TX_FAILED");
        expect(result.action).toBe("review");
        expect(result.resultCodes).toEqual({
            transaction: "tx_failed",
            operations: ["op_underfunded"],
        });
    });

    it("classifies a non-Horizon error as UNKNOWN with a retry action", () => {
        const result = classifySubmitError(new Error("ECONNRESET"));
        expect(result.code).toBe("UNKNOWN");
        expect(result.action).toBe("retry");
        expect(result.message).toBe("ECONNRESET");
        expect(result.resultCodes).toBeUndefined();
    });
});
