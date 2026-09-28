# design

Every written design document for the platform lives here. Each service's own
README is kept short and points back to the files below.

| File | What it records | Asked for by |
|---|---|---|
| `trade-api.yaml` | The Trade REST API contract, as implemented | Sprint 6 |
| `envelope-contract.md` | The Kafka event envelope shared by every topic | Sprint 7 |
| `kafka.md` | Topics, keys and partition counts, and why | Sprint 7 |
| `kafka-topic-setup.md` | Starting the broker and creating and checking the topics | Sprint 7 |
| `analytics-claims.md` | The three business claims and the charts behind them | Sprint 4 |
| `auth-service.md` | The auth service: endpoints, registration flow, throttle, tokens | Sprint 8 |
| `auth-password-hashing.md` | bcrypt, the cost factor measured and chosen, log hygiene | Sprint 8 |
| `auth-security-review.md` | The OWASP review of the auth service | Sprint 8 |

The Sprint 5 UML diagrams are images and Mermaid sources, not Markdown, so they
stay with the code in `java_module/uml_diagrams/`.
