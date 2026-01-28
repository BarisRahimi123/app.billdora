# iOS Data Loading Issues - Root Cause Analysis

## Problem Summary
Data fails to load when navigating between pages or resuming from background on iOS.

## Identified Root Causes

### 1. Race Condition: Auth vs Page Data Loading
When app resumes from background:
- **AuthContext** starts session refresh on visibility change
- **Each page** ALSO starts data loading on visibility change  
- These run in parallel WITHOUT coordination
- Page data loading may start BEFORE session is valid → timeout/fail

**Evidence from logs:**
```
[Auth] Visibility changed to visible after 9 seconds
[SalesPage] Rendering cached data instantly  
[SalesPage] Fetching fresh data...
[SalesPage] Failed to load data: {"message":"Load timeout"}
```

### 2. Redundant Visibility Handlers
Every page has its own `visibilitychange` listener:
- SalesPage, ProjectsPage, DashboardPage, etc.
- When user navigates BETWEEN pages, component unmounts/remounts
- This creates unpredictable load behavior

### 3. Session Validation Blocks Data Loading
In SalesPage loadData():
```js
const sessionValid = await ensureValidSession();  // Can hang on slow network
```
This call makes a network request BEFORE any data is fetched. On slow network after resume, this can timeout.

### 4. Memory Cache Cleared on Every Startup
In AuthContext:
```js
clearAllCache()  // Runs on every native app startup
```
This defeats the purpose of caching since cache is empty on resume.

### 5. No Cancellation of In-Flight Requests
When user navigates away while data is loading:
- Old component unmounts but fetch continues
- New component mounts and starts new fetch
- Multiple concurrent requests = resource contention

## Solution Architecture

### Principle: Single Source of Truth for Session State
1. **AuthContext** is the ONLY component that handles session refresh on visibility/resume
2. Pages should ONLY react to auth state changes, NOT visibility changes
3. Data loading should be gated by `authLoading` being false

### Implementation Plan

#### Phase 1: Remove Page-Level Visibility Handlers
Pages should NOT listen to `visibilitychange`. Instead:
- Use `useEffect([profile?.company_id, authLoading])` 
- Only load when `!authLoading && profile?.company_id`

#### Phase 2: Add Session Ready Signal
Add to AuthContext:
- `isSessionStable: boolean` - true when session is confirmed valid
- Pages wait for this before API calls

#### Phase 3: Fix Cache Clearing
- Don't clear cache on startup
- Only clear cache on explicit logout
- Let stale cache be refreshed naturally

#### Phase 4: Add Request Cancellation  
Use AbortController for all API calls:
```js
const controller = new AbortController();
useEffect(() => () => controller.abort(), []); // Cleanup on unmount
```

## Quick Fix (Immediate)
1. Remove visibility handlers from pages
2. Increase coordination between auth and pages
3. Don't block data loading on session validation - do it in parallel
