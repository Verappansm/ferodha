// Unit tests never connect to anything, but loading AppModule runs the config
// validation, which needs these to be set. Real values from the environment
// win; these only fill gaps.
process.env.JWT_SECRET ??= 'unit-test-secret-at-least-32-characters';
process.env.POSTGRES_HOST ??= 'localhost';
process.env.POSTGRES_DB ??= 'unused';
process.env.POSTGRES_USER ??= 'unused';
process.env.POSTGRES_PASSWORD ??= 'unused';
