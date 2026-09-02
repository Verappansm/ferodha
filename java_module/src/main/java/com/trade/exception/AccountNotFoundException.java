package com.trade.exception;

public class AccountNotFoundException extends DomainException{

    public AccountNotFoundException(){
        super("ACC-404", "Account Not Found");
    }
}
