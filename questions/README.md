# Question Banks - CSV Importer Guide

This directory contains pre-made question banks that you can import into your exams.

## Available Question Banks

| File               | Subject            | Questions | Topics                                             |
| ------------------ | ------------------ | --------- | -------------------------------------------------- |
| `html.csv`         | HTML               | 20        | HTML tags, attributes, semantics                   |
| `css.csv`          | CSS                | 20        | Selectors, properties, layout, animations          |
| `javascript.csv`   | JavaScript         | 20        | Variables, functions, arrays, DOM manipulation     |
| `git-github.csv`   | Git & GitHub       | 20        | Version control, branching, commits, collaboration |
| `comp-science.csv` | Computer Science   | 20        | CPU, RAM, Algorithms, Networks, Databases, AI      |
| `prompt.csv`       | Prompt Engineering | 20        | AI prompts, clarity, specificity, tone             |
| `scratch.csv`      | Scratch            | 20        | Sprites, blocks, events, loops                     |

## How to Import a Question Bank

### Step 1: Copy the CSV to Project Root

```bash
cp questions/comp-science.csv questions.csv
# Or for other subjects:
# cp questions/css.csv questions.csv
# cp questions/javascript.csv questions.csv
```

### Step 2: Create an Exam in the Admin UI

1. Go to Admin Dashboard → Manage Exams
2. Create a new exam with:
   - **Title:** e.g., "Computer Science Quiz"
   - **Subject:** e.g., "Computer Science"
   - **Academic Session:** e.g., "2025/2026"
   - **Term:** e.g., "First Term"
   - **Duration:** e.g., 30 minutes
   - **PIN:** e.g., 1234 (for student access)

3. **Note the Exam ID** - you'll see it in the URL or can copy it from the exam card

### Step 3: Import the Questions

Run the import script with your exam ID:

```bash
npm run questions:import -- --exam-id YOUR_EXAM_ID
```

Replace `YOUR_EXAM_ID` with the actual ID from Step 2.

### Step 4: Verify Import (Optional)

Test the import without actually saving:

```bash
npm run questions:import -- --exam-id YOUR_EXAM_ID --dry-run
```

## Examples

### Import Computer Science Questions

```bash
cp questions/comp-science.csv questions.csv
npm run questions:import -- --exam-id exam123
```

### Import CSS Questions

```bash
cp questions/css.csv questions.csv
npm run questions:import -- --exam-id exam456
```

### Import with Custom Service Account Path

```bash
npm run questions:import -- \
  --exam-id exam789 \
  --csv ./questions/javascript.csv \
  --service-account ./path/to/your/service-account.json
```

### Use One-Liner (Without Copying)

```bash
npm run questions:import -- \
  --exam-id exam123 \
  --csv ./questions/comp-science.csv
```

## Question Bank Details

### HTML (20 questions)

- HTML fundamentals
- Document structure
- Tags and attributes
- Forms and inputs
- Semantic HTML

### CSS (20 questions)

- CSS selectors
- Box model
- Flexbox and Grid
- Animations and transitions
- Responsive design

### JavaScript (20 questions)

- Variables and data types
- Functions and scope
- Arrays and objects
- DOM manipulation
- ES6+ features

### Git & GitHub (20 questions)

- Basic git commands
- Branching and merging
- Pull requests
- Collaboration workflows
- Conflict resolution

### Computer Science (20 questions)

- CPU and memory concepts
- Operating systems
- Data structures
- Algorithms
- Networking and security
- Databases
- AI and machine learning

### Prompt Engineering (20 questions)

- Prompt structure
- Clarity and specificity
- Context and examples
- AI capabilities and limitations
- Iterative refinement

### Scratch (20 questions)

- Sprite and stage concepts
- Block categories
- Event handling
- Loops and conditionals
- Broadcasting

## Important Notes

### All Question Banks Have 20 Questions

Each CSV file contains exactly 20 multiple-choice questions. The application now displays **all 20 questions** per exam (previously limited to 10).

### Question Format

Each CSV must have these columns:

- `questionText` - The question
- `optionA` - First option
- `optionB` - Second option
- `optionC` - Third option
- `optionD` - Fourth option
- `correctAnswer` - A, B, C, or D

### Preventing Duplicates

The importer will reject:

- Duplicate question text (within the same CSV)
- Exams that don't exist
- Invalid CSV format

### Multiple Exam Types Per Subject

You can create multiple exams for the same subject:

- "CSS Quiz - Beginner"
- "CSS Quiz - Advanced"

Then import the same CSV into each, or import different CSVs if you have variations.

## Troubleshooting

### Error: "Missing exam ID"

```bash
npm run questions:import -- --exam-id YOUR_EXAM_ID
```

Make sure you provide the exam ID from the admin UI.

### Error: "Missing service-account.json"

Download your Firebase service account key and place it in the project root, or use:

```bash
npm run questions:import -- --exam-id YOUR_EXAM_ID --service-account ./path/to/key.json
```

### Error: "CSV file not found"

Make sure you've copied the CSV to the project root as `questions.csv`, or use:

```bash
npm run questions:import -- --exam-id YOUR_EXAM_ID --csv ./questions/comp-science.csv
```

### Some Questions Didn't Import

Check the console for error messages. The importer stops at the first error. Fix any issues and re-run.

## Next Steps

1. **Select a subject** - Choose which question bank to import
2. **Copy the CSV** - Use the commands above
3. **Create the exam** - Add it in the Admin UI
4. **Import questions** - Run the import script
5. **Test with a student** - Have a student take the exam to verify all 20 questions appear

## Creating Custom Question Banks

To create your own question bank:

1. Create a new CSV file with the header:

   ```csv
   questionText,optionA,optionB,optionC,optionD,correctAnswer
   ```

2. Add 20 rows of questions

3. Save it in the `questions/` folder with a descriptive name

4. Import using the same process as above
