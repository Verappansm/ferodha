package com.trade.exception;

public class InstrumentNotFoundException extends DomainException{

    public InstrumentNotFoundException(){
        super("INS-404", "Instrument Not Found");
    }
    
}
