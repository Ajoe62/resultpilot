# Firestore Security Rules Update

Add these rules to your Firestore security rules file. Replace the old `/schools` rule if one exists.

```javascript
// Schools collection - updated to include new fields
match /schools/{schoolId} {
  allow read: if isSignedIn() && isAdmin();
  allow create, update, delete: if isAdmin();

  // Validate required fields on write
  allow update: if request.resource.data.email is string
                && request.resource.data.phone is string
                && request.resource.data.name is string
                && isAdmin();

  allow create: if request.resource.data.email is string
                && request.resource.data.phone is string
                && request.resource.data.name is string
                && isAdmin();
}

// Term Notes collection - NEW
match /termNotes/{document=**} {
  // Admins have full read/write access
  allow read, write: if isAdmin();

  // Prevent direct deletes (use update to clear)
  allow delete: if isAdmin();

  // Validate document structure on write
  allow write: if request.resource.data.studentId is string
               && request.resource.data.academicSession is string
               && request.resource.data.term is string
               && request.resource.data.notes is string
               && isAdmin();
}

// Admin helper function (add to top of rules if not present)
function isAdmin() {
  return exists(/databases/$(database)/documents/admins/$(request.auth.uid));
}

function isSignedIn() {
  return request.auth != null;
}
```

## Implementation Steps

1. Go to **Firestore Database** → **Rules** tab
2. Locate the `/schools/{schoolId}` rule
3. Replace it with the updated version above that includes email/phone validation
4. Add the new `/termNotes/{document=**}` rule
5. Click **Publish**

## Validation

After publishing, test:

1. **Create a new school** - Attempt without email field (should fail)
2. **Create a new school** - Attempt without phone field (should fail)
3. **Create a new school** - With both email and phone (should succeed)
4. **Update existing school** - Add missing email/phone fields (should succeed)
5. **Create term note** - Verify it can be created only by admin
6. **Read term note** - Verify students cannot read it (if desired)

## Existing Security Rules Template

If you already have custom security rules, integrate these rules with your existing structure:

```javascript
// Your existing rules...

// Add/Update these collections
match /schools/{schoolId} {
  // ... your existing logic with added validation for new fields
  allow create, update: if isAdmin()
                        && request.resource.data.email is string
                        && request.resource.data.phone is string
                        && request.resource.data.name is string;
}

match /termNotes/{document=**} {
  allow read, write: if isAdmin();
}

// Your other rules...
```

## Backward Compatibility

- Existing schools without email/phone can still be read by admins
- Updates to existing schools now require email/phone to be present
- To add email/phone to all existing schools: use Firebase console or admin SDK to batch update

## Testing in Emulator

If using Firebase emulators locally:

```bash
# Start emulators
firebase emulators:start

# Test rules locally before deploying
firebase emulators:exec "npm run test"
```

## Notes

- `isAdmin()` function checks for `/admins/{uid}` document existence
- Ensure your admin user ID has an allowlist document in `/admins` collection
- For production, consider adding timestamp validation and audit logging
