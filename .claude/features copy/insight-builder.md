## Feature Title: Self-Service "Insight Builder" for M&E Reporting

### 1. Feature Objective

Develop a lightweight, user-facing "Insight Builder" that allows non-technical Monitoring & Evaluation (M&E) officers to generate ad-hoc visualizations from a participant directory and save them to a persistent dashboard.

### 2. User Story

**As an** M&E Officer,
**I want to** select a specific data field (e.g., Gender, Region, or Project Status) in the Data Explorer, which would open up a side pan with options(Indicator Details, Dashboard Pinning Details, Visualization Type)
**So that** I can instantly see a visual distribution of that data and either export it for a report or "pin" it to my home dashboard for ongoing monitoring.

### 3. Functional Requirements

#### A. Field Selection & Mapping

- **The Data Source:** Connect to a standardized dataset (e.g., `Participant_Directory`).
- **Metadata Layer:** Implement a mapping layer that translates technical column names (e.g., `pt_gender_cd`) into user-friendly labels ("Gender").
- **Data Typing:** The system must identify if a field is **Categorical** (Gender, Location), **Numerical** (Age, Grant Amount), or **Temporal** (Registration Date).

#### B. Dynamic Visualization Logic

- **Auto-Chart Selection:** \* If **Categorical**: Default to a Pie Chart or Horizontal Bar Chart.
  - If **Temporal**: Default to a Line Chart showing trends over time.
- **Aggregation Engine:** On selection, the system must trigger a backend `COUNT` or `SUM` query grouped by the selected dimension.
- **Rendering:** Use a client-side library (e.g., Chart.js or ApexCharts) to render the visual in a preview window.

#### C. Persistence & Actions

- **"Pin to Dashboard":** Users can save the current chart configuration (Field + Chart Type + Filters) to a `user_dashboards` table.
- **Export:** Provide a button to download the current visual as a high-resolution **PNG or JPEG** using a library like `html2canvas`.

### 4. Technical Constraints & Logic

| Component            | Implementation Detail                                                                                                               |
| :------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| **State Management** | Store the "Active Chart" configuration in a JSON object: `{ "dimension": "gender", "type": "pie", "label": "Participant Gender" }`. |
| **Security**         | The data query must respect Row-Level Security (RLS) based on the user's project permissions.                                       |
| **Performance**      | Use debounced queries or a cached summary table to prevent database lag during rapid field switching.                               |

### 5. Acceptance Criteria (Definition of Done)

- [ ] User can select a field from a dropdown and see a chart update within < 2 seconds.
- [ ] User can click "Pin to Dashboard" and see that chart persist after a page refresh.
- [ ] The exported image contains the chart title, legend, and clear labels.
- [ ] The system handles "Null" or "Missing" data by displaying it as a separate "Unspecified" category.
