In the Alpha implementation of your Monitoring and Evaluation (M&E) platform, form data is stored using a **hybrid relational-JSONB architecture** in PostgreSQL. This model ensures that core administrative and longitudinal tracking data remains rigid and queryable, while the actual survey responses—which vary from form to form—are stored flexibly.

### 1. The Relational Metadata Layer

Every form submission is recorded in a central `submissions` table. This table uses standard relational columns for "immutable" metadata that is required for every survey event, regardless of the sector or programmatic area.

- **`submission_id`**: A unique UUID for the specific event.
- **`entity_id`**: The persistent, unique identifier for the participant or facility (the "Noun").
- **`form_id`**: A reference to the specific XLSForm version used.
- **`enumerator_id`**: Identifies which field worker collected the data.
- **`start_time` / `end_time`**: Automatically captured timestamps used for "Freshness" and quality monitoring.
- **`location`**: A PostGIS geography point for the GPS coordinates where the form was submitted.

### 2. The JSONB Payload Layer

The actual answers to the survey questions are stored in a single **JSONB** column called `payload`. Storing responses as a JSON document rather than separate SQL columns allows you to:

- Update your XLSForm definitions without needing to perform complex database migrations.
- Capture nested data, such as "Repeat Groups" (e.g., listing all children in a household), which are difficult to model in flat tables.

### Storage Example: Registration vs. Follow-up

Because the platform uses an **Identity-First Model**, form data is linked across time by the persistent `entity_id`.

**Example 1: A Baseline Registration (The "Noun")**
When a farmer is first registered, the submission creates a new record in the database.

```json
{
  "submission_metadata": {
    "entity_id": "uuid-farmer-001",
    "form_id": "farmer_registration_v1",
    "submitted_at": "2026-03-23T10:00:00Z"
  },
  "payload": {
    "farmer_name": "Jane Doe",
    "household_size": 5,
    "primary_crop": "Maize",
    "land_size_ha": 2.5
  }
}
```

**Example 2: A Follow-up Yield Survey (The "Verb")**
Six months later, a different form is used. The `entity_id` remains the same, allowing the system to join this new "Verb" (the harvest update) to the original "Noun" (the farmer).

```json
{
  "submission_metadata": {
    "entity_id": "uuid-farmer-001",
    "form_id": "harvest_report_v1",
    "submitted_at": "2026-09-15T14:30:00Z"
  },
  "payload": {
    "harvest_quantity_kg": 1200,
    "pest_issues": "None",
    "market_price_per_kg": 45
  }
}
```

### Data Quality & Quarantine

Before being finalized in the main tables, incoming JSON payloads pass through an automated ingestion pipeline. If a payload fails a quality check—such as a "Uniqueness" check identifying a duplicate `entity_id`—the record is diverted to a **Quarantine_Queue** table for manual review in the management dashboard.
