package com.trade.exception;

public class DuplicateOrderException extends DomainException{
    
    public DuplicateOrderException(){
        super("ORD-409", "Duplicate Order");
    }
}
