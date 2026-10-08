package com.trade.exception;

/** A deliberately non-specific bank-transfer refusal: it must not reveal PIN validity. */
public class BankTransferException extends DomainException {
    public BankTransferException() {
        super("BNK-400", "Transfer could not be completed. Check the amount, available funds, and PIN.");
    }
}
