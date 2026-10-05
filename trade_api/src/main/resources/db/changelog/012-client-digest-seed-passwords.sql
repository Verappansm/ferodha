--liquibase formatted sql

-- B23: the browsers send sha256('ferodha-v1:' || email || ':' || password) in
-- place of the password, and the auth service bcrypts that as it always has.
-- The seed users' stored hashes are bcrypt of the plain password, so they are
-- re-hashed here as bcrypt (cost 12) of their digest, for the same seed
-- password `seed-password-change-me`. Only a row still holding the original
-- seed hash changes: a password someone has since set is never touched.
-- Users who registered before this change cannot sign in until they register
-- again (their plain password is not known, so it cannot be re-hashed).

--changeset trade-api:016-client-digest-seed-passwords
UPDATE Users SET password_hash = '$2b$12$51dNDb6H4K4mGya2a30u7ODqL5nixxWjBidwkl.JZy4PmUoV./B8G'
 WHERE lower(email) = 'john.carter@example.com' AND password_hash = '$2b$12$QgvqQO.57WsjZ6TBnhlbA.xVIXPBZTo1vmiVNvprTBbA6V8n34SE2';
UPDATE Users SET password_hash = '$2b$12$Bb75QRgees83pHoH2EUgX.AN.C/1rjVpRnKbT3YCUwEmeJ5qJxfmy'
 WHERE lower(email) = 'emily.stone@example.com' AND password_hash = '$2b$12$QgvqQO.57WsjZ6TBnhlbA.xVIXPBZTo1vmiVNvprTBbA6V8n34SE2';
UPDATE Users SET password_hash = '$2b$12$RNsUN08Ysc25DHk35W0Fh.TsFkpYv6ur4LGFQ2p9sEhEiD8/C2zk6'
 WHERE lower(email) = 'robert.wilson@example.com' AND password_hash = '$2b$12$QgvqQO.57WsjZ6TBnhlbA.xVIXPBZTo1vmiVNvprTBbA6V8n34SE2';
UPDATE Users SET password_hash = '$2b$12$wuzRN4NfegYRfSMpuJ3/fePsacJw7D0GtWIezqIAtuJrFljDHCwaW'
 WHERE lower(email) = 'sarah.johnson@example.com' AND password_hash = '$2b$12$QgvqQO.57WsjZ6TBnhlbA.xVIXPBZTo1vmiVNvprTBbA6V8n34SE2';
UPDATE Users SET password_hash = '$2b$12$CgiDGYtU0sz7hPfvnk9PhuREzfAGNTWcayk73O4axXldxBCx6wP0C'
 WHERE lower(email) = 'michael.brown@example.com' AND password_hash = '$2b$12$QgvqQO.57WsjZ6TBnhlbA.xVIXPBZTo1vmiVNvprTBbA6V8n34SE2';
UPDATE Users SET password_hash = '$2b$12$prTUS4e3MrDMdhcbrSkyMeup7toMyJteML09JVCc3Ah/DLAmjMa2q'
 WHERE lower(email) = 'e2e.trader@example.com' AND password_hash = '$2b$12$QgvqQO.57WsjZ6TBnhlbA.xVIXPBZTo1vmiVNvprTBbA6V8n34SE2';
--rollback UPDATE Users SET password_hash = '$2b$12$QgvqQO.57WsjZ6TBnhlbA.xVIXPBZTo1vmiVNvprTBbA6V8n34SE2' WHERE lower(email) IN ('john.carter@example.com', 'emily.stone@example.com', 'robert.wilson@example.com', 'sarah.johnson@example.com', 'michael.brown@example.com', 'e2e.trader@example.com');
