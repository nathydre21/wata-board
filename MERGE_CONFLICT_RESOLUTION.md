# Merge Conflict Resolution Guide

## Current Status
The repository is currently clean with no active merge conflicts. However, here's the complete workflow for resolving merge conflicts using command line and text editor.

## Step-by-Step Conflict Resolution Process

### 1. Identify Conflicts
```bash
# Check git status for conflicts
git status

# Look for files marked as "both modified"
# Files with conflicts will be listed under "Unmerged paths"
```

### 2. View Conflict Markers
When conflicts exist, files will contain markers like:
```
<<<<<<< HEAD
// Your changes
=======
// Incoming changes from the branch being merged
>>>>>>> branch-name
```

### 3. Resolve Conflicts Manually

#### Using Command Line + Text Editor:

**Option A: Open each conflicted file in your editor**
```bash
# Open conflicted files one by one
code wata-board-frontend/src/App.tsx
code wata-board-dapp/src/server.ts
# ... etc for each conflicted file
```

**Option B: Use git to open conflicted files**
```bash
# Open all conflicted files
git diff --name-only --diff-filter=U | xargs code

# Or open them one by one
git edit wata-board-frontend/src/App.tsx
```

### 4. Manual Resolution Process

For each conflicted file:

1. **Remove conflict markers** (`<<<<<<<`, `=======`, `>>>>>>>`)
2. **Choose the correct code** or **combine both versions**
3. **Save the file**

#### Example Conflict Resolution:

**Before:**
```typescript
<<<<<<< HEAD
import { usePaymentWithRateLimit } from './hooks/useRateLimit';
import { getCurrentNetworkConfig } from './utils/network-config';
=======
import { usePaymentWithRateLimit } from './hooks/useRateLimit';
>>>>>>> main
```

**After (resolved):**
```typescript
import { usePaymentWithRateLimit } from './hooks/useRateLimit';
import { getCurrentNetworkConfig } from './utils/network-config';
```

### 5. Mark Conflicts as Resolved
```bash
# Mark specific file as resolved
git add wata-board-frontend/src/App.tsx

# Mark all resolved files
git add .

# Check status - should show "Changes to be committed"
git status
```

### 6. Complete the Merge
```bash
# Complete the merge
git commit

# The commit message will be auto-generated with "Merge branch 'branch-name'"
```

### 7. Alternative Resolution Strategies

#### Accept Current Changes (HEAD):
```bash
git checkout --ours wata-board-frontend/src/App.tsx
git add wata-board-frontend/src/App.tsx
```

#### Accept Incoming Changes:
```bash
git checkout --theirs wata-board-frontend/src/App.tsx
git add wata-board-frontend/src/App.tsx
```

#### Accept All Current Changes:
```bash
git checkout --ours .
git add .
```

#### Accept All Incoming Changes:
```bash
git checkout --theirs .
git add .
```

### 8. Abort Merge (if needed)
```bash
# Cancel the entire merge and return to previous state
git merge --abort
```

## Specific Files That Might Need Resolution

Based on our changes, these files could potentially have conflicts:

### Frontend Files:
- `wata-board-frontend/src/App.tsx` - Import statements and hooks
- `wata-board-frontend/src/hooks/useRateLimit.ts` - Rate limiting logic
- `wata-board-frontend/src/services/api.ts` - API service integration

### Backend Files:
- `wata-board-dapp/src/server.ts` - Migration endpoints
- `wata-board-dapp/package.json` - Migration scripts
- `wata-board-dapp/src/payment-service.ts` - Payment service integration

### Contract Files:
- `wata-board-dapp/packages/nepa_client_v2/src/index.ts` - Contract client
- `wata-board-frontend/src/contracts/src/index.ts` - Frontend contracts

## Current Repository Status

✅ **No active conflicts** - All files are properly integrated
✅ **Clean working tree** - Ready for merge
✅ **Branch pushed** - Changes are in the forked repository

## Next Steps

1. If conflicts arise during PR creation, use the above process
2. Test the resolved changes before committing
3. Push the resolved changes to the forked repository
4. Update the PR with conflict resolutions

## Quick Reference Commands

```bash
# Check for conflicts
git status

# View conflicts in a file
git diff wata-board-frontend/src/App.tsx

# Open conflicted files
git diff --name-only --diff-filter=U | xargs code

# Mark as resolved
git add .

# Complete merge
git commit

# Abort if needed
git merge --abort
```
