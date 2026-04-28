To support the Alpha implementation of your M&E platform, the database schema is designed to separate core identity management from flexible survey data. This PostgreSQL schema implements the **Identity-First Model** and uses **PostgreSQL Schemas** to represent "Folders."

### 1. Core Administrative Schema (`public`)

These tables manage the fundamental building blocks of the organization, users, and the persistent "Nouns" (Entities).

```sql
-- Core Organization Table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL, -- e.g., 'kenya-office'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users & Roles
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    email TEXT UNIQUE NOT NULL,
    role TEXT CHECK (role IN ('admin', 'supervisor', 'enumerator')),
    password_hash TEXT NOT NULL
);

-- The Identity Registry (The "Noun" Layer)
-- This table tracks every participant or facility across all forms
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    entity_type TEXT NOT NULL, -- e.g., 'household', 'water_point', 'clinic'
    external_id TEXT,          -- ID from an external system if applicable
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB             -- Common attributes (e.g., registration date)
);

-- Form Registry
CREATE TABLE forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    folder_name TEXT NOT NULL, -- Matches the PostgreSQL Schema name
    form_name TEXT NOT NULL,
    xlsform_json JSONB,        -- The logic/definition of the form
    version INTEGER DEFAULT 1
);
```

### 2. The "Folder" Schema (e.g., `sector_wash`)

Following the architectural decision to use PostgreSQL Schemas for Folders, you would create a dedicated namespace for each programmatic area. This isolates the data while allowing it to reference the central `entities` table.

```sql
CREATE SCHEMA sector_wash;

-- A specific Form implementation within the WASH Folder
CREATE TABLE sector_wash.water_point_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES public.entities(id), -- Links back to the persistent "Noun"
    form_id UUID REFERENCES public.forms(id),
    enumerator_id UUID REFERENCES public.users(id),

    -- Mandatory M&E Metadata
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    location GEOGRAPHY(POINT, 4326), -- PostGIS point for GPS tracking

    -- The Survey Data
    payload JSONB NOT NULL,          -- Flexible survey responses

    -- Quality Control Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'quarantined', 'flagged')),
    server_received_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Data Quality & Conflict Management

This layer supports the proactive observability required for high-integrity M&E data.

```sql
-- Quarantine Queue for failed validations
CREATE TABLE quarantine_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID, -- If it came from a specific table
    raw_payload JSONB,
    failure_reason TEXT, -- e.g., 'Duplicate Entity ID' or 'Invalid GPS'
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conflict Resolution (Branching)
-- Used when offline updates collide
CREATE TABLE submission_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES entities(id),
    winning_submission_id UUID,
    branch_payload JSONB, -- The divergent data that needs manual merging
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Key Relationships in this Schema

- **The Entity as the Anchor:** Every submission in a "Folder" table (like `sector_wash.water_point_inspections`) must reference a record in `public.entities`. This ensures that if you run a survey on a specific water point three years apart, the data is automatically joined by that `entity_id`.
- **JSONB for Flexibility:** By using `JSONB` for the `payload`, your Express.js backend can accept any valid XLSForm submission without you having to manually run `ALTER TABLE` every time a field worker adds a new question to a survey.
- **PostGIS for Spatial Integrity:** The `location` column uses the `GEOGRAPHY` type, allowing you to run complex spatial queries (e.g., "Find all inspections within 5km of this village") directly in SQL.
