package com.trade.admin.mapper;

// A Third_Party_Bank row: the simulated bank account, the email of the user it
// belongs to, and the currency its balance is held in.
public record BankAccountRow(String bankAccountNumber, String email, String currency) {
}
