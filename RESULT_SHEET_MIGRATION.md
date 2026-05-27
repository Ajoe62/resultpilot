# Result Sheet Template Migration Guide

## Overview

The application now uses a new comprehensive result sheet template that displays all subjects and assessment types for a student across a full term. The template matches the `resultpilot-sheet01.PNG` design with proper color coding and formatting.

## New Template Features

### 1. Header Section

- **School Name**: Pulled from school collection (Firestore)
- **School Contact**: Email + Phone (required fields during school onboarding)
- Professional blue gradient background

### 2. Student Information

- Name of Student
- Admission Number
- Section (Class)
- Term
- School Year (Academic Session)

### 3. Subject Scores Table

Displays all subjects with three assessment columns:

- **First Assessment (20%)**: Purple background
- **Second Assessment (20%)**: Blue background
- **Exam (60%)**: Yellow background
- **Total (100%)**: Yellow background with bold text

### 4. Optional Attendance Section

Displays per-term attendance data:

- Days of school
- Days attended
- Days absent

Only shown if attendance data is provided during export.

### 5. Overall Grade Section

- **Overall Grade**: Calculated as average of all subjects' total scores
- **Grade Letter**: A, B, C, D, or F based on grading scale

### 6. Notes Section

- Teacher comments for the student
- Only shown if notes are provided
- Stored at term level (one set per student per term)

### 7. Grading System Reference

Reference chart showing:

- A: 95-100 | A: 91-94
- B: 81-84 | B: 77-80
- C: 70-73 | C: 66-69
- D: 51-59
- F: 50

## Database Schema Updates

### School Collection (`/schools/{schoolId}`)

```javascript
{
  name: "Aretha Sage Academy",
  address: "School Address",
  email: "info@school.edu",        // NEW - Required
  phone: "+1 (555) 000-0000",      // NEW - Required
  isActive: true,
  createdAt: timestamp
}
```

### Term Notes Collection (`/termNotes/{termKey}`)

```javascript
{
  studentId: "student-uuid",
  schoolId: "school-uuid",
  classId: "class-uuid",
  academicSession: "2025/2026",
  term: "First Term",
  notes: "Devonte is a bright and engaged student...",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Note**: Term key format = `{studentId}_{schoolId}_{classId}_{academicSession}_{term}`

### Result Collection Enhancement

If storing `assessmentType` on results (recommended):

```javascript
{
  studentId: "...",
  subject: "Math",
  assessmentType: "first_assessment" | "second_assessment" | "exam",
  score: 41,
  total: 60,
  percentage: 68.3,
  passed: true,
  ...existing fields
}
```

## API Usage

### New Export Functions

#### `buildTermResultSheetModel(studentData, subjectResults, schoolData, termNotes, attendance)`

Builds the data model for the new term result sheet.

**Parameters:**

- `studentData`: Object with `studentName`, `admissionNumber`, `className`, `term`, `academicSession`
- `subjectResults`: Array of subject result objects with `subject`, `firstAssessment`, `secondAssessment`, `exam`, `totalScore`
- `schoolData`: Object with `name`, `email`, `phone` (optional)
- `termNotes`: String with teacher comments (optional)
- `attendance`: Object with `daysOfSchool`, `daysAttended`, `daysAbsent` (optional)

**Returns:** Model object ready for HTML generation

```javascript
const model = buildTermResultSheetModel(
  {
    studentName: "Joseph Akharume",
    admissionNumber: "ADM-001",
    className: "2025/2026",
    term: "First Term",
    academicSession: "2025/2026",
  },
  [
    {
      subject: "Math",
      firstAssessment: 10,
      secondAssessment: 16,
      exam: 41,
      totalScore: 67,
    },
    {
      subject: "Physics",
      firstAssessment: 18,
      secondAssessment: 18,
      exam: 58,
      totalScore: 94,
    },
  ],
  {
    name: "Aretha Sage Academy",
    email: "apple@arethasageacademy.com",
    phone: "+1 234 567 8900",
  },
  "Devonte is a bright and engaged student...",
  { daysOfSchool: 110, daysAttended: 98, daysAbsent: 12 },
);
```

#### `buildTermResultSheetHtml(studentData, subjectResults, schoolData, termNotes, attendance)`

Generates the complete HTML document for PDF/DOC export.

```javascript
const html = buildTermResultSheetHtml(
  studentData,
  subjectResults,
  schoolData,
  termNotes,
  attendance,
);

// Use in print window or blob for download
```

### Helper Functions

#### `consolidateResultsBySubject(results)`

Consolidates individual exam results into subjects with all assessments.

**Input:**

```javascript
[
  { subject: "Math", assessmentType: "first_assessment", score: 10 },
  { subject: "Math", assessmentType: "second_assessment", score: 16 },
  { subject: "Math", assessmentType: "exam", score: 41 },
];
```

**Output:**

```javascript
[
  {
    subject: "Math",
    first_assessment: 10,
    second_assessment: 16,
    exam: 41,
    totalScore: 67,
  },
];
```

#### `getSubjectResultsByTermKey(results, studentId, schoolId, classId, academicSession, term)`

Filters and consolidates results for a specific student and term.

```javascript
const termResults = getSubjectResultsByTermKey(
  allResults,
  "student-uuid",
  "school-uuid",
  "class-uuid",
  "2025/2026",
  "First Term",
);
```

## Migration Checklist

- [ ] Update school onboarding form to include email and phone fields
- [ ] Add email/phone as required fields in school Firestore document
- [ ] Create termNotes collection in Firestore
- [ ] Add attendance input UI to Results Dashboard export dialog
- [ ] Update all result export calls to pass new parameters
- [ ] Add security rules for termNotes collection (admin write, read)
- [ ] Test PDF export with all features
- [ ] Test DOC export with all features
- [ ] Test CSV export (ensure consolidation works)
- [ ] Verify prevention of duplicate exam attempts per type
- [ ] Update backup/export processes if needed

## Usage in Admin Dashboard

### Example: Export Term Result with All Data

```javascript
import { buildTermResultSheetHtml } from "../../lib/resultSheetData";
import { downloadResultDoc, printResultPdf } from "../../lib/resultExports";

// In export handler
const subjectResults = getSubjectResultsByTermKey(
  allResults,
  student.id,
  student.schoolId,
  student.classId,
  filters.academicSession,
  filters.term,
);

const schoolData = schoolsMap.get(student.schoolId);
const termNotes = termNotesMap.get(`${student.id}_${filters.term}`);
const attendance = manualAttendance[student.id]; // From user input

const html = buildTermResultSheetHtml(
  {
    studentName: student.fullName,
    admissionNumber: student.admissionNumber,
    className: student.className,
    term: filters.term,
    academicSession: filters.academicSession,
  },
  subjectResults,
  schoolData,
  termNotes?.notes || "",
  attendance || {},
);

// Generate PDF or DOC
```

## Backward Compatibility

The old `buildTermResultSheetHtml` from `termResultData.js` remains unchanged for backward compatibility. The new template is:

- `buildTermResultSheetHtml()` in `resultSheetData.js` (NEW)
- Old template: `buildTermResultSheetHtml()` in `termResultData.js` (DEPRECATED but functional)

## Color Scheme Reference

| Element                | Color         | Hex     |
| ---------------------- | ------------- | ------- |
| Header Background      | Dark Blue     | #001f3f |
| Header Gradient        | Blue          | #0a3f7b |
| First Assessment       | Indigo        | #6366f1 |
| Second Assessment      | Sky Blue      | #60a5fa |
| Exam (60%)             | Amber         | #fbbf24 |
| Total (100%)           | Light Yellow  | #fcd34d |
| Grade Box              | Indigo Border | #4f46e5 |
| Notes Background       | Light Indigo  | #e0e7ff |
| Grading Ref Background | Light Amber   | #fef3c7 |

## Troubleshooting

### Issue: School email/phone not showing

**Solution**: Ensure school documents have `email` and `phone` fields populated in Firestore.

### Issue: Attendance section not appearing

**Solution**: Attendance is only shown if `attendance.daysOfSchool` > 0. Pass attendance data to export function.

### Issue: Notes section not appearing

**Solution**: Notes only appear if `termNotes` string is non-empty. Ensure term notes are stored in database.

### Issue: Overall grade calculation seems wrong

**Solution**: Overall grade = sum(all subject totals) / number of subjects. Ensure subject totals are correct.
