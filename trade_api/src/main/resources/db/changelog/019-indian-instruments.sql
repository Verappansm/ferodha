--liquibase formatted sql

-- Indian equities listed on the National Stock Exchange of India.
-- Symbols use the exchange tickers returned by the instruments API; prices
-- are denominated in Indian rupees.
--changeset trade-api:019-indian-instruments
INSERT INTO Instruments (ticker, name, exchange, currency, type, sector) VALUES
    ('INFY.NS', 'Infosys Limited',                 'NSE', 'INR', 'EQUITY', 'Information Technology'),
    ('ITC.NS',  'ITC Limited',                     'NSE', 'INR', 'EQUITY', 'Consumer Staples'),
    ('HAL.NS',  'Hindustan Aeronautics Limited',   'NSE', 'INR', 'EQUITY', 'Aerospace and Defense')
ON CONFLICT (ticker) DO NOTHING;
--rollback DELETE FROM Instruments WHERE ticker IN ('INFY.NS', 'ITC.NS', 'HAL.NS');
