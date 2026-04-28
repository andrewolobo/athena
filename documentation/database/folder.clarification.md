In the Alpha implementation of your M&E platform, a **Folder** is not a table defined by rows and columns, but rather a **PostgreSQL Schema** (a logical namespace) used to group related tables.

This architectural choice allows you to isolate thematic sectors (like WASH or Health) while maintaining a high-performance relational structure. Here is how that hierarchy translates to a database implementation compared to your example:

### The Database Hierarchy

While your example `dbo.organizations.users` follows a standard relational path, the M&E platform uses a more isolated, multi-tenant approach:

- **Database (The Instance):** Instead of an `organizations` table, each major operational unit (e.g., "Kenya Country Office") typically has its own isolated **PostgreSQL Database instance** to ensure data sovereignty and performance.
- **Folder (The PostgreSQL Schema):** This is the **logical namespace**. For example, you would create a schema named `wash`. This "Folder" contains all the forms (tables) related to that programmatic area.
- **Form (The Table):** A specific **Table** living inside that schema. For instance, the table `wash.beneficiary_registry` represents a single "Form" where each row is a discrete entity.

### Why use Schemas instead of Tables for Folders?

Implementing Folders as PostgreSQL Schemas provides several technical advantages for an M&E platform:

1.  [cite_start]**Thematic Isolation:** You can group dozens of related forms (tables) under a single sector like `health` without cluttering a single global namespace[cite: 114].
2.  **Standardized Access:** You can set permissions at the schema level, ensuring that users assigned to a "WASH Folder" only have access to the tables within that specific PostgreSQL schema.
3.  [cite_start]**Entity-First Consistency:** Even across different folders (schemas), you can maintain the **Identity-First Model** by using the same persistent unique identifiers (UUIDs) for participants, allowing you to join data across schemas (e.g., joining `wash.registrations` with `health.clinic_visits` via the `entity_id`)[cite: 110, 117].

### Implementation Example

If you were looking at this in a SQL tool, the structure would look like this:

- **Database:** `m_and_e_kenya`
  - **Schema (Folder):** `wash_sector`
    - **Table (Form):** `water_point_baseline`
    - **Table (Form):** `latrine_inspection`
  - **Schema (Folder):** `health_sector`
    - **Table (Form):** `vaccination_tracker`

[cite_start]This structure prevents the "Dashboard Trap" by ensuring that forms are grouped logically by sector while remaining strictly relational and queryable[cite: 109, 110].
