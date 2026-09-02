package com.trade.exception;

public class InsufficientFundsException extends DomainException {
    
    public InsufficientFundsException(){
        super("ORD-400", "Insufficient Funds");
    }
}
