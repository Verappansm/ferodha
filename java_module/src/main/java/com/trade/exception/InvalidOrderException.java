package com.trade.exception;

public class InvalidOrderException extends DomainException {
    
    public InvalidOrderException(){
        super("VAL-422", "Invalid Input");
    }
}
