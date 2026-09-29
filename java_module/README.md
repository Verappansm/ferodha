# java_module

The Sprint 5 domain package: `Account`, `Instrument`, `Order`, `Position`, the
order request DTO, the exception hierarchy and business rules 1 to 8, with no
database and no HTTP. It is frozen: `trade_api` copies it in as source, and
changes are made there.

```bash
mvn test
```

## Where the design lives

Sprint 5 asked for a UML class diagram and an order-placement sequence
diagram. They are in `uml_diagrams/`, as Mermaid sources with PNG exports.
