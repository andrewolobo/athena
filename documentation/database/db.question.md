[cite_start]To support the Alpha implementation of your Monitoring and Evaluation (M&E) platform, the database schema must shift from a traditional "flat" survey model to an **Identity-First Model**[cite: 319, 322]. [cite_start]This architecture ensures that data remains clean at the source and supports longitudinal tracking across multi-year interventions[cite: 306, 321].

Based on your technical specifications, the PostgreSQL schema should be structured into a multi-tiered hierarchy that separates administrative boundaries from specific data collection instruments.

### 1. Administrative & Organizational Tier

[cite_start]This tier defines the operational boundaries and thematic grouping of your data[cite: 325].

- [cite_start]**Organizations:** Represents a discrete team or operational unit (e.g., the "Kenya Country Office")[cite: 325].
- [cite_start]**Folders:** Acts as a collection of related forms grouped by a thematic sector, such as WASH (Water, Sanitation, and Hygiene) or Health[cite: 325].

### 2. The "Noun" Layer: Persistent Entities

Central to the **Identity-First Model**, this layer stores the immutable records of subjects (participants, facilities, or households).

- **Entities Table:**
  - [cite_start]`id`: A persistent, immutable unique identifier generated at the baseline phase[cite: 322].
  - `org_id`: Foreign key to the Organization.
  - [cite_start]`entity_type`: Categorizes the entity (e.g., "Beneficiary" or "Health Clinic")[cite: 325].
  - [cite_start]`metadata`: Common attributes like registration date or geographic coordinates[cite: 325].

### 3. The "Verb" Layer: Form Submissions & Longitudinal Tracking

While the Entity is the "noun," the Form is the "verb" (the action of collecting data). [cite_start]This decoupling allows the platform to pull existing subject data into follow-up surveys to verify identity and track changes over time[cite: 330].

- [cite_start]**Forms Table:** Stores the XLSForm definitions, including the logic for skip patterns and calculations[cite: 333, 335].
- **Submissions Table:**
  - `id`: Unique identifier for the specific survey event.
  - [cite_start]`entity_id`: Foreign key linking the submission to the persistent Entity record[cite: 329].
  - `form_id`: Foreign key to the Form definition.
  - [cite_start]`start_time` / `end_time`: Metadata captured automatically via XLSForm standards to monitor enumerator efficiency[cite: 338].
  - [cite_start]`device_id`: Captures the unique hardware identifier of the enumerator's device[cite: 338].
  - [cite_start]`payload`: A JSONB field containing the raw survey data, allowing for flexibility while maintaining a rigid relational structure for core entities[cite: 324, 332].

### 4. Data Quality & Observability

[cite_start]To transition from reactive cleaning to proactive observability, the schema must support real-time assessment and conflict management[cite: 368].

- **Quarantine_Queue:** A temporary storage table for payloads that fail critical quality thresholds (e.g., freshness or uniqueness checks).
- **Conflicts Table:** Used for the **Manual Resolution via Branching** strategy. When offline updates collide, divergent data points are stored as separate branches for supervisor review.

### 5. Results Framework & Indicator Tracking

[cite_start]This layer separates your platform from standard survey tools by mapping causal chains from activities to long-term impact[cite: 394, 407].

- [cite_start]**Indicators Table:** Defines SMART indicators (Specific, Measurable, Achievable, Relevant, and Time-bound) with baseline values and year-end targets[cite: 400, 403].
- [cite_start]**Indicator_Tracking Table (ITT):** Juxtaposes baseline values, targets, and actual achievements derived dynamically from the `Submissions` table[cite: 403, 406].

### Summary Schema View

| Level              | Implementation Detail                                                                          |
| :----------------- | :--------------------------------------------------------------------------------------------- |
| **Database**       | [cite_start]Isolated PostgreSQL instance per operational unit[cite: 325].                      |
| **Folder**         | [cite_start]Logical grouping of schemas by programmatic area (e.g., WASH)[cite: 325].          |
| **Form (Table)**   | [cite_start]Rigid schema representing a list of entities sharing common attributes[cite: 325]. |
| **Record (Row)**   | [cite_start]Individual entities (e.g., a specific farmer) with immutable IDs[cite: 325].       |
| **Field (Column)** | [cite_start]Specific attributes, including geographic coordinates or barcodes[cite: 325, 337]. |
