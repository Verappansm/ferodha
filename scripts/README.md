# scripts

- `SB_AND_KAFKA_DEMO.sh`: brings up the Docker stack, creates the topics and
  walks through every trade_api endpoint and the Kafka round trip. Section 6
  demonstrates `market-sim`.
- `COMPLETE_DEMO.sh`: an older walkthrough of success and failure cases
  against a running trade_api. Set `API_BASE` and `JWT_TOKEN` at the top first.
- `generate_jwt.py`: kept for the record from Sprint 6, when there was no auth
  service. Nothing uses it now, and its default token (issuer `trade-api-test`)
  is refused by trade_api; get real tokens from the auth service.
