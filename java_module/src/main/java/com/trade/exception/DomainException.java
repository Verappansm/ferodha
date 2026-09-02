package com.trade.exception;

public abstract class DomainException extends Exception{

    private final String code;

    public DomainException(String code, String message){
        super(message);
        this.code = code;
    }

    public String getCode(){return code;}
}
