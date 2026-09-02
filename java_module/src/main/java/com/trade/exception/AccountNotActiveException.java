package com.trade.exception;

public class AccountNotActiveException extends DomainException{

    public AccountNotActiveException(){
        super("ACC-403", "Account Not Active");
    }
}
