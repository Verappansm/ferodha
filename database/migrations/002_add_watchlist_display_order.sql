-- Add display_order columns to Watchlist and Watchlist_Items tables

ALTER TABLE Watchlist 
ADD COLUMN display_order INT NOT NULL DEFAULT 0;

ALTER TABLE Watchlist_Items 
ADD COLUMN display_order INT NOT NULL DEFAULT 0;

-- Create index for display_order queries
CREATE INDEX idx_watchlist_user_display ON Watchlist(user_id, display_order);
CREATE INDEX idx_watchlist_items_display ON Watchlist_Items(watchlist_id, display_order);
