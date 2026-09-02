package com.trade.exception;

public class InsufficientHoldingsException extends DomainException{
    
    public InsufficientHoldingsException(){
        super("ORD-409", "Insufficient Holdings");
    }
}