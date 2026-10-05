package com.trade.admin.service;

import com.trade.admin.AdminException;

// A validated page request: zero-based page, 1 to 100 rows per page, as the
// admin contract's Page and Size parameters say.
public record Paging(int page, int size) {

    public static final int MAX_SIZE = 100;

    public Paging {
        if (page < 0 || size < 1 || size > MAX_SIZE) {
            throw AdminException.invalid("page=" + page + " size=" + size);
        }
    }

    public int offset() {
        return page * size;
    }

    static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
