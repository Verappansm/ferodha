package com.trade.exception;

/** A transfer key may only be used once, including after a browser retry. */
public class DuplicateBankTransferException extends DomainException {
    public DuplicateBankTransferException() {
        super("BNK-409", "This transfer has already been submitted.");
    }
}
