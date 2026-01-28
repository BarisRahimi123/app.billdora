# BigTime Clone - Feature Specification
## Project Time & Professional Services Management System

Based on analysis of BigTime.net screenshots and research.

---

## 1. NAVIGATION STRUCTURE

### Main Menu (Updated - New BigTime Structure)
- **Sales** ⭐ NEW (Client List, Quotes)
- **Time & Expense**
- **Projects**
- **Resourcing** (Planning, Workflow)
- **Invoicing & Payments**
- **Analytics**
- **QuickBooks**
- **Settings/My Company**

---

## 1.5 SALES MODULE ⭐ PRIORITY BUILD

### 1.5.1 Client List
- Add Client button
- Grid/List view toggle
- Export/Download
- Search
- **Table Columns:** Client | ID/Code | Legal Name | Client Type | Main Address | Main Phone | Main Fax
- Click to view/edit client details

### 1.5.2 Quotes (BigTime Quotes) ⭐ NEW FEATURE
**Workflow:** Draft → Under Review → Approved/Rejected → Accepted → Convert to Project

**Features:**
- Create quotes from scratch or templates
- Add staff roles and rates from existing data
- **Billing Models:**
  - Time & Materials
  - Fixed Fee
  - Item-Based
  - Custom
- Generate professional SOW/proposal documents
- Track quote status
- Built-in approval workflow
- Version history for audit trails
- **One-click conversion to active project** (transfers dates, tasks, budgets, rates)

**Quote Statuses:**
- Draft
- Under Review
- Approved
- Rejected
- Recalled
- Accepted

---

## 2. DASHBOARD
- **Quick Stats Cards:**
  - Days since last sync (QuickBooks)
  - Pending Tasks count
  - Hours Today
- **Billability Chart** - Donut chart showing % billable (WIP/Billed/Unbilled toggle)
- **Invoicing Summary:**
  - Unbilled WIP amount
  - Invoices Drafted
  - Invoices Finalized
- **Workforce/Utilization:**
  - Total Staff
  - Billable Staff
  - Eff Rate
  - Revenue/Head
- **Review & Approvals:**
  - Invoices to review
  - Hours pending approval
  - Expenses pending

---

## 3. PROJECT MANAGEMENT (Core Focus Area)

### 3.1 Project List View
- Add Project button
- Bulk Actions
- Search
- Include inactive/completed toggle
- Export options
- **Columns:** Name, Current Status, Billing Status
- Projects grouped by Client (hierarchical view)

### 3.2 Individual Project View - TABS:

#### **Tab: Vitals**
- Project name & client breadcrumb
- Quick stats row: Tasks Overdue | Unsubmitted Hours | Unapproved Hours | Profit Margin % | Project Health indicator
- **4 Dashboard Cards:**
  1. Task Status (bar chart: completed/approved/overdue)
  2. Budget Status (donut: Budget Spent vs Total, with Revenue/Total Input toggle)
  3. Billing Realization To Date (donut: % with Total Input/Invoiced amounts)
  4. Hours Scorecard (table: Staff Member | Input | Billable | % Billable)

#### **Tab: Details**
- Basic project information form

#### **Tab: Client**
- Client Info (Name, Legal Name, Address, City, State, Zip)
- Client Type dropdown
- ID/Code
- Main Phone, Fax
- Client Notes
- QuickBooks Customer Link
- Consolidate Invoices option

#### **Tab: Contacts**
- Contact list for the client

#### **Tab: Financials**
- Period filters: Week | Month | Quarter | Year
- Time/Expense by Period dropdown
- Table columns: Period | Total Hours/Fees (Hour/Cost/Billable) | Total Expenses (Cost/Billable)

#### **Tab: Team**
- Add team member
- Copy team from another job
- View Inactive Team Members toggle
- **Table:** Staff Member | Project Role dropdown | Lead checkbox | Delete
- Staff Teams section (assign groups)

#### **Tab: Rates**
- **Sub-tabs:** Bill Rates | Cost Rates | Expense Rates
- **Bill Rates:**
  - Basic Billing Rates (Base Rate Type dropdown)
  - Common Billing Rates (Add/Edit Common Rate Cards)
  - Custom Billing Rates table: Staff Member/Role | Category | Task | Rate

#### **Tab: Tasks**
- **Sub-tabs:** Overview/Status | Editor | Schedule | Allocations | Checklist Items
- Show Completed toggle
- Basic Task Information toggle
- **Task Table:** Task | Hours | Charges | Due | Status | Assignment | Estimate | %
- Add Task button
- Bulk Actions
- Overall Totals row

#### **Tab: Billing History**
- Add Invoice button
- Make Payment button
- Billing History dropdown filter
- **Invoice Table:** Invoice | Date | Amount | Posted | Balance
- Overall Totals row

---

## 4. INVOICING SYSTEM (Critical Feature)

### 4.1 Invoicing Dashboard
- **Action Buttons:** Create Invoice | Update Rates | Make Payment
- **3 Summary Cards:**
  1. Work-in-Progress ($ amount, # projects)
  2. Drafts/Finals ($ amounts, # invoices)
  3. A/R Aging ($ amount, # invoices, Current/Past Due toggle)
- **Monthly Invoicing Summary Chart** (bar chart by month)

### 4.2 Invoice Calculator Settings (KEY FEATURE)
Multiple calculation methods:
- **By Item** - Line item billing
- **By Percentage** - % of total
- **By Task Completed** - Task-based billing
- **By Time Period** - Billing cycles
- **Fixed Fee** - Flat rate
- **Progress/Milestone** - Phase-based

### 4.3 Invoice Configuration
- Configure Invoice Settings
- Invoice Style/PDF templates
- Default Invoice Terms
- Invoice Type settings
- Tax Rate configuration

### 4.4 Progress Invoices
- Track partial billing
- Milestone payments
- Retainer management

---

## 5. TIME & EXPENSE TRACKING

### 5.1 My Timesheet
- Week/Day view toggle
- Add Timesheet Row
- Clear Blank Rows
- Date navigation with calendar picker
- Staff member selector
- **Timesheet Grid:**
  - Project | Task | Category | Sun-Sat columns | Total Hours
- Overall Totals row (with Over/Under tracking)
- Submit Hours button
- Rejected hours notification

### 5.2 My Expenses
- Add New Expense
- Upload Credit Card
- Staff filter dropdown
- **Expense Table:** Expense Report | Status | Submitted | Total Amount
- Pagination
- Rejected expenses notification

---

## 6. WORKFLOW

### 6.1 Task Dashboard
- Add Task | Refresh | Bulk Actions
- Task Dashboard / Checklist Items toggle
- **Summary circles:** Not Started | In Process | Admin | Complete
- **Filters Panel (Left):**
  - Types (3D-Scan, Annotation, Design, Drafting, Meeting, etc.)
  - Stages (Not Started, In Process, Under Review, Admin, Complete, Archived)
  - Due Date (Overdue, Today, This Week)
  - Staff Filters
- **Task Table:** Task | Log | Group | Project | Current Status

### 6.2 Task Workflow Manager
- Add Task Type button
- **Workflow Stages:** Not Started → In Process → Under Review → Admin → Complete → Archived
- Custom task types (3D-Scan, Annotation and Labeling, Design, Drafting, Meeting, Plot Plan, etc.)

### 6.3 Planning Board
- Month/Week toggle
- Date picker
- Hours/% toggle
- **Allocation Gauges:** Under Allocated % | Over Allocated %
- **Project Filters (Left):** Cost Centers, Group, Function, Location, Project Type, Project Status
- **Staff Capacity Table:** Staff Member | Base Capacity | Hours by period columns
- Export to PDF
- Staff Filters section

### 6.4 Approvals
- **3 Cards:** Timesheets | Expenses | Invoices
- Each shows: Total to approve, As of date
- Edit Settings link

---

## 7. ANALYTICS

### 7.1 Report Center (New)
- Report categories

### 7.2 Public Reports
- Shared company reports

### 7.3 My Reports
- Personal saved reports

### 7.4 Dashboards
- Custom dashboard builder

---

## 8. MY COMPANY SETTINGS

### 8.1 General Information
- Project List
- Staff List
- Pending Approvals

### 8.2 Company Settings
- **My Company** (Company Info, Lexicon, Active Features, Privacy, Holidays, Display Settings)
- **Field Values**
- **User Rights** (Security Groups: System Administrators, Everyone, Project Manager)
- **Currency**
- **Project Templates**
- **Notifications**
- **Integrations**

### 8.3 Settings Tabs:

#### Company Info
- Name, Address, City, State, Zip, Country
- Business Number, Main Phone
- Home Timezone
- Date Format
- Company Logo (Small/Large)

#### Lexicon (Custom Terminology)
- Customer → Client
- Project → Project
- Task/Tasks
- Team Member
- Team Lead → Project Manager
- Your Company terms
- Labor Code → Category
- Professional Fees
- Expenses → Reimbursable Expenses
- Accounting System mappings

#### Active Features (Toggle ON/OFF)
- BigTime AI Assistant
- BigTime Foresight
- Checklist Items
- Dashboards
- Expense Tracking
- Invoicing
- Multi Currency: Expenses
- Project Templates
- Report Center
- Review/Approvals
- Skills
- Task Based Resourcing (Foresight)
- Time Tracking
- Vendor Bill (Time)

#### Privacy
- Data privacy settings

#### Holidays
- Company holiday calendar

#### Display Settings
- UI preferences

### 8.4 Staff List
- Add Staff button
- Search
- Include Inactive toggle
- Export
- **Table:** Staff Member | Email | Status | Account Status | Security Groups | Payroll Item

### 8.5 User Profile
- Contact Info tab
- Notification Settings tab

### 8.6 Notifications Settings
- Notification Settings | Email Settings | Email Log tabs
- **Notification Types:**
  - Review and Approval Notifications
  - Assignment Notifications
  - Budget Status Notifications
  - General Administration Notifications
  - Open Timer Notifications
  - Follow-Up Notifications
  - Task Start Date
  - Timesheet Reminders
  - Checklist Item Notifications
- Edit Notifications button for each

### 8.7 Integrations
- **Available Integrations:**
  - BigTime Foresight
  - BigTime Wallet
  - Google Calendar
  - Google Sign-In
  - HubSpot
  - iCalendar
  - Intuit
  - Jira Software
  - Lacerte
  - Okta
  - Outlook
  - QuickBooks (Online & Desktop)
  - Sage Intacct
  - Salesforce
- API Keys tab

### 8.8 Project Templates
- New Project Template button
- Template list (left sidebar)
- **Template Tabs:** Basic Settings | Team | Rates | Tasks
- **Basic Settings:**
  - Project Template Name
  - Project Type dropdown
  - Budget Style
  - Current Status / Billing Status
  - Status Note(s)
  - Group / Function / Location
  - Default Class / Category List / Expense Code List / Default Category
  - Default Tax Rate / Invoice Type / Invoice PDF / Invoice Terms
  - Default Project Notes / Invoice Notes
  - Template Description

---

## 9. IMPROVEMENTS TO IMPLEMENT

### 9.1 Project Section (User Priority)
- **Better organization** - cleaner hierarchy
- **Improved navigation** - easier tab switching
- **Visual task boards** - Kanban-style option
- **Better search/filter** - more intuitive
- **Bulk operations** - easier multi-select
- **Quick actions** - inline editing

### 9.2 General Improvements
- **Modern UI** - cleaner, less cluttered
- **Better mobile experience**
- **Faster load times**
- **Simplified onboarding**
- **Drag-and-drop** where applicable
- **Real-time updates**
- **Better data visualization**
- **Document attachments** (missing in BigTime)
- **Multi-level task hierarchy** (beyond 2 levels)

---

## 10. TECHNICAL REQUIREMENTS

### Data Models Needed:
- Companies
- Users/Staff
- Clients
- **Quotes** ⭐ NEW
- **Quote Line Items** ⭐ NEW
- Projects
- Tasks (with workflow states)
- Time Entries
- Expenses
- Invoices
- Invoice Line Items
- Rates (Bill/Cost/Expense)
- Security Groups/Permissions
- Notifications
- Project Templates
- **Quote Templates** ⭐ NEW
- Integrations/API Keys

### Key Relationships:
- Company → Users, Clients, Projects
- Client → Projects, Contacts, **Quotes**
- **Quote → Line Items, Client → converts to → Project**
- Project → Tasks, Team, Rates, Invoices, Time Entries, Expenses
- User → Time Entries, Expenses, Approvals
- Invoice → Line Items, Payments

